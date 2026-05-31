// zipFilesOrFolder.mjs — 壓縮檔案/資料夾為 zip
//
// 對外匯出：
//   zipFilesOrFolder(inputs, output, options?) → Promise<{ output, mode, sizeBytes, entryCount }>
//
// 引擎（w-zip 1.0.23 起 mZip 改用 @zip.js/zip.js、不再帶 archiver；本技能同步改用 @zip.js/zip.js）：
//   無密碼 + 單一檔案                   → 委派 w-zip 的 mZip.zipFile（其底層即 @zip.js/zip.js）
//   無密碼 + 單一資料夾                 → 直接用 @zip.js/zip.js（與多檔/密碼路徑共用同一套走訪邏輯）
//   無密碼 + 兩個以上輸入（或混合）     → 直接用 @zip.js/zip.js（各檔案/資料夾於 zip 根層級）
//   有密碼（任一模式）                  → 直接用 @zip.js/zip.js（zip20=ZipCrypto / aes256=encryptionStrength:3）
//
// 符號連結（symlink）：頂層 symlink 一律由 _classifyInput 以 lstatSync 拒絕；資料夾「內層」的
//   symlink 一律跳過不打包（readdirSync withFileTypes 對 symlink 的 isFile/isDirectory 皆 false）。
//   所有「資料夾」路徑（含/不含密碼）統一走 @zip.js，故 symlink 處理一致、不會隨密碼與否而異。

import fs from 'node:fs'
import path from 'node:path'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

const VALID_ENCRYPTIONS = ['zip20', 'aes256']
let _zipJsConfigured = false

async function _loadWZip() {
    try {
        const m = await import('w-zip')
        return m.default || m
    } catch (err) {
        throw new Error('w-zip not installed (npm install w-zip)')
    }
}

// @zip.js/zip.js 為 w-zip 的依賴，亦於本技能 package.json 明確宣告（避免 phantom dependency）。
async function _loadZipJs() {
    let mod
    try {
        mod = await import('@zip.js/zip.js')
    } catch (err) {
        throw new Error('@zip.js/zip.js not installed（npm install @zip.js/zip.js；通常隨 w-zip 一併安裝）— 多檔/密碼模式需要此套件')
    }
    if (!_zipJsConfigured) {
        // 關閉 web worker 改用主執行緒，確保 Node 下無殘留 worker 導致 process 無法結束（同 w-zip mZip 做法）
        mod.configure({ useWebWorkers: false })
        _zipJsConfigured = true
    }
    return mod
}

function _classifyInput(p) {
    if (!fs.existsSync(p)) throw new Error(`輸入路徑不存在: ${p}`)
    const st = fs.lstatSync(p)
    if (st.isFile()) return 'file'
    if (st.isDirectory()) return 'directory'
    throw new Error(`輸入路徑既非檔案也非資料夾 (symlink/socket/...): ${p}`)
}

async function _zipSingleFileWZ(input, output, opts) {
    const wz = await _loadWZip()
    // 預設 level 1（最快速）；不帶 level 時 w-zip 內建會吃成 9（最慢），故補預設對齊文件
    const zipOpts = { level: opts.level ?? 1 }
    await wz.mZip.zipFile(input, output, zipOpts)
    return { mode: 'single-file', entryCount: 1 }
}

// 用 @zip.js/zip.js 直接組合：支援多輸入（各檔案/資料夾於 zip 根層級）與密碼（zip20 / aes256）。
// 取代舊的 archiver / archiver-zip-encrypted（w-zip 1.0.23 起已不帶這些套件）。
// 資料夾結構比照 w-zip mZip.zipFolder：以 basename 為 zip 內根目錄、保留空資料夾目錄項。
async function _zipWithZipJs(inputs, kinds, output, opts, mode) {
    const { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } = await _loadZipJs()
    const level = opts.level ?? 1

    const writerOpts = { level }
    if (opts.password) {
        writerOpts.password = opts.password
        if ((opts.encryption ?? 'zip20') === 'aes256') {
            writerOpts.encryptionStrength = 3   // AES-256（7-Zip / WinZip 可解）
        } else {
            writerOpts.zipCrypto = true         // ZipCrypto(zip20)，相容性廣（含 Windows 檔案總管）
        }
    }

    const zipWriter = new ZipWriter(new Uint8ArrayWriter(), writerOpts)

    // entryCount 語意：壓縮包內的「檔案數」（不含目錄項），與 w-zip 路徑一致
    let entryCount = 0
    for (let i = 0; i < inputs.length; i++) {
        const p = inputs[i]
        const base = path.basename(p)
        if (kinds[i] === 'file') {
            const b = fs.readFileSync(p)
            await zipWriter.add(base, new Uint8ArrayReader(b))
            entryCount++
        } else {
            // 資料夾：以 basename 為根，遞迴加入（目錄項保留空資料夾結構，檔案項計入 entryCount）
            const items = []
            const walk = (dir) => {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, e.name)
                    const name = path.join(base, path.relative(p, full)).replaceAll('\\', '/')
                    if (e.isDirectory()) { items.push({ name, isDir: true }); walk(full) }
                    else if (e.isFile()) items.push({ name, full, isDir: false })
                }
            }
            walk(p)
            for (const it of items) {
                if (it.isDir) {
                    await zipWriter.add(it.name, undefined, { directory: true })
                } else {
                    const b = fs.readFileSync(it.full)
                    await zipWriter.add(it.name, new Uint8ArrayReader(b))
                    entryCount++
                }
            }
        }
    }

    const u8 = await zipWriter.close()
    fs.writeFileSync(output, u8)
    return { mode, entryCount }
}

