---
name: fetch-web-by-playwright-head
description: 用 Playwright 有頭瀏覽器（headed Chrome）抓取網頁原始 HTML，可繞過 DataDome 等進階反自動化偵測。**自動偵測並點擊 Cloudflare Turnstile / hCaptcha 等驗證 checkbox**（用模擬人類滑鼠軌跡），含 Shadow DOM 穿透。回傳純 HTML 字串，**不做 Readability 解析**——由呼叫端自行解析。需要桌面 session（不能在純 SSH/CI 環境執行）。可獨立使用，亦可由其他技能（如 fetch-web、知識類抓取技能）單方法呼叫。
---

# fetch-web-by-playwright-head — 用 Playwright 有頭抓網頁（含驗證點擊）

## 概述

中重量級網頁抓取技能：用 **Playwright headed Chrome** 抓網頁，**有實體視窗**，可繞過：
- **DataDome / PerimeterX** 等進階反自動化偵測（檢查瀏覽器自動化特徵）
- **Cloudflare Turnstile / hCaptcha checkbox** — 自動偵測並點擊（模擬人類滑鼠軌跡：起點 → 2-3 個中途點 → 目標）
- 隱藏 `navigator.webdriver` 標記

回傳原始 HTML 字串。

**特點**：
- 有頭視窗 + 反自動化偽裝（隱藏 webdriver flag、加 `--disable-blink-features=AutomationControlled`）
- 自動點擊驗證 iframe（DOM 中 / Cloudflare managed challenge frame）
- 模擬人類滑鼠軌跡（隨機起點 → 中途點 → 目標 + 隨機停頓）
- 含 **Shadow DOM 穿透**
- 不做內容解析（純粹回 HTML 給呼叫端）
- 含重試與退避

**適用場景**：DataDome 偵測站（如 WSJ）、有 Cloudflare Turnstile 的站、隱藏 webdriver 標記後可通過的站。

**不適用**：
- 無桌面 session 的環境（純 SSH、無 X server 的 Linux、Docker container 沒裝 X11） → 改用 `fetch-web-by-playwright-headless` 或 `fetch-web-by-camofox`
- Cloudflare Turnstile 仍擋的進階站 → 改用 `fetch-web-by-camofox`
- 純 SSR 簡單站 → 用更輕量的 `fetch-web-by-curl`

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`playwright`
系統需求：
- 已安裝 Chrome 或 Chromium（透過 `channel: 'chrome'` 直接調用）
- **桌面 session**（Windows 桌面、macOS Aqua、Linux X11/Wayland），有頭模式必須能開實體視窗

執行前驗證：
```bash
node -e "require('playwright'); console.log('playwright OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定）：
```bash
npm install playwright
```

> ⚠️ **本技能必須在有桌面 session 的環境執行**。若在純 CLI（無 X11/無桌面）環境，Chrome 會啟動失敗，請改用 headless 版（`fetch-web-by-playwright-headless`）。

## 執行方式

```bash
node fetch-web-by-playwright-head/scripts/fetch_web_by_playwright_head.mjs <url> [outputPath]
```

- `url`（必填）— 要抓取的網頁 URL
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定則印至 stdout

### 範例

```bash
# DataDome 偵測站
node fetch-web-by-playwright-head/scripts/fetch_web_by_playwright_head.mjs "https://www.wsj.com/articles/xxx"

# Cloudflare Turnstile 站
node fetch-web-by-playwright-head/scripts/fetch_web_by_playwright_head.mjs "https://example-cf-protected.com/article" ./out.json
```

## 程式化呼叫

```javascript
import { fetchWebByPlaywrightHead } from './fetch-web-by-playwright-head/scripts/fetchWebByPlaywrightHead.mjs';

const r = await fetchWebByPlaywrightHead('https://www.wsj.com/articles/xxx');
if (r.status === 'success') {
  console.log(r.html);
  console.log('verification clicked:', r.verificationClicked);
}
```

選項：

```javascript
await fetchWebByPlaywrightHead(url, {
  navigationTimeoutMs: 15000,    // page.goto timeout，預設 15000
  postNavigationWaitMs: 5000,    // 導航後額外等渲染，預設 5000
  waitForRedirect: false,        // 是否等待 JS 轉址完成
  skipVerificationClick: false,  // 跳過自動驗證點擊（預設啟用）
});
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://www.wsj.com/articles/xxx",
  "html": "<!DOCTYPE html>...",
  "htmlLength": 152221,
  "verificationClicked": true,
  "method": "playwright-headed",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 1
}
```

`verificationClicked` 為 `true` 表示有偵測並點擊了驗證 checkbox（Cloudflare/Turnstile/hCaptcha）。

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://example.com/article",
  "message": "Navigation timeout exceeded",
  "reason": "playwright-error",
  "method": "playwright-headed",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 6
}
```

`reason` 列舉：`playwright-error`、`missing-deps`、`invalid-url`。

## status 約定

依全庫慣例：
- `status: "success"` — 成功取得 HTML
- `status: "error"` — 抓不到（含瀏覽器啟動失敗、桌面 session 不可用、導航超時、依賴未裝）

## 反自動化措施

1. **`headless: false`** — 啟動實體視窗
2. **`--disable-blink-features=AutomationControlled`** — 隱藏 Chrome 自動化提示
3. **`navigator.webdriver = false`** — 透過 `addInitScript` 注入到每個頁面
4. **`humanClick`** — 模擬人類滑鼠軌跡：
   - 隨機起點（左下角附近）
   - 2-3 個中途點 + 隨機抖動
   - 每段 80-200ms 停頓
   - 抵達後再 50-150ms 才點擊

## 自動偵測並點擊驗證 checkbox

支援兩種模式：

### A. DOM 內可見的 iframe（傳統嵌入）

偵測 selector：
- `iframe[src*="challenges.cloudflare.com"]`
- `iframe[src*="/cdn-cgi/challenge-platform"]`
- `.cf-turnstile iframe`
- `iframe[src*="hcaptcha.com"]`

找到後取得 boundingBox，點擊中心點，等 5 秒後再 networkidle。

### B. Cloudflare managed challenge 整頁驗證

整頁包成 iframe 用 `challenges.cloudflare.com` 載入，DOM 中無嵌入 iframe 元素，需透過 `page.frames()` 偵測：
- 優先用 `#turnstile-container` / `.cf-turnstile` 容器定位
- fallback 到 viewport 39% × 57% 的固定位置

點擊後等 8 秒讓驗證完成。

## 重試與超時

- 瀏覽器啟動／導航失敗 → 重試
- **最多重試 5 次，含初始請求最多執行 6 次**，線性遞增退避（3s → 6s → 9s → 12s → 15s）
- 單次 `page.goto` 預設 15 秒超時（可由 `options.navigationTimeoutMs` 覆寫）
- 導航後預設等 5 秒讓有頭模式 + 驗證點擊完成

## 安全設計

- 寫檔路徑經 `_WIN_RESERVED_RE` 防護
- `browser.close()` 放在 `finally` 確保資源釋放

## 邊界與已知限制

1. **必須有桌面 session**：純 SSH/CI 環境會失敗，改用 headless 版
2. **不解析 HTML**：本技能只回原始 HTML
3. **驗證點擊不保證成功**：部分 Cloudflare 進階變體無法自動過，需 `fetch-web-by-camofox`
4. **資源耗用較高**：實體視窗 + 較長等待時間（5-15s）
5. **重試與超時**：最多重試 5 次，**含初始請求最多執行 6 次**；單次導航 15 秒超時；線性退避上限 15 秒
