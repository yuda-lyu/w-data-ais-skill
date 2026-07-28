#!/usr/bin/env node
// save_data_to_lmdb.mjs — CLI 包裝
//
// 用法:
//   node save_data_to_lmdb.mjs --items <items.json> --db-path <dir>
//                              [--db <name>] [--cl <name>] [--pk <field>] [--output <out.json>]

import fs from 'node:fs'
import path from 'node:path'
import { saveDataToLmdb } from './saveDataToLmdb.mjs'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

function _usage() {
    return [
        'Usage:',
        '  node save_data_to_lmdb.mjs --items <items.json> --db-path <dir> \\',
        '                             [--db <name>] [--cl <name>] [--pk <field>] [--output <out.json>]',
        '',
        '說明:',
        '  --items    資料來源 JSON 檔 (必填)；內容為陣列，或含 itemsNew / items 陣列欄位之物件',
        '  --db-path  LMDB 資料夾路徑 (必填)',
        '  --db       資料庫名稱，預設 name-db',
        '  --cl       集合名稱，預設 name-cl',
        '  --pk       主鍵欄位名稱，預設 pk；取該欄位值作為去重主鍵',
        '  --output   輸出結果 JSON 路徑；未指定則印至 stdout',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--items') { opts.items = argv[++i]; continue }
        if (a === '--db-path') { opts.dbPath = argv[++i]; continue }
        if (a === '--db') { opts.db = argv[++i]; continue }
        if (a === '--cl') { opts.cl = argv[++i]; continue }
        if (a === '--pk') { opts.pk = argv[++i]; continue }
        if (a === '--output') { opts.output = argv[++i]; continue }
        if (a === '--help' || a === '-h') { opts.help = true; continue }
        throw new Error(`unknown option: ${a}`)
    }
    return opts
}

;(async () => {
    let opts
    try {
        opts = _parseArgs(process.argv.slice(2))
    } catch (err) {
        process.stderr.write(`${err.message}\n\n${_usage()}\n`)
        process.exit(1)
    }

    if (opts.help || process.argv.length <= 2) {
        process.stdout.write(_usage() + '\n')
        process.exit(opts.help ? 0 : 1)
    }
    if (!opts.items || !opts.dbPath) {
        process.stderr.write(`--items 與 --db-path 為必填\n\n${_usage()}\n`)
        process.exit(1)
    }

    // 讀取資料來源：允許直接是陣列，或包在 itemsNew / items 欄位內
    let itemsNew
    try {
        const raw = JSON.parse(fs.readFileSync(opts.items, 'utf-8'))
        itemsNew = Array.isArray(raw) ? raw : (raw?.itemsNew ?? raw?.items)
    } catch (err) {
        process.stderr.write(`讀取 --items 失敗：${err.message}\n`)
        process.exit(1)
    }
    if (!Array.isArray(itemsNew)) {
        process.stderr.write('--items 內容須為陣列，或含 itemsNew / items 陣列欄位之物件\n')
        process.exit(1)
    }

    const result = await saveDataToLmdb({
        dbPath: opts.dbPath,
        db: opts.db,
        cl: opts.cl,
        pk: opts.pk,
        itemsNew,
    })
    const payload = JSON.stringify(result, null, 2)

    if (opts.output) {
        try {
            _guardPath(opts.output)
            const dir = path.dirname(opts.output)
            if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(opts.output, payload, 'utf-8')
            // stdout 只印摘要：itemsAdd 可能很大，全量已寫入 output
            const { result: r, ...meta } = result
            const brief = r ? { ...r, itemsAdd: `(${r.itemsAdd?.length ?? 0} items, see output)` } : r
            console.log(JSON.stringify({ ...meta, result: brief, output_path: opts.output }, null, 2))
        } catch (err) {
            process.stderr.write(`寫檔失敗：${err.message}\n`)
            process.exit(1)
        }
    } else {
        process.stdout.write(payload + '\n')
    }

    process.exit(result.status === 'success' ? 0 : 1)
})()
