---
name: fetch-web-by-camofox
description: 用 Camofox（Camoufox 修改版 Firefox）反偵測瀏覽器抓取網頁，可繞過 Cloudflare Turnstile 等進階反自動化偵測。透過 accessibility snapshot 取得結構化頁面資料並轉換為 HTML。回傳 HTML 字串與原始 snapshot，**不做 Readability 解析**——由呼叫端自行解析。適用於 Playwright headless/headed 都過不了的進階驗證站（如微信公眾號）。可獨立使用，亦可由其他技能（如 fetch-web、知識類抓取技能）單方法呼叫。
---

# fetch-web-by-camofox — 用 Camofox 反偵測瀏覽器抓網頁

## 概述

最重量級網頁抓取技能：用 **Camoufox**（修改版 Firefox，反指紋／反自動化偵測強化）抓網頁，可繞過：
- **Cloudflare Turnstile** 等進階驗證
- 高強度瀏覽器指紋偵測
- 阿里雲驗證碼／騰訊驗證等

回傳兩種內容：
- `html`：Camofox 輸出的 **accessibility snapshot 轉換後 HTML**（簡化結構，含 `<h1>` `<p>` `<li>` 等語意元素）
- `snapshot`：原始 accessibility snapshot 字串（保留完整層級結構，給需要深度解析的呼叫端）

**特點**：
- 啟動 Camofox server（spawn `node server.js`）→ 開 tab → 取 snapshot → 關 tab → 殺 server
- snapshot 抓取含內部重試（部分網站需等驗證頁通過，預設重試 3 次）
- Windows 上殺 server 用 `taskkill /F /T` 清整棵進程樹（避免殘留 Firefox orphan）
- 含整體重試與退避

**適用場景**：
- 微信公眾號文章
- Cloudflare Turnstile 保護站
- 阿里雲 Captcha 站
- 其他 Playwright headless/headed 都過不了的站

**不適用**：
- 純 SSR 站 → 用 `fetch-web-by-curl`（快得多）
- 一般 SPA 站 → 用 `fetch-web-by-playwright-headless`
- DataDome 站 → 用 `fetch-web-by-playwright-head`（更快）

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`@askjo/camofox-browser`

執行前驗證：
```bash
node -e "import('@askjo/camofox-browser').then(() => console.log('camofox OK'))"
```

若顯示錯誤則安裝（安裝位置由執行環境決定）：
```bash
npm install @askjo/camofox-browser
```

> Camofox 為修改版 Firefox（Camoufox），首次安裝會下載 Firefox binary（~200MB）。
>
> 系統需求：
> - 桌面 session 或 Xvfb（Camofox 預設可在無頭模式運行，但建議有桌面更穩）
> - Windows 10+、macOS、Linux（含 X11/Wayland）

## 執行方式

```bash
node fetch-web-by-camofox/scripts/fetch_web_by_camofox.mjs <url> [outputPath]
```

- `url`（必填）— 要抓取的網頁 URL
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定則印至 stdout

### 範例

```bash
# 微信公眾號
node fetch-web-by-camofox/scripts/fetch_web_by_camofox.mjs "https://mp.weixin.qq.com/s/xxxxx" ./out.json

# Cloudflare Turnstile 保護站
node fetch-web-by-camofox/scripts/fetch_web_by_camofox.mjs "https://example-cf-protected.com/article"
```

## 程式化呼叫

```javascript
import { fetchWebByCamofox } from './fetch-web-by-camofox/scripts/fetchWebByCamofox.mjs';

const r = await fetchWebByCamofox('https://mp.weixin.qq.com/s/xxxxx');
if (r.status === 'success') {
  console.log(r.html);      // 轉換後 HTML（給 Readability 等用）
  console.log(r.snapshot);  // 原始 accessibility snapshot
}
```

選項：

