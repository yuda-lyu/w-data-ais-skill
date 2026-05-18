// zipFilesOrFolder.mjs — 壓縮檔案/資料夾為 zip
//
// 對外匯出：
//   zipFilesOrFolder(inputs, output, options?) → Promise<{ output, mode, sizeBytes, entryCount }>
//
// 模式自動判斷：
//   有密碼                              → 一律走 archiver-zip-encrypted（zip20 或 aes256）
//   無密碼 + 單一檔案                   → 委派 w-zip 的 mZip.zipFile
//   無密碼 + 單一資料夾                 → 委派 w-zip 的 mZip.zipFolder
//   無密碼 + 兩個以上輸入（或混合）     → 走 archiver（zip 內各檔案/資料夾於根層級）

import fs from 'node:fs'
import path from 'node:path'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

const VALID_ENCRYPTIONS = ['zip20', 'aes256']
let _encryptedFormatRegistered = false

async function _loadWZip() {
    try {
        const m = await import('w-zip')
        return m.default || m
    } catch (err) {
        throw new Error('w-zip not installed (npm install w-zip)')
    }
}

async function _loadArchiver() {
    try {
        const m = await import('archiver')
        return m.default || m
    } catch (err) {
        throw new Error('archiver not installed (npm install archiver) — 多檔案模式需要此套件')
    }
}

async function _ensureEncryptedFormat(archiver) {
    if (_encryptedFormatRegistered) return
    let plugin
    try {
        const m = await import('archiver-zip-encrypted')
        plugin = m.default || m
    } catch (err) {
        throw new Error('archiver-zip-encrypted not installed — 密碼加密需要此套件（隨 w-zip 一起安裝）')
    }
    // registerFormat 重複註冊會丟錯；用 try/catch 守一次性註冊
    try { archiver.registerFormat('zip-encrypted', plugin) }
    catch (e) { /* 已註冊，忽略 */ }
    _encryptedFormatRegistered = true
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
    const zipOpts = {}
    if (opts.level != null) zipOpts.level = opts.level
    await wz.mZip.zipFile(input, output, zipOpts)
    return { mode: 'single-file', entryCount: 1 }
}

async function _zipSingleFolderWZ(input, output, opts) {
    const wz = await _loadWZip()
    const zipOpts = {}
    if (opts.level != null) zipOpts.level = opts.level
    await wz.mZip.zipFolder(input, output, zipOpts)
    let count = 0
    function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name)
            if (e.isFile()) count++
            else if (e.isDirectory()) walk(p)
        }
    }
    walk(input)
    return { mode: 'single-folder', entryCount: count }
}

// 用 archiver 直接組合；password 為空走純 zip，有 password 走 zip-encrypted
async function _zipWithArchiver(inputs, kinds, output, opts, mode) {
    const archiver = await _loadArchiver()
    const level = opts.level ?? 1
    let archive
    if (opts.password) {
        await _ensureEncryptedFormat(archiver)
        archive = archiver('zip-encrypted', {
            zlib: { level },
            encryptionMethod: opts.encryption ?? 'zip20',
            password: opts.password,
        })
    } else {
        archive = archiver('zip', { zlib: { level } })
    }
    return await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(output)
        let entryCount = 0
        archive.on('entry', () => { entryCount++ })
        archive.on('warning', (err) => { if (err.code !== 'ENOENT') reject(err) })
        archive.on('error', reject)
        out.on('close', () => resolve({ mode, entryCount }))
        out.on('error', reject)
        archive.pipe(out)
        for (let i = 0; i < inputs.length; i++) {
            const p = inputs[i]
            const kind = kinds[i]
            const base = path.basename(p)
            if (kind === 'file') archive.file(p, { name: base })
            else archive.directory(p, base)
        }
        archive.finalize()
    })
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

    const kinds = inputs.map(_classifyInput)

    const outDir = path.dirname(output)
    if (outDir && outDir !== '.') fs.mkdirSync(outDir, { recursive: true })

    let result
    if (options.password) {
        // 有密碼：所有模式統一走 archiver-zip-encrypted
        const mode = (inputs.length === 1 && kinds[0] === 'file') ? 'single-file'
            : (inputs.length === 1 && kinds[0] === 'directory') ? 'single-folder'
            : 'multi'
        result = await _zipWithArchiver(inputs, kinds, output, options, mode)
    } else if (inputs.length === 1 && kinds[0] === 'file') {
        result = await _zipSingleFileWZ(inputs[0], output, options)
    } else if (inputs.length === 1 && kinds[0] === 'directory') {
        result = await _zipSingleFolderWZ(inputs[0], output, options)
    } else {
        result = await _zipWithArchiver(inputs, kinds, output, options, 'multi')
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
