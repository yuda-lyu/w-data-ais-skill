// downloadBaiduPdf.mjs — 用 Playwright + 本機 Chrome 把「百度網盤分享的 PDF（文件預覽）」逐頁抓圖併為本機 PDF
//
// 對外匯出 downloadBaiduPdf(url, options?) → { status, outputPath?, totalPages?, ..., reason? }
//
// 核心策略（為什麼非用 Playwright + 活著的瀏覽器 session 不可）：
//   百度對「文件類」分享提供逐頁圖片預覽，端點為
//     https://cdndoc.pcs.baidu.com/rest/2.0/docview/doc?datatype=pic&...&pagenum=N
//   同一檔案所有頁共用一組簽章（sign / timestamp / object / fid，約 3 小時有效、IP 綁定），
//   只差 pagenum。這個帶簽章的圖片 URL 是「載入預覽頁時由前端 JS 動態產生並以圖片請求發出」的，
//   不在靜態 HTML 裡——必須用真實瀏覽器把預覽頁跑起來、攔截網路請求才拿得到。原始 PDF 下載又被
//   百度的「安裝客戶端」牆擋住，故改走預覽路徑：攔到簽章 URL 後，在同一個還活著的 context 內
//   （cookie 自動帶、IP 一致）併發抓全部頁，再用 pdfkit 逐頁合併。
//
// 定位與登入（經實測判定，2026-05）：
//   本技能**僅服務「免登入可預覽」的公開文件分享**——實測拋棄式 headless Chrome、無 profile、
//   未登入即可攔到 datatype=pic 簽章 URL 並渲染完整預覽、組出 PDF。故全程走全自動免登入路徑：
//   拋棄式本機 Chrome（chromium.launch + channel:'chrome'），不建 user_data、不需登入、不需桌面視窗。
//   **不提供任何登入功能**：需登入/提取碼/已失效的分享一律回 preview-not-found（不在本技能範圍）。
//
// 借鏡技能庫既有瀏覽器技能（累積的開啟/重試經驗）：
//   - channel:'chrome'（用系統 Chrome，免下載 Chromium）              ← fetch-web-by-playwright-*
//   - missing-deps 用 try{import}catch 優雅回報                        ← 全庫慣例
//   - 開啟/導航 transient 失敗才重試 + 線性退避；已分類錯誤不重試      ← fetch-web-by-playwright-*
//   - 反自動化：--disable-blink-features=AutomationControlled
//     + addInitScript 隱藏 navigator.webdriver                         ← fetch-web-by-playwright-head
//   - page.on('request') 網路攔截                                       ← fetch-youtube-transcript
//   - browser.close() 放 finally，例外也釋放資源                        ← 全庫慣例
//
// 注意：產出為「圖片式 PDF」（每頁是頁面圖片）。來源若為掃描書（無內嵌文字），合併後不可搜尋，需另行 OCR。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 各技能各自管理自己的臨時/輸出檔：預設落在「技能自身目錄」下的 tmp/（場景 B：套件自帶輸出，
// 用 fileURLToPath 取模組路徑——絕不用 new URL().pathname；不寫到 cwd / 技能庫根目錄，
// 也不會因被別人 install 而跑位）。scripts/ 的上一層即技能根目錄 download-baidu-pdf/。
const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DEFAULT_OUT_DIR = path.join(SKILL_DIR, 'tmp')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const PIC_RE = /cdndoc.*docview\/doc.*datatype=pic/
const DEFAULT_CONCURRENCY = 5
const DEFAULT_NAV_TIMEOUT_MS = 30000
const DEFAULT_SIGNATURE_WAIT_MS = 45000
const DEFAULT_POLL_INTERVAL_MS = 2000
const MAX_LAUNCH_RETRIES = 2          // 含初始最多 3 次（僅 transient 開啟/導航例外才重試）
const LAUNCH_BACKOFF_MS = 3000        // 線性退避基數：3s → 6s
const PAGE_FETCH_ATTEMPTS = 4         // 每頁抓取嘗試次數

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function _ts() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 只接受百度網盤分享頁（/s/<token> 或 /link/.../<token>）
function _isBaiduShareUrl(url) {
    if (!url || typeof url !== 'string') return false
    try {
        const u = new URL(url)
        if (!/(^|\.)pan\.baidu\.com$/.test(u.hostname)) return false
        return /^\/(s\/|link\/)/.test(u.pathname)
    } catch {
        return false
    }
}

