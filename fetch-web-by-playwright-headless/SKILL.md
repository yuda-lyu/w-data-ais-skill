---
name: fetch-web-by-playwright-headless
description: 用 Playwright 無頭瀏覽器（headless Chrome）抓取網頁原始 HTML。完整 JS 渲染環境，處理 SPA 動態內容（如 X/Twitter、現代 React/Vue/Nuxt 站）。含 Shadow DOM 穿透抓取（適用 Web Components 站如 MSN）。回傳純 HTML 字串，**不做 Readability 解析**——由呼叫端自行解析。可獨立使用，亦可由其他技能（如 fetch-web、知識類抓取技能）單方法呼叫。
---

# fetch-web-by-playwright-headless — 用 Playwright 無頭抓網頁

## 概述

中量級網頁抓取技能：用 **Playwright headless Chrome** 抓網頁，完整 JS 渲染後取得 DOM，回傳原始 HTML 字串。

**特點**：
- 完整 JS 執行環境（取得 SPA 動態渲染後的內容）
- 含 **Shadow DOM 穿透**：自動偵測 Web Components 並用 `page.evaluate` 深入提取（解決 MSN 類站點的 light DOM 為空問題）
- 不做內容解析（純粹回 HTML 給呼叫端）
- 含重試與退避

**適用場景**：SPA 動態頁面（X/Twitter）、Web Components 站、客戶端渲染的新聞站。

**不適用**：
- Cloudflare Turnstile 等需互動驗證的網站 → 改用 `fetch-web-by-playwright-head`（有頭模式可點擊 checkbox）或 `fetch-web-by-camofox`
- DataDome 等進階反自動化偵測 → 改用 `fetch-web-by-playwright-head` 或 `fetch-web-by-camofox`
- 純 SSR 簡單站 → 用更輕量的 `fetch-web-by-curl`

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`playwright`
系統需求：已安裝 Chrome 或 Chromium（透過 `channel: 'chrome'` 直接調用，不需另下載 Chromium）

執行前驗證：
```bash
node -e "require('playwright'); console.log('playwright OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install playwright
```

> Playwright 使用 `channel: 'chrome'` 直接調用系統 Chrome，避免額外下載 ~500MB Chromium binary。

## 執行方式

```bash
node fetch-web-by-playwright-headless/scripts/fetch_web_by_playwright_headless.mjs <url> [outputPath]
```

- `url`（必填）— 要抓取的網頁 URL
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定則印至 stdout

### 範例

```bash
# SPA 站
node fetch-web-by-playwright-headless/scripts/fetch_web_by_playwright_headless.mjs "https://x.com/user/status/123" ./out/result.json

# Nuxt SSR + CSR 混合
node fetch-web-by-playwright-headless/scripts/fetch_web_by_playwright_headless.mjs "https://www.lifeweek.com.cn/some-article"
```

## 程式化呼叫

```javascript
import { fetchWebByPlaywrightHeadless } from './fetch-web-by-playwright-headless/scripts/fetchWebByPlaywrightHeadless.mjs';

const r = await fetchWebByPlaywrightHeadless('https://x.com/user/status/123');
if (r.status === 'success') {
  console.log(r.html);  // 完整渲染後的 HTML
}
```

選項：

```javascript
await fetchWebByPlaywrightHeadless(url, {
  navigationTimeoutMs: 15000, // page.goto timeout，預設 15000
  postNavigationWaitMs: 3000, // 導航後額外等 SPA 渲染（毫秒），預設 3000
  waitForRedirect: false,     // 是否等待 JS 轉址完成（用於 LinkedIn redirect 等）
});
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://x.com/user/status/123",
  "html": "<!DOCTYPE html>...完整渲染後的 HTML...",
  "htmlLength": 152221,
  "method": "playwright-headless",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 1
}
```

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://example.com/article",
  "message": "Navigation timeout exceeded",
  "reason": "playwright-error",
  "method": "playwright-headless",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 6
}
```

`reason` 列舉：`playwright-error`（瀏覽器啟動／導航／渲染失敗）、`missing-deps`（playwright 未安裝）、`invalid-url`（URL 格式錯）。

## status 約定

依全庫慣例：
- `status: "success"` — 成功取得 HTML（且 page.goto 完成）
- `status: "error"` — 抓不到（含瀏覽器啟動失敗、導航超時、渲染拋例外、依賴未裝）

## Shadow DOM 穿透

對於可見文字 < 200 字的頁面（Web Components 站特徵），自動透過 `page.evaluate` 遍歷所有 element 的 `shadowRoot`，提取 deep innerText 並包裝成簡易 HTML 回傳。這解決：
- **MSN**（Microsoft Edge 新聞站）— 文章正文渲染在 `<msn-article>` 等 Web Component 內
- **某些企業 SPA** — 客製 element 含影子根節點

## 重試與超時

- 瀏覽器啟動／導航失敗 → 重試
- **最多重試 5 次，含初始請求最多執行 6 次**，線性遞增退避（3s → 6s → 9s → 12s → 15s）
- 單次 `page.goto` 預設 15 秒超時（可由 `options.navigationTimeoutMs` 覆寫）
- 導航後預設等 3 秒讓 SPA 渲染（可由 `options.postNavigationWaitMs` 覆寫）

## 安全設計

- 寫檔路徑經 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名（`nul`、`con`、`prn`、`aux`、`com1-9`、`lpt1-9`）
- `browser.close()` 放在 `finally` 區塊，確保資源釋放（即使拋例外）

## 邊界與已知限制

1. **不解析 HTML**：本技能只回原始 HTML；要提取文章正文請呼叫端自行用 Readability/cheerio 等
2. **不執行人機驗證互動**：headless 模式無法可靠點擊 Cloudflare/Turnstile checkbox，這類站請改用 `fetch-web-by-playwright-head`
3. **資源耗用較高**：每次呼叫啟動 Chrome 進程（~200MB RAM），抓完關閉
4. **重試與超時**：最多重試 5 次，**含初始請求最多執行 6 次**；單次導航 15 秒超時；線性退避上限 15 秒
