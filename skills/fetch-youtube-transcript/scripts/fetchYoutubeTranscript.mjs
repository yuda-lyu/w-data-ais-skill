// fetchYoutubeTranscript.mjs — 用 Playwright + 本機 Chrome（持久 profile）抓 YouTube 影片字幕
//
// 對外匯出 fetchYoutubeTranscript(url, options) → { status, ... }
//
// Profile 策略（為何不是「直接用日常 Chrome 的預設 profile」）：
//   Chrome 136（2025-04）起基於安全政策，remote debugging（CDP）對「預設 user data directory」
//   一律拒絕生效，而 Playwright 驅動 Chrome 全靠 CDP —— 直接掛使用者日常已登入的預設 profile
//   在新版 Chrome 上做不到（且日常 Chrome 開著時 profile 也被鎖）。
//   官方認可做法＝指定「非預設」的 user-data-dir。故本腳本用 launchPersistentContext 掛
//   專用持久 profile（預設 ~/.w-yt-chrome-profile，可用 options.userDataDir 覆寫）：
//   首次在開出的視窗手動登入一次 YouTube 帳號後，登入態永久留在此 profile，
//   之後每次執行都是「已登入的本機 Chrome」。未登入也能抓一般公開影片的字幕。
//
// 核心策略：
//   開本機 Chrome（持久 profile）→ 走 YouTube 自家 UI 流程（不由本腳本直接打 timedtext，避免 POT 檢查）：
//     1. goto watch 頁
//     2. 等 ytInitialPlayerResponse.captions 就緒
//     3. 點「顯示轉錄稿」按鈕（用 Playwright 原生 click，繞過合成事件偵測）＋按 c 開啟播放器 CC
//     4. 三路徑並行等待結果：
//        (A) DOM 讀取：監看 transcript 段落元素出現
//        (B) 網路攔截：監聽 /youtubei/v1/get_transcript 回應
//        (C) 播放器 CC 攔截：監聽播放器自己帶 POT 打的 /api/timedtext（json3）回應
//     5. 誰先成功用誰
//
// 為什麼這樣設計：
//   - 直接打 youtube.com/api/timedtext：自 2025 年起需 POT (Proof of Origin Token)
//     才會回 JSON，否則回 200 + 空 body
//   - get_transcript 是 YouTube InnerTube 內部 API，由前端 JS 自動帶 POT 呼叫
//     讓 UI 自己跑這個流程是最穩的做法
//   - 但未登入／新 profile 時 InnerTube 可能對 get_transcript 直接回 400（2026-07 實測），
//     此時面板永遠空白 → 路徑 C 讓「播放器」自己載入 CC 字幕軌（帶 POT 的 timedtext），
//     不受 get_transcript 400 影響，登入與否皆可用
//   - 路徑 C 必須以 URL 之 v=<videoId> 過濾——前置廣告也是影片、也會抓自己的 timedtext，
//     不過濾會把廣告字幕當成主影片字幕（2026-07 實測踩到：主影片中文、攔到 27 秒韓文廣告字幕）
//   - 合成事件 (el.click() via evaluate) 會被 YouTube 過濾，必須用真實滑鼠事件

import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import w from 'wsemi'
import _ from 'lodash-es'

const MAX_RETRIES = 2  // 含初始最多 3 次
const INITIAL_WAIT_MS = 3000
const MAX_WAIT_MS = 9000
const DEFAULT_NAV_TIMEOUT_MS = 30000
const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 60000  // 需容納前置廣告播完（廣告期間主影片的 timedtext 不會來）
const DEFAULT_CAPTIONS_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 500

const TRANSCRIPT_BTN_KEYWORDS = ['顯示轉錄稿', '轉錄稿', '顯示文字記錄', 'Show transcript']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitMs = (attempt) => Math.min(INITIAL_WAIT_MS * attempt, MAX_WAIT_MS)

function ts() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function timestampFromMs(ms) {
    const total = Math.floor(ms / 1000)
    const hh = Math.floor(total / 3600)
    const mm = Math.floor((total % 3600) / 60)
    const ss = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}