// 把 JPEG 二進位解析出寬高（避免依賴 sharp）：掃描到 SOF 標記讀 height/width
function jpegSize(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('非 JPEG')
    let i = 2
    while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        // SOF0..SOF15（C0-CF），排除非 SOF 的 DHT(C4)/JPG(C8)/DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const height = buf.readUInt16BE(i + 5)
            const width = buf.readUInt16BE(i + 7)
            return { width, height }
        }
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
        const len = buf.readUInt16BE(i + 2)
        i += 2 + len
    }
    throw new Error('找不到 JPEG SOF 標記')
}

// 檔名清理：Windows 不合法字元轉全形、去常見百度標題後綴、確保 .pdf 副檔名
function sanitizeFilename(name) {
    const map = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' }
    let s = String(name)
    for (const suffix of ['_免费高速下载', '_免費高速下載', '_百度网盘', '_百度網盤', '-分享无限制', '-分享無限制']) {
        const idx = s.indexOf(suffix)
        if (idx >= 0) s = s.slice(0, idx)
    }
    s = s.replace(/[\\/:*?"<>|]/g, (c) => map[c] || '_').trim()
    if (!s) s = 'baidu-doc'
    if (!/\.pdf$/i.test(s)) s += '.pdf'
    return s
}

async function _loadDeps() {
    let chromium, PDFDocument
    try {
        ({ chromium } = await import('playwright'))
    } catch {
        throw Object.assign(new Error('playwright 未安裝（npm install playwright）'), { reason: 'missing-deps' })
    }
    try {
        PDFDocument = (await import('pdfkit')).default
    } catch {
        throw Object.assign(new Error('pdfkit 未安裝（npm install pdfkit）'), { reason: 'missing-deps' })
    }
    return { chromium, PDFDocument }
}

// 開拋棄式本機 Chrome（無 profile、不登入），回傳 { browser, context, page }
async function _openBrowser(chromium, { headless, chromeChannel }) {
    const browser = await chromium.launch({
        headless,
        channel: chromeChannel,
        args: ['--disable-blink-features=AutomationControlled', '--mute-audio'],
    })
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 } })
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    const page = await context.newPage()
    return { browser, context, page }
}

// 從整頁 innerText 收緊解析「X/Y」頁碼指示，回傳總頁數 Y 或 null。
// 抽成獨立純函式（不依賴 DOM／瀏覽器）以便單元測試；亦由瀏覽器內 evaluate 字串化重建後共用同套邏輯。
// 收緊原因：舊版 fallback 對整頁文字做無 /g 的 .match()，取第一個出現的「數字/數字」，
// 但使用者文件正文常見「2024/05」「比例 3/4」「N/M 引用」等雜訊，會早於真正頁碼指示被取到，
// 設成錯誤總頁數 → 抓圖截斷 → 靜默產出缺頁 PDF。改為掃出全部候選後做合理性過濾再挑選。
function _parsePagerTotalFromText(txt) {
    if (!txt) return null
    // 1) 先試錨定模式（具體 pager 文字「下一页／上一页」），最可靠，命中即回。
    let am = txt.match(/\/\s*(\d{1,6})\s*下一[页頁]/) || txt.match(/上一[页頁]\s*\/\s*(\d{1,6})/)
    if (am) {
        const y = parseInt(am[1], 10)
        if (y > 1) return y
    }
    // 2) fallback：掃出整頁所有「X/Y」候選（用 /g 取全部，不再只取第一個）。
    const cands = []
    const re = /(\d{1,6})\s*\/\s*(\d{1,6})/g
    let g
    while ((g = re.exec(txt)) !== null) {
        const x = parseInt(g[1], 10)
        const y = parseInt(g[2], 10)
        // 合理性檢查（兩段）：
        //  (a) 基本：頁碼指示的分子（目前頁）應 <= 分母（總頁數），且總頁數 > 1；
        //      濾掉「2024/05」「03/27」這類分子>分母的日期雜訊。
        //  (b) 嚴格：偵測時機是預覽剛載入、停在第 1 頁，真頁碼指示必為「1/Y」，
        //      故只收 x===1 的候選。這可進一步擋掉「比例 3/4」「3/27」等
        //      雖 x<=y 但分子非 1 的正文雜訊（單靠 x<=y 無法分辨）。
        if (x === 1 && x <= y && y > 1) cands.push({ x, y })
    }
    if (cands.length === 0) return null
    // 合格候選（皆為 1/Y 形態）中取 Y 最大者當總頁數。
    cands.sort((a, b) => b.y - a.y)
    return cands[0].y
}

