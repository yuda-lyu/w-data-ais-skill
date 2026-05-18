// shareFile.mjs — 用 Playwright 將檔案上傳到 Wormhole.app，取得一次性 24h 過期連結
//
// 對外匯出：
//   shareFile(filePath, options?) → Promise<{ status, url, fileName, sizeBytes, maxDownloads, expiration, fetchedAt }>
//
// 預設行為：max-downloads = 1（一次性），expiration = 24 小時（Wormhole 標準模式上限）
// 檔案上限：5 GB（Wormhole 標準模式邊界；超過需走 P2P 模式，但 P2P 需寄件方瀏覽器持續開啟，
//          不符合本技能「上傳完即關閉」設計，故拒絕）

import fs from 'node:fs'
import path from 'node:path'

const WORMHOLE_URL = 'https://wormhole.app/'
const FIVE_GB = 5 * 1024 * 1024 * 1024
const DEFAULT_NAV_TIMEOUT_MS = 30000
const DEFAULT_UPLOAD_TIMEOUT_MS = 600000  // 10 分鐘；大檔案 + 慢網路可調高
const POLL_INTERVAL_MS = 500

const VALID_EXPIRATIONS = {
    '1h': '60 分鐘後',
    '60min': '60 分鐘後',
    '2h': '2 小時後',
    '6h': '6 小時後',
    '12h': '12 小時後',
    '24h': '24 小時後',
}
const VALID_MAX_DOWNLOADS = [1, 5, 10, 20, 50, 100]

function _ts() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function _loadChromium() {
    try {
        const m = await import('playwright')
        return m.chromium
    } catch (err) {
        throw new Error('playwright not installed (npm install playwright)')
    }
}

/**
 * 上傳檔案至 Wormhole.app 並回傳一次性連結
 * @param {string} filePath - 要上傳的檔案絕對或相對路徑
 * @param {object} [options]
 * @param {number} [options.maxDownloads=1] - 最大下載次數（1, 5, 10, 20, 50, 100）
 * @param {string} [options.expiration='24h'] - 過期時間（'1h', '2h', '6h', '12h', '24h'），預設 24h（站方最大）
 * @param {boolean} [options.headless=true] - 是否無頭模式（預設 true，自動關閉節省資源）
 * @param {string} [options.chromeChannel='chrome'] - playwright launch channel
 * @param {number} [options.uploadTimeoutMs=600000] - 上傳完成等待 timeout（毫秒），預設 10 分鐘
 * @returns {Promise<object>} { status, url, fileName, sizeBytes, maxDownloads, expiration, fetchedAt }
 */