function _extractVideoId(input) {
    if (!input || typeof input !== 'string') return null
    if (/^[\w-]{11}$/.test(input)) return input
    let m
    if ((m = input.match(/[?&]v=([\w-]{11})/))) return m[1]
    if ((m = input.match(/youtu\.be\/([\w-]{11})/))) return m[1]
    if ((m = input.match(/\/shorts\/([\w-]{11})/))) return m[1]
    if ((m = input.match(/\/embed\/([\w-]{11})/))) return m[1]
    return null
}

function _normalizeUrl(input) {
    const id = _extractVideoId(input)
    if (!id) return null
    return `https://www.youtube.com/watch?v=${id}`
}

function _isLangMatch(track, lang) {
    if (!lang) return false
    const code = (track.languageCode || '').toLowerCase()
    const want = lang.toLowerCase()
    return code === want || code.startsWith(want + '-') || want.startsWith(code + '-')
}

function _pickTrack(tracks, preferLang) {
    if (!tracks || tracks.length === 0) return null
    const manualOnly = tracks.filter((t) => t.kind === 'manual')
    const pool = manualOnly.length > 0 ? manualOnly : tracks  // 優先手動字幕
    if (preferLang) {
        const exact = pool.find((t) => _isLangMatch(t, preferLang))
        if (exact) return exact
    }
    // 預設偏好序：zh-TW > zh-Hant > zh > en > 第一個
    const order = ['zh-TW', 'zh-Hant', 'zh', 'en']
    for (const code of order) {
        const hit = pool.find((t) => _isLangMatch(t, code))
        if (hit) return hit
    }
    return pool[0]
}

// ---------- 路徑 0：yt-dlp（主路徑，不開瀏覽器） ----------
// yt-dlp -J 直接打 InnerTube 拿 player response，字幕軌 URL 自帶簽名參數，
// 以純 HTTP 下載即可，不需登入、不觸發 get_transcript 400（2026-07 實測）。

const YTDLP_JSON_TIMEOUT_MS = 60000
const YTDLP_FETCH_TIMEOUT_MS = 30000

// 執行 yt-dlp -J 取得影片 metadata（含 subtitles / automatic_captions）；失敗或未安裝回 null
function _runYtdlpJson(url, timeoutMs) {
    return new Promise((resolve) => {
        let p
        try {
            p = spawn('yt-dlp', ['-J', '--skip-download', url], { windowsHide: true })
        } catch { resolve(null); return }
        let out = ''
        const timer = setTimeout(() => { try { p.kill() } catch { /* noop */ } resolve(null) }, timeoutMs)
        p.stdout.on('data', (d) => { out += d })
        p.stderr.on('data', () => { /* noop */ })
        p.on('error', () => { clearTimeout(timer); resolve(null) })  // 未安裝（ENOENT）等
        p.on('close', (code) => {
            clearTimeout(timer)
            if (code !== 0 || !out) { resolve(null); return }
            try { resolve(JSON.parse(out)) } catch { resolve(null) }
        })
    })
}