// 偵測總頁數：manual > DOM 頁碼指示「X/Y」（收緊過正文雜訊）> 網路參數 pageAll/page_num（>0，避開 method=info 回的 0）
async function _detectTotal(page, reqs, manual) {
    if (manual) return manual
    // 把純解析邏輯字串化注入瀏覽器執行（與 _parsePagerTotalFromText 同套規則，單元測試覆蓋此邏輯）。
    const domTotal = await page.evaluate((fnSrc) => {
        const txt = document.body ? document.body.innerText : ''
        // eslint-disable-next-line no-new-func
        const parse = new Function('return (' + fnSrc + ')')()
        return parse(txt)
    }, _parsePagerTotalFromText.toString()).catch(() => null)
    if (domTotal && domTotal > 1) return domTotal
    for (const u of reqs) {
        const m = u.match(/[?&](?:pageAll|page_num)=(\d+)/)
        if (m && +m[1] > 0) return +m[1]
    }
    return null
}

// 導向分享頁、攔截網路請求，輪詢取得：帶簽章的頁圖 URL（base）、總頁數、檔名。
async function _captureSignature(page, reqs, { url, navTimeout, signatureWaitMs, pollIntervalMs, manualPages }) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout })
    let base = null, total = null, filename = null
    const deadline = Date.now() + signatureWaitMs
    while (Date.now() < deadline) {
        if (!base) {
            for (const u of reqs) { if (PIC_RE.test(u)) { base = u.replace(/&pagenum=\d+/, ''); break } }
        }
        if (!filename) { const t = await page.title().catch(() => ''); if (t) filename = t }
        if (!total) total = await _detectTotal(page, reqs, manualPages)
        if (base && total) break
        await sleep(pollIntervalMs)
    }
    return { base, total, filename }
}

/**
 * 把百度網盤分享的「免登入公開」PDF（文件預覽）逐頁抓圖併為本機 PDF
 * @param {string} url - 百度分享網址（支援 /s/<token> 與 /link/.../<token>）
 * @param {object} [options]
 * @param {string} [options.output] - 輸出 PDF 檔名（未指定則用分享頁標題自動命名）
 * @param {string} [options.outDir] - 輸出目錄（預設技能自身目錄下的 tmp/，即 download-baidu-pdf/tmp）
 * @param {number} [options.concurrency=5] - 併發抓圖數（過高易被限速）
 * @param {number} [options.pages] - 手動指定總頁數（自動偵測失敗時用）
 * @param {boolean} [options.keepPages=false] - 是否保留逐頁 JPEG 暫存（預設 false：組裝完成後刪除；設 true 保留供續傳/OCR）
 * @param {boolean} [options.headless=true] - 是否無頭（預設 true；設 false 供 debug）
 * @param {string} [options.chromeChannel='chrome'] - playwright launch channel
 * @param {number} [options.navigationTimeoutMs=30000]
 * @param {number} [options.signatureWaitMs=45000] - 等預覽載入/取得簽章的 timeout
 * @returns {Promise<object>} { status, url, outputPath?, fileName?, totalPages?, sizeBytes?, pagesDir?, keptPages?, fetchedAt, message?, reason? }
 */
