---
name: fetch-web
description: 抓取任意網頁的文章內容並提取純文字。支援三種方法自動階梯升級：curl+Readability（繞過 TLS 指紋）→ Playwright 無頭（SPA 渲染）→ Playwright 有頭（反自動化偵測）。適用於 AI Agent 自動擷取新聞全文、文章摘要等場景。
---

# fetch-web — 抓取網頁文章內容（自動階梯升級）

## 概述

以三種方法自動階梯升級抓取網頁文章內容，提取純文字：

1. **curl + Readability**（預設）— curl 的 OpenSSL TLS 指紋繞過層級 1-3 反爬蟲，Readability（Firefox Reader Mode 核心）提取乾淨文章主體
2. **Playwright 無頭** — 完整 JS 執行環境，處理 SPA 動態渲染頁面（如 X/Twitter）
3. **Playwright 有頭** — 有視窗模式繞過 DataDome 等進階反自動化偵測（如 WSJ）

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

### 基礎依賴（方法①，必裝）

所需套件：`@mozilla/readability`、`jsdom`
額外需求：系統需有 `curl`（Windows 10 以上內建）

執行前請先驗證套件是否可用：
```bash
node -e "require('@mozilla/readability'); require('jsdom'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install @mozilla/readability jsdom
```

### 進階依賴（方法②③，必裝）

所需套件：`playwright`
額外需求：系統需安裝 Chrome 或 Chromium

```bash
node -e "require('playwright'); console.log('playwright OK')"
```

若顯示錯誤則安裝：
```bash
npm install playwright
```

> Playwright 使用 `channel: 'chrome'` 直接調用系統 Chrome，不需額外下載 Chromium。
> ⚠️ Playwright 為必裝依賴。本技能依網站防禦強度自動階梯升級（curl → Playwright 無頭 → Playwright 有頭），長期執行必定會遇到需要 Playwright 的場景，未安裝將導致整個模組無法載入。

## 技術原理

```text
傳入 URL
│
├─ 方法① curl + Readability（預設）
│    curl（OpenSSL TLS 指紋，繞過層級 1-3 反爬蟲）
│    → execFileSync 安全呼叫（避免命令注入）
│    → @mozilla/readability 解析文章主體
│    → 回傳純文字
│    ├─ 成功 → 使用結果
│    └─ 失敗（403/401/空內容/CAPTCHA）→ 升級
│
├─ 方法② Playwright 無頭
│    系統 Chrome（headless: true）
│    → 完整 JS 渲染
│    → DOM 選擇器提取文章
│    ├─ 成功 → 使用結果
│    └─ 失敗（CAPTCHA/空內容）→ 升級
│
└─ 方法③ Playwright 有頭
     系統 Chrome（headless: false）
     → 隱藏 webdriver 標記
     → 繞過 DataDome 等偵測
     → DOM 選擇器提取文章
```

### 各方法適用範圍

| 方法 | 可突破層級 | 速度 | 適用場景 |
|------|-----------|------|----------|
| ① curl + Readability | 1-3（UA/Headers/TLS） | 快（1-2s） | 大多數新聞網站（預設） |
| ② Playwright 無頭 | 1-4（含 JS 渲染） | 中（3-8s） | SPA 動態頁面（X/Twitter） |
| ③ Playwright 有頭 | 1-4+（含反自動化） | 慢（5-15s） | DataDome 等進階偵測（WSJ） |

### 安全設計

- URL 透過 `execFileSync` 參數陣列傳遞（非 shell 字串拼接），**防止命令注入**
- curl 使用 `--max-time` + `execFileSync timeout` 雙重超時保護
- Playwright 的 `browser.close()` 放在 `finally` 區塊，確保資源釋放
- 所有方法（curl / Playwright 無頭 / Playwright 有頭）皆內建自動重試（最多重試 5 次，含初始請求最多執行 6 次，線性遞增退避 3s→6s→...→15s）；curl 針對 5xx 及網路錯誤重試，Playwright 針對導航逾時、瀏覽器 crash 等例外重試

## 執行方式

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）。

### 基本用法

```bash
node fetch-web/scripts/fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed]
```

- `url`（必填）— 要抓取的網頁 URL
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定時直接輸出至 stdout
- `--method`（選填）— 指定抓取方法，預設 `auto`（自動階梯升級）

### 範例

```bash
# 自動模式（預設，依序嘗試三種方法）
node fetch-web/scripts/fetch_web.mjs "https://www.axios.com/2026/03/28/some-article" ./result.json

# 強制使用 curl + Readability
node fetch-web/scripts/fetch_web.mjs "https://36kr.com/p/123456" ./result.json --method=curl

# 強制使用 Playwright 無頭（適合 SPA）
node fetch-web/scripts/fetch_web.mjs "https://x.com/user/status/123" ./result.json --method=playwright

# 強制使用 Playwright 有頭（適合 DataDome）
node fetch-web/scripts/fetch_web.mjs "https://www.wsj.com/articles/xxx" ./result.json --method=playwright-headed
```

## 輸出格式

結果為 JSON，寫入檔案或輸出至 stdout。

### 成功

```json
{
  "status": "success",
  "url": "https://www.axios.com/...",
  "title": "Article Title",
  "content": "OpenAI spent the last year trying to be everything...",
  "contentLength": 3431,
  "method": "curl",
  "fetchedAt": "2026-03-28 14:30:00",
  "attempts": [
    { "method": "curl", "status": "success", "contentLength": 3431 }
  ]
}
```

### 錯誤

```json
{
  "status": "error",
  "url": "https://example.com/...",
  "message": "all methods failed",
  "fetchedAt": "2026-03-28 14:30:00",
  "attempts": [
    { "method": "curl", "status": "failed", "reason": "http-error", "message": "HTTP 403" },
    { "method": "playwright-headless", "status": "failed", "reason": "captcha", "message": "CAPTCHA detected (headless blocked)" },
    { "method": "playwright-headed", "status": "failed", "reason": "missing-deps", "message": "missing playwright" }
  ]
}
```

## AI Agent 標準操作流程

1. 取得要抓取的 URL
2. 執行腳本（預設 auto 模式會自動選擇最佳方法）
3. 讀取輸出結果，檢查 `status` 是否為 `success`
4. 若成功，使用 `content` 欄位的純文字進行後續處理（摘要、分析等）
5. 若失敗，檢查 `attempts` 陣列了解各方法失敗原因

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `missing @mozilla/readability or jsdom` | 未安裝基礎依賴 | 執行 `npm install @mozilla/readability jsdom` |
| `missing playwright` | 未安裝進階依賴 | 執行 `npm install playwright` |
| `HTTP 403` | TLS 指紋被擋（curl 也被擋） | 嘗試 `--method=playwright` 或 `--method=playwright-headed` |
| `CAPTCHA or challenge page` | 網站要求驗證碼 | 嘗試 `--method=playwright-headed`（需桌面環境） |
| `content too short` | 頁面為 SPA 需 JS 渲染 | 嘗試 `--method=playwright` |
| `all methods failed` | 所有方法皆無法取得內容 | 檢查 `attempts` 了解各方法失敗原因；可能為付費牆或需登入 |
| Playwright 有頭模式失敗 | 無桌面環境 | 有頭模式需要 Windows 桌面 session |

## 無法處理的情況

| 情況 | 說明 |
|------|------|
| 付費牆全文 | WSJ/FT 等付費內容僅能取得免費預覽段落 |
| 微信公眾號 | 驗證頁面攔截，無法自動化 |
| 需登入認證 | 需帳號密碼的頁面無法自動取得 |

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）
node fetch-web/scripts/fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed]
```