// 以 yt-dlp 主路徑抓字幕；成功回完整 result 物件，任一步失敗回 null（外層退回 Playwright 路徑）
async function _tryYtdlp(watchUrl, videoId, preferLang, fetchedAt) {
    const info = await _runYtdlpJson(watchUrl, YTDLP_JSON_TIMEOUT_MS)
    if (!info) return null

    const mk = (dict, kind) => Object.entries(dict || {}).map(([code, fmts]) => ({
        languageCode: code,
        name: fmts?.[0]?.name || '',
        kind,
        fmts,
    }))
    const manual = mk(info.subtitles, 'manual')
    const auto = mk(info.automatic_captions, 'asr')
    const picked = _pickTrack([...manual, ...auto], preferLang)  // _pickTrack 本就手動優先
    if (!picked) return null
    const json3Fmt = (picked.fmts || []).find((f) => f.ext === 'json3')
    if (!json3Fmt?.url) return null

    let body
    try {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), YTDLP_FETCH_TIMEOUT_MS)
        const res = await fetch(json3Fmt.url, { signal: ac.signal })
        clearTimeout(timer)
        if (!res.ok) return null
        body = await res.text()
    } catch { return null }

    const raw = _parseTimedtextJson3(body)
    if (!raw || raw.length === 0) return null
    const segments = raw.map((s) => ({ tMs: s.tMs, t: timestampFromMs(s.tMs), txt: s.txt }))

    return {
        status: 'success',
        url: watchUrl,
        videoId,
        // yt-dlp 路徑下載的就是 picked 那一軌，語言／種類 100% 確定
        language: picked.languageCode,
        languageName: picked.name || null,
        kind: picked.kind,
        languageVerified: true,
        requestedLanguage: picked.languageCode,
        requestedLanguageName: picked.name || null,
        requestedKind: picked.kind,
        // 只列手動軌（自動翻譯軌動輒 150+ 語言，全列會撐爆輸出）；無手動軌才列自動軌前 20
        availableTracks: (manual.length > 0 ? manual : auto.slice(0, 20)).map(({ languageCode, name, kind }) => ({ languageCode, name, kind })),
        segments,
        segmentsCount: segments.length,
        plainText: segments.map((s) => s.txt).join('\n'),
        timestampedText: segments.map((s) => `[${s.t}] ${s.txt}`).join('\n'),
        source: 'ytdlp-json3',
        method: 'yt-dlp',
        fetchedAt,
        attempts: 1,
    }
}

// 解析播放器 CC 的 /api/timedtext（fmt=json3）回應為 segments
// json3 結構：{ events: [{ tStartMs, segs: [{ utf8 }] }] }；無 segs 的 event 是視窗定義，略過
function _parseTimedtextJson3(jsonStr) {
    let data
    try { data = JSON.parse(jsonStr) } catch { return null }
    const events = data?.events
    if (!Array.isArray(events) || events.length === 0) return null
    const out = []
    for (const ev of events) {
        if (!Array.isArray(ev.segs)) continue
        const txt = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim()
        if (!txt) continue
        out.push({ tMs: parseInt(ev.tStartMs ?? '0', 10), txt })
    }
    return out.length > 0 ? out : null
}

// 解析 /get_transcript 回的 JSON 結構為 segments
function _parseGetTranscriptJson(jsonStr) {
    let data
    try { data = JSON.parse(jsonStr) } catch { return null }

    const tryPaths = [
        () => data.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments,
        () => data.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroups,
    ]
    let segs = null
    for (const fn of tryPaths) {
        try { segs = fn(); if (segs) break } catch { /* noop */ }
    }
    if (!Array.isArray(segs) || segs.length === 0) return null

    const out = []
    for (const it of segs) {
        // 新結構（2024+）：transcriptSegmentRenderer
        const r = it.transcriptSegmentRenderer
        if (r) {
            const startMs = parseInt(r.startMs ?? '0', 10)
            const txt = r.snippet?.runs?.map((x) => x.text).join('') || r.snippet?.simpleText || ''
            if (txt.trim()) out.push({ tMs: startMs, txt: txt.replace(/\s+/g, ' ').trim() })
            continue
        }
        // 舊結構：cueGroup
        const cue = it.transcriptCueGroupRenderer?.cues?.[0]?.transcriptCueRenderer
        if (cue) {
            const startMs = parseInt(cue.startOffsetMs ?? '0', 10)
            const txt = cue.cue?.simpleText || cue.cue?.runs?.map((x) => x.text).join('') || ''
            if (txt.trim()) out.push({ tMs: startMs, txt: txt.replace(/\s+/g, ' ').trim() })
        }
    }
    return out
}

