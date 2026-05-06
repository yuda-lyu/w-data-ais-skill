---
name: fetch-youtube-transcript
description: 用 Playwright + 本機 Chrome 抓取 YouTube 影片字幕（轉錄稿），走 YouTube 自家「顯示轉錄稿」UI 流程繞過 timedtext POT (Proof of Origin Token) 限制與 IP rate limit。雙路徑（DOM 讀取 + 網路攔截）並行確保穩定。回傳結構化 segments（含時戳與純文字版）。適用於需穩定批次抓取 YouTube 字幕的 AI Agent / 知識庫匯入流程。
---

# fetch-youtube-transcript — 用本機 Chrome 抓 YouTube 字幕

## 概述

抓取 YouTube 影片字幕（含手動字幕與自動字幕），回傳結構化 segments（每段含時戳、毫秒、文字）以及方便直接使用的 `timestampedText`、`plainText` 字串。

**特點**：
- 用 Playwright 啟動本機 Chrome（`channel: 'chrome'`），完整 TLS 指紋與 Sec-Fetch 標頭
- 拋棄式 profile（每次乾淨，跑完即丟），不碰使用者個人 Chrome profile
- **不直接打 `/api/timedtext`**——避免 POT (Proof of Origin Token) 強制檢查（自 2025 年起 YouTube 對該端點要求 POT，否則回 200 + 空 body）
- 走 YouTube 自家「顯示轉錄稿」UI 流程，讓前端 JS 自動帶 POT 呼叫內部 `/youtubei/v1/get_transcript`
- 用 Playwright 原生 click（送真實滑鼠事件 down→move→up），繞過 YouTube 對合成 click 事件的過濾
- **雙路徑並行等待**：DOM 讀取 + 網路攔截，誰先成功用誰，互為備援

**適用場景**：
- 批次抓取 YouTube 影片字幕到知識庫
- 影片內容摘要、翻譯前置處理
- AI Agent 自動化研究流程

**不適用**：
- 沒有提供字幕的影片（會回 `reason: 'no-captions'`）
- 會員專屬／年齡限制／私人影片（需登入態，可改 `profileDir` 指向已登入 Chrome profile）
- 一次跑數百部以上的高頻場景（YouTube 仍可能對 InnerTube 觸發其他層的反爬，建議加 throttling）

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`playwright`
系統需求：已安裝 Chrome（透過 `channel: 'chrome'` 直接調用，不需另下載 Chromium）

執行前驗證：
```bash
node -e "require('playwright'); console.log('playwright OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install playwright
```

## 技術原理

### 為什麼非用 Playwright + UI 不可

| 直接做法 | 失敗原因 |
|---|---|
| `fetch('https://youtube.com/api/timedtext?v=...&fmt=json3')` | HTTP 429（IP rate limit ~5 req/10s）|
| 帶完整 cookies + Chrome UA 直送 timedtext | 仍 429 或回 200 空 body（POT 檢查） |
| Playwright headless 直接打 timedtext | 同上 |
| Playwright `page.evaluate(() => button.click())` | YouTube 過濾合成事件，內部 API 不會被觸發 |

### 本技能的做法

```
1. 啟動本機 Chrome（chromium.launch，拋棄式 profile）
2. goto watch 頁
3. 等 ytInitialPlayerResponse.captions 就緒（確認影片有字幕）
4. 滾動 + 展開 description（讓「顯示轉錄稿」按鈕渲染）
5. Playwright 原生 .click() 按按鈕（真實滑鼠事件）
6. 並行等待：
   (A) DOM: ytd-transcript-segment-renderer 出現
   (B) 網路: /youtubei/v1/get_transcript 回應
   ↓ 誰先成功用誰
7. 解析 segments → 回傳結構化資料
```

## 執行方式

### CLI

```bash
node fetch-youtube-transcript/scripts/fetch_youtube_transcript.mjs <url-or-id> [outputPath] [--language=zh-TW] [--headless]
```

- `url-or-id`（必填）— YouTube watch URL / youtu.be 短網址 / shorts URL / 11 字 video ID
- `outputPath`（選填）— 輸出 JSON 路徑；未指定則印至 stdout
- `--language=`（選填）— 偏好字幕語言（如 `zh-TW`, `en`）；未指定則 zh-TW > zh-Hant > zh > en > 第一個
- `--headless`（選填）— 無頭模式；預設有頭（YouTube 偵測到 headless 會拒絕載入轉錄稿，**不建議開**）

### 範例

```bash
# 抓單一影片，輸出至檔案
node fetch-youtube-transcript/scripts/fetch_youtube_transcript.mjs "https://www.youtube.com/watch?v=o_a10NNhUOE" ./out/sherry-1.json

# 直接傳 video ID
node fetch-youtube-transcript/scripts/fetch_youtube_transcript.mjs o_a10NNhUOE

# 指定英文字幕
node fetch-youtube-transcript/scripts/fetch_youtube_transcript.mjs "https://youtu.be/dQw4w9WgXcQ" ./out/rick.json --language=en
```

## 程式化呼叫

```javascript
import { fetchYoutubeTranscript } from './fetch-youtube-transcript/scripts/fetchYoutubeTranscript.mjs';

const r = await fetchYoutubeTranscript('https://www.youtube.com/watch?v=o_a10NNhUOE');
if (r.status === 'success') {
  console.log(r.timestampedText);  // 帶時戳的純文字
  console.log(r.plainText);        // 純文字（無時戳）
  console.log(r.segments);         // [{tMs, t, txt}, ...]
}
```