export async function downloadBaiduPdf(url, options = {}) {
    const fetchedAt = _ts()
    const log = (...a) => process.stderr.write(`[download-baidu-pdf] ${new Date().toISOString().slice(11, 19)} ${a.join(' ')}\n`)

    if (!_isBaiduShareUrl(url)) {
        return { status: 'error', url: String(url), message: '不是有效的百度網盤分享網址（需 pan.baidu.com/s/... 或 /link/...）', reason: 'invalid-url', fetchedAt }
    }

    let chromium, PDFDocument
    try {
        ({ chromium, PDFDocument } = await _loadDeps())
    } catch (err) {
        return { status: 'error', url, message: err.message, reason: err.reason || 'missing-deps', fetchedAt }
    }

    const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR)
    const concurrency = Math.max(1, options.concurrency || DEFAULT_CONCURRENCY)
    const manualPages = options.pages || null
    const keepPages = options.keepPages === true
    const headless = options.headless !== false
    const chromeChannel = options.chromeChannel || 'chrome'
    const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS
    const signatureWaitMs = options.signatureWaitMs ?? DEFAULT_SIGNATURE_WAIT_MS
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

    let browser = null, context = null
    try {
        // ── 1) 開拋棄式瀏覽器 + 攔截，取得簽章 URL / 總頁數 / 檔名（transient 失敗線性退避重試）──
        let cap = null
        for (let attempt = 1; attempt <= MAX_LAUNCH_RETRIES + 1; attempt++) {
            try {
                log(`開啟瀏覽器（headless=${headless}）並導向分享頁...`)
                const opened = await _openBrowser(chromium, { headless, chromeChannel })
                browser = opened.browser; context = opened.context
                const page = opened.page
                const reqs = []
                page.on('request', (req) => reqs.push(req.url()))
                cap = await _captureSignature(page, reqs, { url, navTimeout, signatureWaitMs, pollIntervalMs, manualPages })
                break
            } catch (err) {
                if (browser) { await browser.close().catch(() => {}); browser = null; context = null }
                if (attempt <= MAX_LAUNCH_RETRIES) {
                    const w = LAUNCH_BACKOFF_MS * attempt
                    log(`開啟/導航失敗：${err.message}，等 ${w}ms 後重試 (${attempt}/${MAX_LAUNCH_RETRIES})`)
                    await sleep(w)
                    continue
                }
                throw err
            }
        }

        if (!cap.base) {
            return {
                status: 'error', url,
                message: '找不到預覽頁圖簽章 URL：可能不是文件類預覽（如影片/壓縮檔）、分享需登入或提取碼、或分享已失效。本技能僅支援「免登入可預覽」的公開文件分享。',
                reason: 'preview-not-found', fetchedAt,
            }
        }
        if (!cap.total) {
            return { status: 'error', url, message: '抓不到總頁數，請用 pages 選項手動指定（CLI: --pages <n>）', reason: 'total-pages-unknown', fetchedAt }
        }
        const { base, total, filename } = cap

        const outName = sanitizeFilename(options.output || filename || 'baidu-doc.pdf')
        const outPdf = path.resolve(outDir, outName)
        const slug = outName.replace(/\.pdf$/i, '').replace(/[^\w一-龥]+/g, '').slice(0, 24) || 'doc'
        const pagesDir = path.resolve(outDir, '.pages_' + slug)
        fs.mkdirSync(pagesDir, { recursive: true })
        log(`解析成功：檔名「${outName}」，共 ${total} 頁，暫存於 ${pagesDir}`)

        // ── 2) 併發抓取每一頁（context.request 自動帶 cookie；含重試與磁碟快取，可續傳）──
        const dest = (pg) => path.join(pagesDir, String(pg).padStart(4, '0') + '.jpg')
        const isCachedJpeg = (d) => {
            if (!fs.existsSync(d) || fs.statSync(d).size <= 3000) return false
            const b = fs.readFileSync(d)
            return b[0] === 0xff && b[1] === 0xd8
        }
        async function fetchPage(pg) {
            const d = dest(pg)
            if (isCachedJpeg(d)) return { ok: true }
            for (let a = 1; a <= PAGE_FETCH_ATTEMPTS; a++) {
                try {
                    const res = await context.request.get(`${base}&pagenum=${pg}`, {
                        headers: { Referer: 'https://pan.baidu.com/', 'User-Agent': UA },
                        timeout: 30000,
                    })
                    if (!res.ok()) throw new Error('HTTP ' + res.status())
                    const buf = Buffer.from(await res.body())
                    if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('非 JPEG（len=' + buf.length + '）')
                    fs.writeFileSync(d, buf)
                    return { ok: true }
                } catch (e) {
                    if (a === PAGE_FETCH_ATTEMPTS) return { ok: false, err: e.message }
                    await sleep(500 * a)
                }
            }
        }

        const queue = Array.from({ length: total }, (_, i) => i + 1)
        let done = 0
        const failed = []
        async function worker() {
            while (queue.length) {
                const pg = queue.shift()
                const r = await fetchPage(pg)
                done++
                if (!r.ok) failed.push(pg)
                if (done % 20 === 0 || done === total) log(`抓圖 ${done}/${total}，失敗 ${failed.length}`)
            }
        }
        await Promise.all(Array.from({ length: concurrency }, worker))

        if (failed.length) { // 最後重試一輪
            log('重試失敗頁：' + failed.join(','))
            const retry = failed.splice(0)
            for (const pg of retry) { const r = await fetchPage(pg); if (!r.ok) failed.push(pg) }
        }
        if (failed.length) {
            return {
                status: 'error', url,
                message: `以下頁面抓取失敗（簽章可能已過期，重新執行同一指令即可續傳）：${failed.join(',')}`,
                reason: 'pages-failed', failedPages: failed, pagesDir, totalPages: total, fetchedAt,
            }
        }
        log(`抓圖完成 ${total}/${total}`)

        // 抓圖完成即關閉瀏覽器釋放資源；合併 PDF 為本機運算，不需 session
        await browser.close().catch(() => {})
        browser = null; context = null

        // ── 3) 合併為 PDF（每頁尺寸 = 圖片像素）──
        log('合併 PDF 中...')
        const doc = new PDFDocument({ autoFirstPage: false })
        const stream = fs.createWriteStream(outPdf)
        doc.pipe(stream)
        for (let pg = 1; pg <= total; pg++) {
            const f = dest(pg)
            const { width, height } = jpegSize(fs.readFileSync(f))
            doc.addPage({ size: [width, height], margin: 0 })
            doc.image(f, 0, 0, { width, height })
        }
        doc.end()
        await new Promise((r) => stream.on('finish', r))

        const sizeBytes = fs.statSync(outPdf).size
        if (!keepPages) {
            fs.rmSync(pagesDir, { recursive: true, force: true })
            log('已刪除頁圖暫存')
        } else {
            log(`頁圖暫存保留於 ${pagesDir}（可手動刪除）`)
        }
        log(`完成：${total} 頁，${(sizeBytes / 1048576).toFixed(1)} MB → ${outPdf}`)

        return {
            status: 'success', url,
            outputPath: outPdf,
            fileName: outName,
            totalPages: total,
            sizeBytes,
            pagesDir: keepPages ? pagesDir : null,
            keptPages: keepPages,
            fetchedAt,
        }
    } catch (err) {
        return { status: 'error', url, message: err.message || String(err), reason: err.reason || 'playwright-error', fetchedAt }
    } finally {
        if (browser) await browser.close().catch(() => {})
    }
}

export default downloadBaiduPdf