/**
 * 壓縮檔案 / 多檔案 / 資料夾為 zip
 * @param {string[]} inputs - 輸入路徑陣列（檔案或資料夾，可混合）
 * @param {string} output - 輸出 .zip 路徑
 * @param {object} [options]
 * @param {string} [options.password] - 密碼；任何模式均支援
 * @param {string} [options.encryption='zip20'] - 加密方法（有 password 時生效）：'zip20'（相容性廣含 Windows Explorer）或 'aes256'（強，7-Zip/WinZip 可解但 Windows Explorer 無法解出檔案）
 * @param {number} [options.level=1] - 壓縮等級 0-9（0=不壓縮 1=最快速 9=最高壓縮），預設 1
 * @returns {Promise<{ output: string, mode: string, sizeBytes: number, entryCount: number }>}
 */
export async function zipFilesOrFolder(inputs, output, options = {}) {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('inputs 必須是非空陣列')
    if (!output || typeof output !== 'string') throw new Error('output 必須是字串路徑')
    _guardPath(output)

    if (options.level != null) {
        const lv = Number(options.level)
        if (!Number.isInteger(lv) || lv < 0 || lv > 9) throw new Error(`level 必須是 0-9 之間的整數，得到: ${options.level}`)
        options = { ...options, level: lv }
    }
    if (options.encryption != null && !VALID_ENCRYPTIONS.includes(options.encryption)) {
        throw new Error(`encryption 必須是 ${VALID_ENCRYPTIONS.join(' 或 ')}，得到: ${options.encryption}`)
    }
    // 指定 encryption 卻沒 password：加密不會生效（會走無密碼純 zip），明確報錯避免誤以為有加密
    if (options.encryption != null && !options.password) {
        throw new Error('指定 encryption 但未提供 password；加密不會生效。請一併提供 password，或移除 encryption')
    }

    const kinds = inputs.map(_classifyInput)

    // 多輸入：各輸入以其 basename 放到 zip 根層級，basename 重複會碰撞
    // （@zip.js 的 ZipWriter 不允許同名 entry，會拋難懂的 "File already exists"）。
    // 提前檢出並回明確中文錯誤，而非讓底層拋。
    if (inputs.length > 1) {
        const seen = new Map()
        for (const p of inputs) {
            const b = path.basename(p)
            if (seen.has(b)) {
                throw new Error(`多個輸入有相同名稱「${b}」（${seen.get(b)} 與 ${p}），無法並列於同一 zip 根層級；請改用單一資料夾模式，或先將其中一個重新命名`)
            }
            seen.set(b, p)
        }
    }

    const outDir = path.dirname(output)
    if (outDir && outDir !== '.') fs.mkdirSync(outDir, { recursive: true })

    let result
    if (options.password) {
        // 有密碼：全走 @zip.js/zip.js（單檔/單資料夾/多檔皆可，且支援 zip20 / aes256）
        const mode = (inputs.length === 1 && kinds[0] === 'file') ? 'single-file'
            : (inputs.length === 1 && kinds[0] === 'directory') ? 'single-folder'
            : 'multi'
        result = await _zipWithZipJs(inputs, kinds, output, options, mode)
    } else if (inputs.length === 1 && kinds[0] === 'file') {
        result = await _zipSingleFileWZ(inputs[0], output, options)
    } else if (inputs.length === 1 && kinds[0] === 'directory') {
        // 無密碼單資料夾也走 @zip.js（不再用 w-zip mZip.zipFolder），與多檔/密碼路徑共用同一套
        // 走訪邏輯，確保資料夾內層 symlink 的處理一致（統一跳過）。
        result = await _zipWithZipJs(inputs, kinds, output, options, 'single-folder')
    } else {
        result = await _zipWithZipJs(inputs, kinds, output, options, 'multi')
    }

    const st = fs.statSync(output)
    return {
        output: path.resolve(output),
        mode: result.mode,
        sizeBytes: st.size,
        entryCount: result.entryCount,
    }
}

export default zipFilesOrFolder