選項：

```javascript
await fetchYoutubeTranscript(url, {
  language: 'zh-TW',                    // 偏好字幕語言
  headless: false,                      // 預設 false（YouTube 偵測 headless 會擋）
  chromeChannel: 'chrome',              // playwright launch channel
  navigationTimeoutMs: 30000,
  captionsWaitMs: 30000,                // 等 ytInitialPlayerResponse 的 timeout
  transcriptWaitMs: 30000,              // 等 transcript 載入的 timeout
});
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://www.youtube.com/watch?v=o_a10NNhUOE",
  "videoId": "o_a10NNhUOE",
  "language": "zh-TW",
  "languageName": "中文（台灣）",
  "kind": "manual",
  "availableTracks": [
    { "languageCode": "zh-TW", "name": "中文（台灣）", "kind": "manual" }
  ],
  "segments": [
    { "tMs": 0, "t": "00:00", "txt": "聽說你的留言當中..." },
    { "tMs": 6000, "t": "00:06", "txt": "比較能夠同理..." }
  ],
  "segmentsCount": 740,
  "plainText": "聽說你的留言當中...\n比較能夠同理...",
  "timestampedText": "[00:00] 聽說你的留言當中...\n[00:06] 比較能夠同理...",
  "source": "dom",
  "method": "playwright-headed-ui",
  "fetchedAt": "2026-05-05 10:30:00",
  "attempts": 1
}
```

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://www.youtube.com/watch?v=xxx",
  "videoId": "xxx",
  "message": "video has no captionTracks (no subtitles available)",
  "reason": "no-captions",
  "method": "playwright-headed-ui",
  "fetchedAt": "2026-05-05 10:30:00",
  "attempts": 1
}
```

`reason` 列舉：
- `invalid-url` — URL 格式錯，或無法解析出 video ID
- `missing-deps` — playwright 未安裝
- `no-captions` — 影片沒有字幕（`ytInitialPlayerResponse` 沒 captionTracks）
- `button-not-found` — 找不到「顯示轉錄稿」按鈕（影片可能未啟用 transcript）
- `transcript-empty` — 按鈕點了但 30 秒內 panel 沒載入 segments
- `playwright-error` — 瀏覽器啟動／導航／例外

`source` 列舉（成功時）：`dom` 或 `network`

## status 約定

依全庫慣例：
- `status: "success"` — 成功取得至少 1 個 segment
- `status: "error"` — 抓不到（含無字幕、按鈕找不到、載入超時、依賴未裝、URL 格式錯）

## 字幕語言挑選邏輯

未指定 `language` 時的預設偏好序：

1. 偏好「手動字幕」(`kind === 'manual'`) 而非「自動字幕」(`kind === 'asr'`)
2. 在偏好的池內按下列序挑：`zh-TW` → `zh-Hant` → `zh` → `en` → 第一個

指定 `language` 時：
- 精確比對 `languageCode`，含前綴匹配（如 `language: 'zh'` 命中 `zh-TW`、`zh-CN` 等）
- 找不到則 fallback 到預設偏好序

## 重試與超時

- 瀏覽器啟動／導航失敗 → 重試
- **最多重試 2 次，含初始請求最多執行 3 次**，線性遞增退避（3s → 6s → 9s）
- 已分類錯誤（`no-captions`、`button-not-found`、`transcript-empty`）**不重試**
- 預設超時：navigation 30s、captions 等待 30s、transcript 載入 30s

## 安全設計

- 寫檔路徑經 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名（`nul`、`con`、`prn`、`aux`、`com1-9`、`lpt1-9`）
- `browser.close()` 放在 `finally` 區塊，確保資源釋放（即使拋例外）
- 拋棄式 profile（Playwright 自動建 temp dir，跑完丟棄），不會碰使用者個人 Chrome profile

## 邊界與已知限制

1. **必須有桌面 session**：預設有頭模式需 Windows 桌面 environment（headless 模式 YouTube 易偵測，不建議）
2. **批次需 throttling**：本技能不內建批次節流；多部影片連續呼叫時，建議外部加 `await sleep(5000+)` 之類間隔，避免觸發其他層反爬
3. **字幕內容由 YouTube 提供**：本技能不做 OCR 或 ASR，只取 YouTube 已有的字幕資料
4. **時戳精度**：DOM 路徑時戳是顯示字串（精到秒），網路路徑時戳是毫秒；segments 物件兩種都帶（`tMs` + `t`）

## 為什麼不用 youtube-transcript / youtubei.js / yt-dlp

實測（2026-05）：
- `youtube-transcript` (npm)：`YoutubeTranscriptNotAvailableError`，與當前 YouTube API 結構不符
- `youtubei.js` 內建 `getTranscript()`：HTTP 400 `Precondition check failed`（YouTube 改 params 格式）
- `youtubei.js` 自抓 timedtext URL：HTTP 429（IP rate limit）
- `yt-dlp` + Chrome cookies：DPAPI 解密失敗（Chrome 127+ ABE）
- `yt-dlp` + Firefox cookies：cookies 抽得到，但 timedtext 端點仍 429
- `yt-dlp` 直接打 timedtext：429 + POT 要求

→ 唯一穩定路徑：走 YouTube 自家 UI，讓前端 JS 自動處理 POT 與 InnerTube 認證
