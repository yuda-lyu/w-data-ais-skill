#!/usr/bin/env node
// shorten_url.mjs — CLI 包裝
//
// 用法:
//   node shorten_url.mjs <URL> [--alias <custom>] [--stats] [--json] [--output <path>]

import fs from 'node:fs'
import path from 'node:path'
import { shortenUrl } from './shortenUrl.mjs'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

function _usage() {
    return [
        'Usage:',
        '  node shorten_url.mjs <URL> [options]',
        '',
        'Options:',
        '  --alias <custom>   自訂短碼（4-10 字元，[A-Za-z0-9_-]，需全域唯一）',
        '  --json             以 JSON 結構輸出至 stdout',
        '  --output <path>    將 JSON 結果寫入指定檔案',
        '  --help / -h        顯示此說明',
        '',
        '預設：純文字輸出短網址至 stdout（成功時）；失敗時 stderr 印訊息、exit 1。',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = {}
    let positional = null
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--alias') opts.alias = argv[++i]
        else if (a === '--json') opts.json = true
        else if (a === '--output') opts.output = argv[++i]
        else if (a === '--help' || a === '-h') opts.help = true
        else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
        else if (!positional) positional = a
        else throw new Error(`unexpected extra positional argument: ${a}`)
    }
    opts.url = positional
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
    if (!opts.url) {
        process.stderr.write(`必須指定要縮短的 URL\n\n${_usage()}\n`)
        process.exit(1)
    }

    const callOpts = {}
    if (opts.alias != null) callOpts.alias = opts.alias

    const result = await shortenUrl(opts.url, callOpts)
    const payload = JSON.stringify(result, null, 2)

    if (opts.output) {
        try {
            _guardPath(opts.output)
            const dir = path.dirname(opts.output)
            if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(opts.output, payload, 'utf-8')
        } catch (err) {
            process.stderr.write(`寫檔失敗：${err.message}\n`)
            // 不用 process.exit()，避免 Windows + Node fetch handle 來不及清理觸發 libuv assertion；
            // 比照結束路徑設 exitCode 並 return，讓 event loop 自然 drain
            process.exitCode = 1
            return
        }
    }

    if (opts.json || opts.output) {
        process.stdout.write(payload + '\n')
    } else {
        if (result.status === 'success') {
            process.stdout.write(result.shortUrl + '\n')
        } else {
            process.stderr.write(`縮短失敗：${result.message} (code=${result.errorCode})\n`)
        }
    }
    // 不用 process.exit()，避免 Windows + Node fetch handle 來不及清理觸發 libuv assertion；
    // 設 exitCode 讓 event loop 自然 drain
    process.exitCode = result.status === 'success' ? 0 : 1
})()