export async function shareFile(filePath, options = {}) {
    const fetchedAt = _ts()

    if (!filePath || typeof filePath !== 'string') {
        return { status: 'error', message: 'filePath 必須是字串路徑', reason: 'invalid-input', fetchedAt }
    }
    if (!fs.existsSync(filePath)) {
        return { status: 'error', message: `檔案不存在: ${filePath}`, reason: 'file-not-found', fetchedAt }
    }
    const st = fs.lstatSync(filePath)
    if (!st.isFile()) {
        return { status: 'error', message: `路徑不是檔案 (資料夾/symlink/其他): ${filePath}`, reason: 'not-a-file', fetchedAt }
    }
    if (st.size >= FIVE_GB) {
        const gb = (st.size / (1024 ** 3)).toFixed(2)
        return {
            status: 'error',
            message: `檔案過大 (${gb} GB ≥ 5 GB)，超過 Wormhole 標準模式上限；如需傳更大檔案請改用 P2P 模式（需手動操作、寄件方需保持瀏覽器開啟）`,
            reason: 'too-large',
            sizeBytes: st.size,
            fileName: path.basename(filePath),
            fetchedAt,
        }
    }
    if (st.size === 0) {
        return { status: 'error', message: `檔案為空 (0 bytes): ${filePath}`, reason: 'empty-file', fetchedAt }
    }

    const maxDownloads = options.maxDownloads ?? 1
    if (!VALID_MAX_DOWNLOADS.includes(maxDownloads)) {
        return {
            status: 'error',
            message: `maxDownloads 必須是 ${VALID_MAX_DOWNLOADS.join(' / ')} 之一，得到: ${maxDownloads}`,
            reason: 'invalid-max-downloads',
            fetchedAt,
        }
    }
    const expirationKey = options.expiration ?? '24h'
    const expirationLabel = VALID_EXPIRATIONS[expirationKey]
    if (!expirationLabel) {
        return {
            status: 'error',
            message: `expiration 必須是 ${Object.keys(VALID_EXPIRATIONS).join(' / ')} 之一，得到: ${expirationKey}`,
            reason: 'invalid-expiration',
            fetchedAt,
        }
    }

    const headless = options.headless ?? true
    const chromeChannel = options.chromeChannel ?? 'chrome'
    const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS
    const uploadTimeout = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS

    const maxDownloadsLabel = `${maxDownloads} 下載`

    let chromium
    try { chromium = await _loadChromium() }
    catch (err) {
        return { status: 'error', message: err.message, reason: 'missing-deps', fetchedAt }
    }

    let browser = null
    try {
        browser = await chromium.launch({ headless, channel: chromeChannel })
        const ctx = await browser.newContext({ locale: 'zh-TW' })
        const page = await ctx.newPage()

        await page.goto(WORMHOLE_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout })

        // 等 file input 出現（站方 SPA 載入）
        await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 })

        // 上傳檔案
        await page.locator('input[type="file"]').first().setInputFiles(path.resolve(filePath))

        // 等上傳完成：input.chakra-input 出現 wormhole.app URL
        await page.waitForFunction(() => {
            const inputs = document.querySelectorAll('input.chakra-input')
            for (const i of inputs) {
                if (i.value && /^https:\/\/wormhole\.app\//.test(i.value)) return true
            }
            return false
        }, null, { timeout: uploadTimeout, polling: POLL_INTERVAL_MS })

        // 設定過期時間：找含「24 小時後」option 的 select
        const expirSelect = page.locator(`select:has(option:has-text("${expirationLabel}"))`).first()
        const expirCount = await expirSelect.count()
        if (expirCount > 0) {
            await expirSelect.selectOption({ label: expirationLabel })
        } else {
            throw new Error(`找不到過期時間 select (期望含「${expirationLabel}」option)`)
        }

        // 設定下載次數：找含「1 下載」option 的 select
        const dlSelect = page.locator(`select:has(option:has-text("${maxDownloadsLabel}"))`).first()
        const dlCount = await dlSelect.count()
        if (dlCount > 0) {
            await dlSelect.selectOption({ label: maxDownloadsLabel })
        } else {
            throw new Error(`找不到下載次數 select (期望含「${maxDownloadsLabel}」option)`)
        }

        // 設定後讓 UI settle，再讀取最終 link
        await page.waitForTimeout(1500)
        const url = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input.chakra-input')
            for (const i of inputs) {
                if (i.value && /^https:\/\/wormhole\.app\//.test(i.value)) return i.value
            }
            return null
        })
        if (!url) throw new Error('未取得 Wormhole 連結（input 為空）')

        // 驗證 select 真的被設到
        const actualSettings = await page.evaluate(() => {
            const selects = document.querySelectorAll('select')
            return Array.from(selects).map(s => {
                const sel = s.options[s.selectedIndex]
                return sel ? sel.text : null
            })
        })

        return {
            status: 'success',
            url,
            fileName: path.basename(filePath),
            sizeBytes: st.size,
            maxDownloads,
            expiration: expirationKey,
            actualSelectOptions: actualSettings,
            fetchedAt,
        }
    } catch (err) {
        return {
            status: 'error',
            message: err.message || String(err),
            reason: 'playwright-error',
            fileName: path.basename(filePath),
            sizeBytes: st.size,
            fetchedAt,
        }
    } finally {
        // 上傳完即關閉，釋放系統資源（≤5GB 雲端模式，server 保存 24h，可安心關）
        if (browser) await browser.close().catch(() => { /* noop */ })
    }
}

export default shareFile
