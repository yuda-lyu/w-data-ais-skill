#!/usr/bin/env node
// fetch_youtube_transcript.mjs — CLI 包裝
//
// 用法:
//   node fetch_youtube_transcript.mjs <url-or-id> [outputPath] [--language=zh-TW] [--headless] [--user-data-dir=<dir>]
//
// 注意：headless 模式 YouTube 容易偵測並拒絕載入轉錄稿，建議維持有頭（預設）
// 持久 profile：預設 ~/.w-yt-chrome-profile（首次登入 YouTube 後登入態沿用），--user-data-dir 可覆寫

import fs from 'node:fs'
import path from 'node:path'
import { fetchYoutubeTranscript } from './fetchYoutubeTranscript.mjs'

const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(path.basename(p))) {
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`)
    }
}

const args = process.argv.slice(2)
if (args.length === 0) {
    process.stderr.write('Usage: node fetch_youtube_transcript.mjs <url-or-id> [outputPath] [--language=zh-TW] [--headless] [--user-data-dir=<dir>]\n')
    process.exit(1)
}

const positional = []
const options = {}
for (const a of args) {
    if (a.startsWith('--language=')) options.language = a.slice('--language='.length)
    else if (a.startsWith('--user-data-dir=')) options.userDataDir = a.slice('--user-data-dir='.length)
    else if (a === '--headless') options.headless = true
    else positional.push(a)
}

const [urlOrId, outputPath] = positional

;(async () => {
    const result = await fetchYoutubeTranscript(urlOrId, options)
    const payload = JSON.stringify(result, null, 2)

    if (outputPath) {
        try {
            _guardPath(outputPath)
            const dir = path.dirname(outputPath)
            if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(outputPath, payload, 'utf-8')
            const { segments, plainText, timestampedText, ...meta } = result
            console.log(JSON.stringify({ ...meta, output_path: outputPath }, null, 2))
        } catch (err) {
            process.stderr.write(`寫檔失敗：${err.message}\n`)
            process.exit(1)
        }
    } else {
        process.stdout.write(payload + '\n')
    }

    process.exit(result.status === 'success' ? 0 : 1)
})()
