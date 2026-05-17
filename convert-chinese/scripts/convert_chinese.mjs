#!/usr/bin/env node
// convert_chinese.mjs — 繁簡中文互轉 CLI 包裝
//
// 用法:
//   node convert_chinese.mjs --text "<text>"                 [--from cn] [--to twp] [--json] [--output <path>]
//   node convert_chinese.mjs --input <path> [--output <path>] [--from cn] [--to twp] [--json]
//   <stdin> | node convert_chinese.mjs --stdin               [--from cn] [--to twp] [--json] [--output <path>]
//
// 預設 from=cn, to=twp（簡轉繁台灣，含詞彙轉換）
// 預設輸出純文字至 stdout；指定 --output 則寫檔；指定 --json 則包成 status 結構

import fs from 'node:fs'
import path from 'node:path'
import { convertChinese, listLocales } from './convertChinese.mjs'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

function _usage() {
    return [
        'Usage:',
        '  node convert_chinese.mjs --text "<text>" [--from cn] [--to twp] [--json] [--output <path>]',
        '  node convert_chinese.mjs --input <path> [--output <path>] [--from cn] [--to twp] [--json]',
        '  <stdin> | node convert_chinese.mjs --stdin [--from cn] [--to twp] [--json] [--output <path>]',
        '',
        `Locales: ${listLocales().join(', ')}`,
        '  cn  簡體（大陸）  tw  繁體（台，字級）  twp  繁體（台，詞級）',
        '  hk  繁體（港）    jp  日本新字體       t   OpenCC 通用繁體',
        '',
        '預設 from=cn, to=twp',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--text') opts.text = argv[++i]
        else if (a === '--input') opts.input = argv[++i]
        else if (a === '--output') opts.output = argv[++i]
        else if (a === '--from') opts.from = argv[++i]
        else if (a === '--to') opts.to = argv[++i]
        else if (a === '--stdin') opts.stdin = true
        else if (a === '--json') opts.json = true
        else if (a === '--help' || a === '-h') opts.help = true
        else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
        else throw new Error(`unexpected positional argument: ${a} (use --text "..." or --input <path>)`)
    }
    return opts
}

async function _readStdin() {
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    return Buffer.concat(chunks).toString('utf-8')
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

    const sources = ['text', 'input', 'stdin'].filter(k => opts[k] != null && opts[k] !== false)
    if (sources.length === 0) {
        process.stderr.write(`必須指定輸入來源（--text / --input / --stdin 擇一）\n\n${_usage()}\n`)
        process.exit(1)
    }
    if (sources.length > 1) {
        process.stderr.write(`--text / --input / --stdin 三者擇一，不可同時使用\n`)
        process.exit(1)
    }

    let input = ''
    try {
        if (opts.text != null) input = opts.text
        else if (opts.input) input = fs.readFileSync(opts.input, 'utf-8')
        else if (opts.stdin) input = await _readStdin()
    } catch (err) {
        process.stderr.write(`讀取輸入失敗：${err.message}\n`)
        process.exit(1)
    }

    const from = opts.from ?? 'cn'
    const to = opts.to ?? 'twp'

    let converted
    try {
        converted = await convertChinese(input, { from, to })
    } catch (err) {
        if (opts.json) {
            process.stdout.write(JSON.stringify({ status: 'error', from, to, message: err.message }) + '\n')
        } else {
            process.stderr.write(`轉換失敗：${err.message}\n`)
        }
        process.exit(1)
    }

    const payload = opts.json
        ? JSON.stringify({
            status: 'success',
            from,
            to,
            text: converted,
            charCount: converted.length,
        }, null, 2)
        : converted

    if (opts.output) {
        try {
            _guardPath(opts.output)
            const dir = path.dirname(opts.output)
            if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(opts.output, payload, 'utf-8')
            if (opts.json) {
                process.stdout.write(JSON.stringify({ status: 'success', from, to, charCount: converted.length, output_path: opts.output }, null, 2) + '\n')
            } else {
                process.stdout.write(`寫入 ${opts.output} (${converted.length} 字)\n`)
            }
        } catch (err) {
            process.stderr.write(`寫檔失敗：${err.message}\n`)
            process.exit(1)
        }
    } else {
        process.stdout.write(payload + (opts.json ? '\n' : ''))
    }
    process.exit(0)
})()