async function _readSegmentsFromDOM(page) {
    return await page.evaluate(() => {
        // 新版 panel（2026-05+，target-id="PAmodern_transcript_view"）
        const newItems = document.querySelectorAll('transcript-segment-view-model')
        if (newItems.length > 0) {
            return Array.from(newItems).map((it) => {
                const t = it.querySelector('.ytwTranscriptSegmentViewModelTimestamp')?.textContent?.trim() || ''
                const txt = it.querySelector('[role="text"], .ytAttributedStringHost')?.textContent?.trim() || ''
                return { t, txt }
            }).filter((s) => s.txt)
        }
        // 舊版 panel（target-id="engagement-panel-searchable-transcript"），保留作 fallback
        const oldItems = document.querySelectorAll('ytd-transcript-segment-renderer')
        return Array.from(oldItems).map((it) => {
            const t = it.querySelector('.segment-timestamp')?.textContent?.trim() || ''
            const txt = it.querySelector('.segment-text, yt-formatted-string.segment-text')?.textContent?.trim() || ''
            return { t, txt }
        }).filter((s) => s.txt)
    })
}

// MM:SS 或 HH:MM:SS → ms（DOM 路徑用，因為 DOM 只有顯示字串沒有 ms）
function _domTimestampToMs(t) {
    if (!t) return 0
    const parts = t.split(':').map((x) => parseInt(x, 10))
    if (parts.some(isNaN)) return 0
    let sec = 0
    for (const p of parts) sec = sec * 60 + p
    return sec * 1000
}

/**
 * 抓取 YouTube 影片字幕
 * @param {string} url - YouTube watch URL / youtu.be 短網址 / shorts URL / 11 字 video ID
 * @param {object} [options]
 * @param {string} [options.language] - 偏好字幕語言（如 'zh-TW', 'en'），未指定則 zh-TW > zh-Hant > zh > en > 第一個
 * @param {boolean} [options.headless=false] - 是否無頭模式（預設 false；YouTube 對無頭較敏感）
 * @param {string} [options.chromeChannel='chrome'] - playwright launch channel
 * @param {string} [options.userDataDir=~/.w-yt-chrome-profile] - 持久 profile 目錄；首次在此 profile 登入 YouTube 後，後續執行皆帶登入態。
 *   注意不可指向日常 Chrome 的預設 User Data 目錄（Chrome 136+ 禁止對預設目錄開 CDP，Playwright 會連不上）
 * @param {number} [options.navigationTimeoutMs=30000]
 * @param {number} [options.captionsWaitMs=30000] - 等 ytInitialPlayerResponse 的 timeout
 * @param {number} [options.transcriptWaitMs=60000] - 等 transcript 載入的 timeout（含前置廣告播完的時間）
 * @returns {Promise<object>} {status, url, videoId, language, languageName, kind, languageVerified, requestedLanguage, requestedLanguageName, requestedKind, segments, plainText, timestampedText, source, fetchedAt, attempts, ...}
 *   注意：載入的是 YouTube 為本影片決定的「預設」字幕語言，本流程不切換 UI 字幕語言。
 *   language/languageName/kind 僅在 languageVerified 時反映實際載入內容：字幕軌唯一，
 *   或 source='timedtext'（URL 之 lang=/kind= 參數直接標明載入軌）；否則為 null。
 *   requestedLanguage* 永遠記錄偏好挑選到的 track，供參考但不保證等於實際載入語言。
 */
