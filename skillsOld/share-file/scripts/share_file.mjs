#!/usr/bin/env node
// share_file.mjs — CLI 包裝
//
// 用法:
//   node share_file.mjs <file> [--max-downloads <N>] [--expiration <1h|2h|6h|12h|24h>]
//                              [--headed] [--upload-timeout <sec>] [--json] [--output <path>]

import fs from 'node:fs'
import path from 'node:path'
import { shareFile } from './shareFile.mjs'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

function _usage() {
    return [
        'Usage:',
        '  node share_file.mjs <file> [options]',
        '',
        'Options:',
        '  --max-downloads <N>     最大下載次數（1, 5, 10, 20, 50, 100），預設 1（一次性）',
        '  --expiration <T>        過期時間（1h, 2h, 6h, 12h, 24h），預設 24h（站方最大）',
        '  --headed                以有頭模式跑 Playwright（預設無頭）',
        '  --upload-timeout <sec>  上傳完成 timeout（秒），預設 600（10 分鐘）',
        '  --json                  以 JSON 結構輸出至 stdout',
        '  --output <path>         將 JSON 結果寫入指定檔案',
        '  --help / -h             顯示此說明',
        '',
        '預設行為：上傳完即關閉瀏覽器、釋放資源；連結為一次性、24h 內過期',
        '檔案上限：5 GB（Wormhole 標準模式）',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = {}
    let positional = null
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--max-downloads') opts.maxDownloads = Number(argv[++i])
        else if (a === '--expiration') opts.expiration = argv[++i]
        else if (a === '--headed') opts.headed = true
        else if (a === '--upload-timeout') opts.uploadTimeoutSec = Number(argv[++i])
        else if (a === '--json') opts.json = true
        else if (a === '--output') opts.output = argv[++i]
        else if (a === '--help' || a === '-h') opts.help = true
        else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
        else if (!positional) positional = a
        else throw new Error(`unexpected extra positional argument: ${a}`)
    }
    opts.file = positional
    return opts
}

;(async () => {
    let opts
    try { opts = _parseArgs(process.argv.slice(2)) }
    catch (err) {
        process.stderr.write(`${err.message}\n\n${_usage()}\n`)
        process.exit(1)
    }
    if (opts.help) {
        process.stdout.write(_usage() + '\n')
        process.exit(0)
    }
    if (!opts.file) {
        process.stderr.write(`必須指定要上傳的檔案路徑\n\n${_usage()}\n`)
        process.exit(1)
    }

    const callOpts = {}
    if (opts.maxDownloads != null) callOpts.maxDownloads = opts.maxDownloads
    if (opts.expiration != null) callOpts.expiration = opts.expiration
    if (opts.headed) callOpts.headless = false
    if (opts.uploadTimeoutSec != null) callOpts.uploadTimeoutMs = opts.uploadTimeoutSec * 1000

    const result = await shareFile(opts.file, callOpts)
    const payload = JSON.stringify(result, null, 2)

    if (opts.output) {
        try {
            _guardPath(opts.output)
            const dir = path.dirname(opts.output)
            if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(opts.output, payload, 'utf-8')
        } catch (err) {
            process.stderr.write(`寫檔失敗：${err.message}\n`)
            process.exit(1)
        }
    }

    if (opts.json || opts.output) {
        process.stdout.write(payload + '\n')
    } else {
        if (result.status === 'success') {
            process.stdout.write(result.url + '\n')
        } else {
            process.stderr.write(`分享失敗：${result.message} (${result.reason})\n`)
        }
    }
    process.exit(result.status === 'success' ? 0 : 1)
})()