```javascript
await fetchWebByCamofox(url, {
  port: 19377,                    // Camofox server port，預設 19377
  serverStartTimeoutMs: 30000,    // server 啟動最長等待，預設 30s
  snapshotRetries: 3,             // snapshot 內部重試次數（含初始 4 次），預設 3
  snapshotWaitMs: 5000,           // snapshot 重試間隔，預設 5s
});
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://mp.weixin.qq.com/s/xxxxx",
  "html": "<!DOCTYPE html>...轉換後 HTML...",
  "htmlLength": 8221,
  "snapshot": "- heading \"...\" [level=1]\n  - paragraph: \"...\"\n  ...",
  "snapshotChars": 6543,
  "method": "camofox",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 1
}
```

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://example.com/article",
  "message": "camofox server failed to start",
  "reason": "camofox-error",
  "method": "camofox",
  "fetchedAt": "2026-04-29T15:30:00.000Z",
  "attempts": 6
}
```

`reason` 列舉：
- `camofox-not-found`：未安裝 `@askjo/camofox-browser`
- `camofox-error`：server 啟動失敗、tab 建立失敗、API 例外
- `camofox-empty`：snapshot 內容過短（< 50 字）
- `invalid-url`：URL 格式錯

## status 約定

依全庫慣例：
- `status: "success"` — 成功取得 snapshot 且字數 ≥ 50
- `status: "error"` — 抓不到（含 server 啟動失敗、snapshot 為空、依賴未裝）

## accessibility snapshot → HTML 轉換

snapshot 為 Camofox 輸出的層級式文字（類似 markdown outline），本技能將其轉為簡易 HTML 供 Readability 等解析器使用。轉換規則：

| snapshot 元素 | HTML |
|---|---|
| `heading "..." [level=N]` | `<hN>...</hN>` |
| `paragraph: "..."` | `<p>...</p>` |
| `listitem: "..."` | `<li>...</li>` |
| `strong: "..."` | `<strong>...</strong>` |
| `emphasis: "..."` | `<em>...</em>` |
| `text: "..."` | `<span>...</span>` |
| `option "..."` | `<p>...</p>`（微信附註）|
| `img "alt"` | `<img alt="...">` |
| `button` / `banner` / `navigation` / `main` / `contentinfo` / `complementary` / `list` | 跳過（結構/容器標記）|
| `link "text"` / `/url:` | 跳過（連結內容由上下文處理）|

完整原始 snapshot 透過 `result.snapshot` 欄位回傳，給需要結構資訊的呼叫端。

## 重試與超時

- **整體重試**：最多 5 次，**含初始請求最多執行 6 次**，線性遞增退避（3s → 6s → 9s → 12s → 15s）
- **snapshot 內部重試**：最多 3 次，**含初始最多執行 4 次**，間隔 5 秒（部分網站需等驗證頁通過）
- **server 啟動超時**：預設 30 秒
- **單次 snapshot/tab 操作**：依 Camofox 內部超時

## Windows 進程清理

Camofox server 會 spawn Firefox 子進程；Windows 上 Node.js 的 `serverProc.kill('SIGTERM')` 不會 cascade 到子進程。本技能用 **`taskkill /F /T /PID <pid>`** 清整棵進程樹，避免殘留 orphan Firefox 進程。

Unix/Linux 用 `SIGTERM`（POSIX 標準會 cascade 到 process group）。

## 安全設計

- 寫檔路徑經 `_WIN_RESERVED_RE` 防護
- server 進程在 `finally` 區塊清理
- 同時 DELETE 已開啟的 tab 確保資源釋放

## 邊界與已知限制

1. **不解析 HTML**：本技能只回 snapshot 與其轉換 HTML
2. **資源耗用最高**：每次呼叫啟動 Camofox server + Firefox（~500MB+ RAM），抓完關閉
3. **執行時間最長**：通常 15-30 秒（含 server 啟動 + 驗證頁等待）
4. **首次安裝慢**：`npm install @askjo/camofox-browser` 會下載 Firefox binary（~200MB）
5. **不適合大量抓取**：每次都重啟整個瀏覽器，效率差；大量抓取建議用 Playwright 路徑或自行實作 session 復用版本
6. **重試與超時**：整體最多重試 5 次（**含初始 6 次**）；snapshot 內部最多重試 3 次（**含初始 4 次**）；server 啟動 30 秒超時
