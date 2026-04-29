---
name: fetch-web-by-curl
description: 用系統 `curl` 抓取網頁原始 HTML，繞過層級 1-3 反爬蟲（UA/Headers/TLS 指紋）。零瀏覽器依賴、最快、最輕量；適合大多數 SSR 新聞網站。回傳純 HTML 字串，**不做 Readability 解析**——由呼叫端自行解析。可獨立使用，亦可由其他技能（如 fetch-web、知識類抓取技能）單方法呼叫。
---

# fetch-web-by-curl — 用 curl 抓網頁原始 HTML

## 概述

最輕量的網頁抓取技能：用系統 `curl` 帶仿瀏覽器 headers（UA、Accept、Accept-Language、Referer）抓取網頁，回傳**原始 HTML 字串**。透過 `execFileSync` 安全傳參（避免命令注入）。

**特點**：
- 零 npm 依賴（只需系統有 `curl`）
- 速度最快（1-2s）
- 繞過 OpenSSL TLS 指紋偵測（Node.js 內建 `fetch` 易被 BoringSSL 指紋擋下，curl 不會）
- 不做內容解析（純粹回 HTML 給呼叫端）
- 含重試與退避

**適用場景**：大多數 SSR 新聞網站、政府公開資料站、學術評論站。

**不適用**：純 SPA（如 X/Twitter）、Cloudflare Turnstile 保護站、DataDome 偵測站 → 改用 `fetch-web-by-playwright-headless` / `fetch-web-by-playwright-head` / `fetch-web-by-camofox`。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

**零 npm 依賴**——只用 Node.js 內建 `child_process`、`fs`、`path` 模組。

系統需求：`curl` 命令可用
- **Windows 10 1803+ / Windows 11**：已內建 `curl.exe`
- **macOS**：已內建
- **Linux**：通常內建；若無請 `apt/yum/apk install curl`

執行前驗證：
```bash
curl --version
node --version    # 需 >= v18
```

## 執行方式

```bash
node fetch-web-by-curl/scripts/fetch_web_by_curl.mjs <url> [outputPath]
```

- `url`（必填）— 要抓取的網頁 URL
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定則印至 stdout

### 範例

```bash
# 印至 stdout
node fetch-web-by-curl/scripts/fetch_web_by_curl.mjs "https://example.com/article"

# 寫至檔案
node fetch-web-by-curl/scripts/fetch_web_by_curl.mjs "https://example.com/article" ./out/result.json
```

## 程式化呼叫

```javascript
import { fetchWebByCurl } from './fetch-web-by-curl/scripts/fetchWebByCurl.mjs';

const r = await fetchWebByCurl('https://example.com/article');
if (r.status === 'success') {
  console.log(r.html);  // 原始 HTML 字串
}
```

選項：

```javascript
await fetchWebByCurl(url, {
  timeoutMs: 15000,    // curl --max-time（毫秒），預設 15000
  userAgent: '...',    // 自訂 UA；預設為 Chrome 131 桌面版
  referer: '...',      // Referer 標頭；預設 https://www.google.com/
  acceptLanguage: '...', // Accept-Language；預設 en-US,en;q=0.9,zh-TW;q=0.8
});
```

## 輸出格式

統一回傳結構：

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://example.com/article",
  "html": "<!DOCTYPE html>...原始 HTML...",
  "htmlLength": 45221,
  "httpCode": 200,
  "method": "curl",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 1
}
```

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://example.com/article",
  "message": "HTTP 403",
  "reason": "http-error",
  "httpCode": 403,
  "method": "curl",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 6
}
```

`reason` 列舉：`http-error`（4xx/5xx）、`empty-response`（HTML < 100 字元）、`curl-error`（curl 進程錯誤、timeout）、`network-error`（網路層錯誤）、`invalid-url`（URL 格式錯）。

## status 約定

依全庫慣例：
- `status: "success"` — 抓到 HTML 且 HTTP 2xx
- `status: "error"` — 抓不到（含 HTTP 4xx/5xx 已重試耗盡、curl 錯誤、超時）

呼叫端**僅看 `status` 即可分支**。`htmlLength === 0` 不會出現於 `success`（最小判定為 100 字元；少於 100 視為 error）。

## 重試與超時

- HTTP 5xx / 429 → 重試
- curl 進程錯誤（網路、超時）→ 重試
- HTTP 4xx（除 429）→ 不重試（語意性錯誤）
- 重試策略：**最多重試 5 次，含初始請求最多執行 6 次**，線性遞增退避（3s → 6s → 9s → 12s → 15s）
- 單次請求超時：`--max-time` 預設 15 秒，可由 `options.timeoutMs` 覆寫

## 安全設計

- URL 透過 `execFileSync` 參數陣列傳遞（**非 shell 字串拼接**，防命令注入）
- 寫檔路徑經過 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名（`nul`、`con`、`prn`、`aux`、`com1-9`、`lpt1-9`）
- curl 同時用 `--max-time` + `execFileSync timeout` 雙重超時保護

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|---|---|---|
| `HTTP 403` | TLS 指紋仍被擋 | 升級到 `fetch-web-by-playwright-headless` |
| `empty-response` | 頁面為純 SPA | 升級到 `fetch-web-by-playwright-headless` |
| `Cloudflare challenge` 字眼出現於 HTML | 需要 captcha 驗證 | 升級到 `fetch-web-by-playwright-head` 或 `fetch-web-by-camofox` |
| `curl: command not found` | 系統無 curl | Windows 升級到 1803+；Linux 安裝 curl 套件 |

## 邊界與已知限制

1. **不解析 HTML**：本技能只回原始 HTML；要提取文章正文請呼叫端自行用 Readability/cheerio 等
2. **不偵測 captcha 內容**：HTML 含 captcha 頁但 HTTP 200 時，`status: "success"` 仍會回傳；呼叫端須自行檢查 HTML 內容
3. **不處理 JS 渲染**：純 HTTP 抓取，不執行 JavaScript；SPA 無法取得實際內容
4. **重試與超時**：最多重試 5 次，**含初始請求最多執行 6 次**；單次請求 15 秒超時；指數遞增退避上限 15 秒