export async function fetchYoutubeTranscript(url, options = {}) {
    const fetchedAt = ts()

    if (!w.isestr(url)) {
        return { status: 'error', url: String(url), message: 'invalid YouTube URL or video ID', reason: 'invalid-url', fetchedAt, attempts: 0 }
    }
    const videoId = _extractVideoId(url)
    if (!videoId) {
        return { status: 'error', url: String(url), message: 'invalid YouTube URL or video ID', reason: 'invalid-url', fetchedAt, attempts: 0 }
    }
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

    let preferLangEarly = _.get(options, 'language', null)
    if (!w.isestr(preferLangEarly)) preferLangEarly = null

    // 路徑 0（主路徑）：yt-dlp——不開瀏覽器、不需登入；失敗或未安裝才退回 Playwright UI
    try {
        const ytdlpResult = await _tryYtdlp(watchUrl, videoId, preferLangEarly, fetchedAt)
        if (ytdlpResult) return ytdlpResult
    } catch { /* noop：任何意外都退回 Playwright 路徑 */ }
    process.stderr.write('[fetch-youtube-transcript] yt-dlp 路徑失敗或未安裝，退回 Playwright UI 路徑（將開啟瀏覽器視窗）\n')

    let chromium
    try {
        ({ chromium } = await import('playwright'))
    } catch (err) {
        return { status: 'error', url: watchUrl, videoId, message: 'playwright not installed (npm install playwright)', reason: 'missing-deps', fetchedAt, attempts: 0 }
    }

    let headless = _.get(options, 'headless', null)
    if (!w.isbol(headless)) headless = false; else headless = w.cbol(headless)
    let chromeChannel = _.get(options, 'chromeChannel', null)
    if (!w.isestr(chromeChannel)) chromeChannel = 'chrome'
    let navTimeout = _.get(options, 'navigationTimeoutMs', null)
    if (!w.ispint(navTimeout)) navTimeout = DEFAULT_NAV_TIMEOUT_MS; else navTimeout = w.cint(navTimeout)
    let captionsWaitMs = _.get(options, 'captionsWaitMs', null)
    if (!w.ispint(captionsWaitMs)) captionsWaitMs = DEFAULT_CAPTIONS_TIMEOUT_MS; else captionsWaitMs = w.cint(captionsWaitMs)
    let transcriptWaitMs = _.get(options, 'transcriptWaitMs', null)
    if (!w.ispint(transcriptWaitMs)) transcriptWaitMs = DEFAULT_TRANSCRIPT_TIMEOUT_MS; else transcriptWaitMs = w.cint(transcriptWaitMs)
    let language = _.get(options, 'language', null)
    if (!w.isestr(language)) language = null; else language = w.cstr(language)
    let userDataDir = _.get(options, 'userDataDir', null)
    if (!w.isestr(userDataDir)) userDataDir = path.join(os.homedir(), '.w-yt-chrome-profile')

    let lastMessage = ''
    let lastReason = 'unknown'

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        let context = null
        let interceptedTranscript = null
        let interceptedTimedtext = null  // { body, url }，路徑 C
        try {
            // 持久 profile：登入態留在 userDataDir，跨執行沿用（Chrome 136+ 只允許對非預設目錄開 CDP）
            context = await chromium.launchPersistentContext(userDataDir, {
                headless,
                channel: chromeChannel,
                args: ['--disable-blink-features=AutomationControlled', '--mute-audio'],
                locale: 'zh-TW',
                viewport: { width: 1280, height: 720 },
            })
            const page = context.pages()[0] || await context.newPage()
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false })
            })

            // 網路攔截：監聽 get_transcript（路徑 B）與播放器 CC 的 timedtext（路徑 C）
            page.on('response', async (res) => {
                const u = res.url()
                if (u.includes('/youtubei/v1/get_transcript')) {
                    try {
                        const body = await res.text()
                        if (res.status() === 200 && body.length > 100 && !interceptedTranscript) {
                            interceptedTranscript = body
                        }
                    } catch { /* noop */ }
                    return
                }
                if (u.includes('/api/timedtext')) {
                    // 必須過濾 v=<videoId>：前置廣告也會抓自己的 timedtext，不濾會拿到廣告字幕
                    if (!new RegExp(`[?&]v=${videoId}(&|$)`).test(u)) return
                    try {
                        const body = await res.text()
                        if (res.status() === 200 && body.length > 100 && !interceptedTimedtext) {
                            interceptedTimedtext = { body, url: u }
                        }
                    } catch { /* noop */ }
                }
            })

            await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout })

            // 等 ytInitialPlayerResponse.captions 就緒
            try {
                await page.waitForFunction(() => {
                    return !!window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
                }, { timeout: captionsWaitMs })
            } catch {
                lastMessage = 'video has no captionTracks (no subtitles available)'
                lastReason = 'no-captions'
                throw new Error(lastMessage)
            }

            const tracks = await page.evaluate(() => {
                return window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks.map((t) => ({
                    languageCode: t.languageCode,
                    name: t.name?.simpleText || t.name?.runs?.[0]?.text || '',
                    kind: t.kind || 'manual',
                }))
            })
            const picked = _pickTrack(tracks, language)

            // 注意：點「顯示轉錄稿」只會載入 YouTube 為本影片決定的「預設」字幕語言，
            // 本流程並未實際切換 UI 字幕語言到 picked。因此只有在「字幕軌唯一」時，
            // 載入內容才必然等於 picked；多軌時無法保證 segments 與 picked 同語言，
            // 此時不可把 picked 的語言碼當成實際內容的語言標籤（會 metadata 與內容不符）。
            const languageVerified = tracks.length === 1

            // 滾到 description 區，讓「顯示轉錄稿」按鈕渲染
            await page.evaluate(() => window.scrollTo(0, 500))
            await sleep(2000)

            // 嘗試展開 description
            await page.evaluate(() => {
                const expand = document.querySelector('tp-yt-paper-button#expand, ytd-text-inline-expander #expand')
                if (expand) expand.click()
            })
            await sleep(1500)

            // 找到按鈕的 element handle，用 Playwright 原生 click（真實滑鼠事件）
            const btnHandle = await page.evaluateHandle((kws) => {
                const all = document.querySelectorAll('button, [role="button"], ytd-button-renderer, tp-yt-paper-button')
                for (const el of all) {
                    const txt = (el.textContent || '').trim()
                    if (kws.some((k) => txt.includes(k) || txt.toLowerCase().includes(k.toLowerCase()))) {
                        return el
                    }
                }
                return null
            }, TRANSCRIPT_BTN_KEYWORDS)

            const btnElem = btnHandle.asElement()
            if (btnElem) {
                await btnElem.scrollIntoViewIfNeeded()
                await sleep(400)
                await btnElem.click()  // 真實滑鼠事件
            } else {
                // 找不到按鈕不再視為致命——路徑 C（播放器 CC）仍可能成功
                process.stderr.write('[fetch-youtube-transcript] "Show transcript" button not found，僅走播放器 CC 備援路徑\n')
            }

            // 路徑 C 觸發：點播放器取得 user gesture／焦點；CC 開啟改由迴圈內「讀狀態再補」確保
            await page.click('#movie_player', { position: { x: 320, y: 180 } }).catch(() => { /* noop */ })
            await sleep(300)

            // 三路徑並行等待
            const start = Date.now()
            let segments = null
            let source = null

            while (Date.now() - start < transcriptWaitMs) {
                const domSegs = await _readSegmentsFromDOM(page)
                if (domSegs.length > 0) {
                    segments = domSegs.map((s) => ({ tMs: _domTimestampToMs(s.t), t: s.t, txt: s.txt }))
                    source = 'dom'
                    break
                }
                if (interceptedTranscript) {
                    const netSegs = _parseGetTranscriptJson(interceptedTranscript)
                    if (netSegs && netSegs.length > 0) {
                        segments = netSegs.map((s) => ({ tMs: s.tMs, t: timestampFromMs(s.tMs), txt: s.txt }))
                        source = 'network'
                        break
                    }
                }
                if (interceptedTimedtext) {
                    const ttSegs = _parseTimedtextJson3(interceptedTimedtext.body)
                    if (ttSegs && ttSegs.length > 0) {
                        segments = ttSegs.map((s) => ({ tMs: s.tMs, t: timestampFromMs(s.tMs), txt: s.txt }))
                        source = 'timedtext'
                        break
                    }
                }
                // 有前置廣告時主影片 timedtext 要等廣告播完才會來：點「略過廣告」須用原生 click
                //（廣告按鈕過濾合成事件，evaluate 內 el.click() 無效）
                try {
                    const skipHandle = await page.evaluateHandle(() => document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'))
                    const skipElem = skipHandle.asElement()
                    if (skipElem) await skipElem.click()
                } catch { /* noop */ }
                // 確保影片在播放（timedtext 由播放器載入；被暫停就永遠等不到）
                const paused = await page.evaluate(() => document.querySelector('#movie_player video')?.paused ?? null).catch(() => null)
                if (paused === true) await page.keyboard.press('k').catch(() => { /* noop */ })
                // 確保 CC 開啟：讀 aria-pressed 判斷狀態再補按 c（避免盲按把已開的 CC 關掉）
                const ccOn = await page.evaluate(() => document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') || null).catch(() => null)
                if (ccOn === 'false') await page.keyboard.press('c').catch(() => { /* noop */ })
                await sleep(POLL_INTERVAL_MS)
            }

            if (!segments) {
                lastMessage = `transcript did not load within ${transcriptWaitMs}ms (button clicked but no segments appeared)`
                lastReason = 'transcript-empty'
                throw new Error(lastMessage)
            }

            // YouTube 同時渲染多個 transcript panel 容器時 DOM 會把每段抓到兩次（觀察：1480/1050/730 段對折為 740/525/365）；用 tMs+txt 去重再依 tMs 排序，對 network 路徑為 no-op
            {
                const seen = new Map()
                for (const s of segments) {
                    const k = `${s.tMs}|${s.txt}`
                    if (!seen.has(k)) seen.set(k, s)
                }
                segments = [...seen.values()].sort((a, b) => a.tMs - b.tMs)
            }

            const timestampedText = segments.map((s) => `[${s.t}] ${s.txt}`).join('\n')
            const plainText = segments.map((s) => s.txt).join('\n')

            // language/languageName/kind 只在能確認實際載入內容時給值：
            //   - 字幕軌唯一 (languageVerified)：載入的必然是那一軌
            //   - 路徑 C (timedtext)：URL 的 lang= / kind=asr 參數直接標明實際載入的軌，最可信
            let effLanguage = languageVerified ? (picked?.languageCode || null) : null
            let effLanguageName = languageVerified ? (picked?.name || null) : null
            let effKind = languageVerified ? (picked?.kind || null) : null
            let effVerified = languageVerified
            if (source === 'timedtext' && interceptedTimedtext?.url) {
                const mLang = interceptedTimedtext.url.match(/[?&]lang=([^&]+)/)
                if (mLang) {
                    effLanguage = decodeURIComponent(mLang[1])
                    effKind = /[?&]kind=asr(&|$)/.test(interceptedTimedtext.url) ? 'asr' : 'manual'
                    effLanguageName = tracks.find((t) => t.languageCode === effLanguage)?.name || null
                    effVerified = true
                }
            }

            return {
                status: 'success',
                url: watchUrl,
                videoId,
                language: effLanguage,
                languageName: effLanguageName,
                kind: effKind,
                languageVerified: effVerified,
                requestedLanguage: picked?.languageCode || null,
                requestedLanguageName: picked?.name || null,
                requestedKind: picked?.kind || null,
                availableTracks: tracks,
                segments,
                segmentsCount: segments.length,
                plainText,
                timestampedText,
                source,
                method: 'playwright-headed-ui',
                fetchedAt,
                attempts: attempt,
            }
        } catch (err) {
            lastMessage = err.message || String(err)
            // 已分類的錯誤直接 propagate
            if (lastReason === 'no-captions' || lastReason === 'transcript-empty') {
                return {
                    status: 'error', url: watchUrl, videoId,
                    message: lastMessage, reason: lastReason,
                    method: 'playwright-headed-ui', fetchedAt, attempts: attempt,
                }
            }
            // 其他例外（瀏覽器啟動、導航等）→ retry
            if (attempt <= MAX_RETRIES) {
                const w = waitMs(attempt)
                process.stderr.write(`[fetch-youtube-transcript] error: ${lastMessage}，等 ${w}ms 後重試 (${attempt}/${MAX_RETRIES})\n`)
                await sleep(w)
                continue
            }
            return {
                status: 'error', url: watchUrl, videoId,
                message: lastMessage, reason: 'playwright-error',
                method: 'playwright-headed-ui', fetchedAt, attempts: attempt,
            }
        } finally {
            if (context) await context.close().catch(() => { /* noop */ })
        }
    }

    return { status: 'error', url: watchUrl, videoId, message: lastMessage || 'max retries exceeded', reason: lastReason || 'unknown', method: 'playwright-headed-ui', fetchedAt, attempts: MAX_RETRIES + 1 }
}

export default fetchYoutubeTranscript
