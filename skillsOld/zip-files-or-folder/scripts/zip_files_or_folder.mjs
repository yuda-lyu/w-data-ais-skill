#!/usr/bin/env node
// zip_files_or_folder.mjs — CLI 包裝
//
// 用法:
//   node zip_files_or_folder.mjs --input <p1> [<p2> ...] [--input <p3>] --output <out.zip>
//                                [--password <pw>] [--level <0-9>] [--json]

import fs from 'node:fs'
import path from 'node:path'
import { zipFilesOrFolder } from './zipFilesOrFolder.mjs'

function _usage() {
    return [
        'Usage:',
        '  node zip_files_or_folder.mjs --input <p1> [<p2> ...] [--input <p3>] \\',
        '                               --output <out.zip> \\',
        '                               [--password <pw>] [--encryption zip20|aes256] \\',
        '                               [--level <0-9>] [--json]',
        '',
        '說明:',
        '  --input      一或多個輸入路徑 (檔案 / 資料夾 / 混合)，可重複指定，每個 --input 後可接多個路徑',
        '  --output     輸出 zip 檔案路徑 (必填)',
        '  --password   密碼加密；單檔 / 多檔 / 資料夾各模式皆支援',
        '  --encryption 加密方法 (有 --password 時生效)，預設 zip20',
        '                 zip20  相容性最廣 (含 Windows Explorer)，但 cryptographic 較弱',
        '                 aes256 強加密，7-Zip / WinZip 可解；Windows Explorer 可瀏覽但無法解出檔案',
        '  --level      壓縮等級 0-9 (0=不壓縮 1=最快速 9=最高壓縮)，預設 1',
        '  --json       以 JSON 結構輸出 (含 status 欄位)',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = { inputs: [] }
    let curList = null  // 指向 opts.inputs 時，後續無 flag 引數會被收進來
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--input') { curList = opts.inputs; continue }
        if (a === '--output') { curList = null; opts.output = argv[++i]; continue }
        if (a === '--password') { curList = null; opts.password = argv[++i]; continue }
        if (a === '--encryption') { curList = null; opts.encryption = argv[++i]; continue }
        if (a === '--level') { curList = null; opts.level = argv[++i]; continue }
        if (a === '--json') { curList = null; opts.json = true; continue }
        if (a === '--help' || a === '-h') { opts.help = true; continue }
        if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
        if (curList) { curList.push(a); continue }
        throw new Error(`unexpected positional argument: ${a} (use --input <path> first)`)
    }
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
    if (opts.inputs.length === 0) {
        process.stderr.write(`必須指定至少一個 --input 路徑\n\n${_usage()}\n`)
        process.exit(1)
    }
    if (!opts.output) {
        process.stderr.write(`必須指定 --output <out.zip>\n\n${_usage()}\n`)
        process.exit(1)
    }

    const callOpts = {}
    if (opts.password) callOpts.password = opts.password
    if (opts.encryption != null) callOpts.encryption = opts.encryption
    if (opts.level != null) callOpts.level = opts.level

    let result
    try {
        result = await zipFilesOrFolder(opts.inputs, opts.output, callOpts)
    } catch (err) {
        if (opts.json) {
            process.stdout.write(JSON.stringify({ status: 'error', message: err.message, inputs: opts.inputs, output: opts.output }, null, 2) + '\n')
        } else {
            process.stderr.write(`壓縮失敗：${err.message}\n`)
        }
        process.exit(1)
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify({
            status: 'success',
            inputs: opts.inputs,
            output: result.output,
            mode: result.mode,
            sizeBytes: result.sizeBytes,
            entryCount: result.entryCount,
        }, null, 2) + '\n')
    } else {
        const kb = (result.sizeBytes / 1024).toFixed(1)
        process.stdout.write(`✓ 壓縮完成：${result.output}\n  mode=${result.mode}  entries=${result.entryCount}  size=${kb} KB\n`)
    }
    process.exit(0)
})()
