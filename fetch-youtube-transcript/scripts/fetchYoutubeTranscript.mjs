// fetchYoutubeTranscript.mjs — 用 Playwright + 本機 Chrome 抓 YouTube 影片字幕
//
// 對外匯出 fetchYoutubeTranscript(url, options) → { status, ... }
//
// 核心策略：
//   開本機 Chrome → 走 YouTube 自家 UI 流程（不直接打 timedtext，避免 POT 檢查）：
//     1. goto watch 頁
//     2. 等 ytInitialPlayerResponse.captions 就緒
//     3. 點「顯示轉錄稿」按鈕（用 Playwright 原生 click，繞過合成事件偵測）
//     4. 雙路徑並行等待結果：
//        (A) DOM 讀取：監看 ytd-transcript-segment-renderer 出現
//        (B) 網路攔截：監聽 /youtubei/v1/get_transcript 回應
//     5. 誰先成功用誰
//
// 為什麼這樣設計：
//   - 直接打 youtube.com/api/timedtext：自 2025 年起需 POT (Proof of Origin Token)
//     才會回 JSON，否則回 200 + 空 body
//   - get_transcript 是 YouTube InnerTube 內部 API，由前端 JS 自動帶 POT 呼叫
//     讓 UI 自己跑這個流程是最穩的做法
//   - 合成事件 (el.click() via evaluate) 會被 YouTube 過濾，必須用真實滑鼠事件

const MAX_RETRIES = 2  // 含初始最多 3 次
const INITIAL_WAIT_MS = 3000
const MAX_WAIT_MS = 9000
const DEFAULT_NAV_TIMEOUT_MS = 30000
const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 30000
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
 * @param {number} [options.navigationTimeoutMs=30000]
 * @param {number} [options.captionsWaitMs=30000] - 等 ytInitialPlayerResponse 的 timeout
 * @param {number} [options.transcriptWaitMs=30000] - 等 transcript 載入的 timeout
 * @returns {Promise<object>} {status, url, videoId, language, languageName, kind, languageVerified, requestedLanguage, requestedLanguageName, requestedKind, segments, plainText, timestampedText, source, fetchedAt, attempts, ...}
 *   注意：點「顯示轉錄稿」載入的是 YouTube 為本影片決定的「預設」字幕語言，本流程不切換 UI 字幕語言。
 *   故 language/languageName/kind 僅在 languageVerified（字幕軌唯一）時反映實際載入內容；多軌時為 null。
 *   requestedLanguage* 永遠記錄偏好挑選到的 track，供參考但不保證等於實際載入語言。
 */
export async function fetchYoutubeTranscript(url, options = {}) {
    const fetchedAt = ts()

    const videoId = _extractVideoId(url)
    if (!videoId) {
        return { status: 'error', url: String(url), message: 'invalid YouTube URL or video ID', reason: 'invalid-url', fetchedAt, attempts: 0 }
    }
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

    let chromium
    try {
        ({ chromium } = await import('playwright'))
    } catch (err) {
        return { status: 'error', url: watchUrl, videoId, message: 'playwright not installed (npm install playwright)', reason: 'missing-deps', fetchedAt, attempts: 0 }
    }

    const headless = options.headless ?? false
    const chromeChannel = options.chromeChannel ?? 'chrome'
    const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS
    const captionsWaitMs = options.captionsWaitMs ?? DEFAULT_CAPTIONS_TIMEOUT_MS
    const transcriptWaitMs = options.transcriptWaitMs ?? DEFAULT_TRANSCRIPT_TIMEOUT_MS

    let lastMessage = ''
    let lastReason = 'unknown'

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        let browser = null
        let interceptedTranscript = null
        try {
            browser = await chromium.launch({
                headless,
                channel: chromeChannel,
                args: ['--disable-blink-features=AutomationControlled', '--mute-audio'],
            })
            const context = await browser.newContext({
                locale: 'zh-TW',
                viewport: { width: 1280, height: 720 },
            })
            const page = await context.newPage()
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false })
            })

            // 網路攔截：監聽 get_transcript
            page.on('response', async (res) => {
                const u = res.url()
                if (!u.includes('/youtubei/v1/get_transcript')) return
                try {
                    const body = await res.text()
                    if (res.status() === 200 && body.length > 100 && !interceptedTranscript) {
                        interceptedTranscript = body
                    }
                } catch { /* noop */ }
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
            const picked = _pickTrack(tracks, options.language)

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
            if (!btnElem) {
                lastMessage = '"Show transcript" button not found (video may not have transcript available)'
                lastReason = 'button-not-found'
                throw new Error(lastMessage)
            }

            await btnElem.scrollIntoViewIfNeeded()
            await sleep(400)
            await btnElem.click()  // 真實滑鼠事件

            // 雙路徑並行等待
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

            return {
                status: 'success',
                url: watchUrl,
                videoId,
                // language/languageName/kind 只在「字幕軌唯一」(languageVerified) 時反映實際載入內容；
                // 多軌時無法確認載入語言，設 null 避免誤標。requestedLanguage* 永遠記錄「想要的」track 供參考。
                language: languageVerified ? (picked?.languageCode || null) : null,
                languageName: languageVerified ? (picked?.name || null) : null,
                kind: languageVerified ? (picked?.kind || null) : null,
                languageVerified,
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
            if (lastReason === 'no-captions' || lastReason === 'button-not-found' || lastReason === 'transcript-empty') {
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
            if (browser) await browser.close().catch(() => { /* noop */ })
        }
    }

    return { status: 'error', url: watchUrl, videoId, message: lastMessage || 'max retries exceeded', reason: lastReason || 'unknown', method: 'playwright-headed-ui', fetchedAt, attempts: MAX_RETRIES + 1 }
}

export default fetchYoutubeTranscript
