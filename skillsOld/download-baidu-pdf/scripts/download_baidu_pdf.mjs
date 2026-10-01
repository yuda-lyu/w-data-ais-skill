#!/usr/bin/env node
// download_baidu_pdf.mjs — CLI 包裝
//
// 用法:
//   node download_baidu_pdf.mjs <百度分享網址> [輸出檔.pdf] [選項]
//
// 選項:
//   --out-dir <path>   輸出目錄（預設技能自身目錄下的 tmp/，即 download-baidu-pdf/tmp）
//   --conc <n>         併發抓圖數（預設 5；過高易被限速）
//   --pages <n>        手動指定總頁數（自動偵測失敗時用）
//   --keep-pages       保留逐頁 JPEG 暫存（預設組裝完成後即刪除；保留供續傳/OCR）
//   --headed           有頭模式（預設無頭；debug 用）
//   --wait <sec>       等預覽載入/取得簽章的秒數（預設 45）
//   --json             以 JSON 結構輸出至 stdout（否則只印輸出 PDF 路徑一行）
//   --help / -h        顯示此說明
//
// 本技能僅支援「免登入可預覽」的公開文件分享（不提供任何登入功能）。

import { downloadBaiduPdf } from './downloadBaiduPdf.mjs'

function _usage() {
    return [
        'Usage:',
        '  node download_baidu_pdf.mjs <百度分享網址> [輸出檔.pdf] [選項]',
        '',
        'Options:',
        '  --out-dir <path>   輸出目錄（預設技能自身目錄下的 tmp/，即 download-baidu-pdf/tmp）',
        '  --conc <n>         併發抓圖數（預設 5；過高易被限速）',
        '  --pages <n>        手動指定總頁數（自動偵測失敗時用）',
        '  --keep-pages       保留逐頁 JPEG 暫存（預設組裝完成後即刪除；保留供續傳/OCR）',
        '  --headed           有頭模式（預設無頭；debug 用）',
        '  --wait <sec>       等預覽載入/取得簽章的秒數（預設 45）',
        '  --json             以 JSON 結構輸出至 stdout（否則只印輸出 PDF 路徑一行）',
        '  --help / -h        顯示此說明',
        '',
        '支援 /s/<token> 與 /link/.../<token> 兩種網址格式。未指定輸出檔名時用分享頁標題自動命名。',
        '僅支援「免登入可預覽」的公開文件分享；產出為「圖片式 PDF」（每頁是頁面圖片），掃描書來源無可搜尋文字層（需 OCR）。',
    ].join('\n')
}

function _parseArgs(argv) {
    const opts = {}
    const pos = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--out-dir') opts.outDir = argv[++i]
        else if (a === '--conc') opts.concurrency = Number(argv[++i])
        else if (a === '--pages') opts.pages = Number(argv[++i])
        else if (a === '--keep-pages') opts.keepPages = true
        else if (a === '--headed') opts.headless = false
        else if (a === '--wait') opts.signatureWaitMs = Number(argv[++i]) * 1000
        else if (a === '--json') opts.json = true
        else if (a === '--help' || a === '-h') opts.help = true
        else if (a.startsWith('--')) throw new Error(`未知選項: ${a}`)
        else pos.push(a)
    }
    opts.url = pos[0]
    opts.output = pos[1] || null
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
        process.stderr.write(`必須提供百度分享網址\n\n${_usage()}\n`)
        process.exit(1)
    }

    const callOpts = {}
    if (opts.outDir != null) callOpts.outDir = opts.outDir
    if (opts.concurrency != null) callOpts.concurrency = opts.concurrency
    if (opts.pages != null) callOpts.pages = opts.pages
    if (opts.keepPages != null) callOpts.keepPages = opts.keepPages
    if (opts.headless != null) callOpts.headless = opts.headless
    if (opts.signatureWaitMs != null) callOpts.signatureWaitMs = opts.signatureWaitMs
    if (opts.output != null) callOpts.output = opts.output

    const result = await downloadBaiduPdf(opts.url, callOpts)

    if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else if (result.status === 'success') {
        process.stdout.write(result.outputPath + '\n')
    } else {
        process.stderr.write(`下載失敗：${result.message} (${result.reason})\n`)
    }
    process.exit(result.status === 'success' ? 0 : 1)
})()
