---
name: shorten-url
description: 將長網址轉成短網址，使用 da.gd 公開 API（免費、無需註冊、無需 API key、無 preview 中間頁）。支援自訂短碼、結構化 JSON 或純文字輸出。內建網路重試（最多 5 次，含初始最多執行 6 次）。零外部依賴，只用 Node 18+ 內建 fetch。
---

# shorten-url — 長網址轉短網址（da.gd）

## 概述

包裝 [da.gd](https://da.gd/) 公開 API（`https://da.gd/s`）為一致的 CLI / 程式化 API。輸入長網址（含 `http://` 或 `https://` 前綴），回傳 da.gd 短網址。可選自訂短碼。

**為何最終選 da.gd**（前後試過 is.gd 與 TinyURL，皆有問題）：

| 服務 | 問題 |
|------|------|
| is.gd / v.gd | 自 2025/2 起對某些 URL 有 deterministic backend bug（`Error, database insert failed`），retry 救不回；YouTube 帶 `&list=` 的 URL 必中招 |
| TinyURL `api-create.php` | 官方標為 deprecated；對「曾建過的短碼」會插 preview 倒數頁，**redirect 顯著變慢**（使用者實測「等很久」）；新短碼不會 preview 但無法控制返回的是新碼或舊碼 |
| **da.gd** | 10/10 穩定、**redirect 單一 302 直達**、無 preview、回應 plain text 帶清晰英文錯誤訊息（"Long URL must have http:// or https:// scheme."、"Short URL already taken. Pick a different one." 等） |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

**零外部依賴**——僅用 Node 18+ 內建 `fetch`、`fs`、`path`。

```bash
node --version    # 需 >= v18（內建 fetch + AbortSignal.timeout）
```

## 執行方式

### CLI

```bash
# 1) 最簡：縮短一個網址
node shorten-url/scripts/shorten_url.mjs "https://example.com/very/long/path?with=query"

# 2) 自訂短碼（4-10 字元，[A-Za-z0-9_-]，全域唯一）
node shorten-url/scripts/shorten_url.mjs "https://example.com/foo" --alias share-26

# 3) JSON 結構輸出
node shorten-url/scripts/shorten_url.mjs "https://example.com/foo" --json

# 4) 將 JSON 結果寫檔
node shorten-url/scripts/shorten_url.mjs "https://example.com/foo" --output ./result.json
```

### 旗標

| 旗標 | 必選 | 說明 |
|------|------|------|
| `<URL>` | ✓ | 第一個位置參數：要縮短的網址，必須以 `http://` 或 `https://` 開頭 |
| `--alias <custom>` | — | 自訂短碼，4-10 字元 `[A-Za-z0-9_-]`，全域唯一（da.gd 對 >10 字元會 silent 截斷，本技能 client 端拒絕） |
| `--json` | — | 以 JSON 結構輸出至 stdout |
| `--output <path>` | — | 將完整 JSON 結果寫入指定檔案 |
| `--help` / `-h` | — | 顯示用法 |

## 程式化呼叫

```javascript
import { shortenUrl } from './shorten-url/scripts/shortenUrl.mjs'

// 最簡
const r1 = await shortenUrl('https://example.com/very/long/path')
console.log(r1.shortUrl)  // https://da.gd/xxxxx

// 自訂短碼
const r2 = await shortenUrl('https://example.com/foo', { alias: 'share-26' })
```

簽名：
```javascript
shortenUrl(
    url: string,
    options?: {
        alias?: string,       // 4-10 字元 [A-Za-z0-9_-]
    }
): Promise<{
    status: 'success' | 'error',
    url: string,              // 原網址
    shortUrl?: string,        // 成功時：da.gd 短網址
    alias?: string,           // 成功時：短碼（自訂或自動生成）
    errorCode?: string,
    message?: string,
    attempts: number,         // 實際發出的 HTTP 請求次數
}>
```

## 輸出格式

### 純文字（預設）

成功時 stdout 只印短網址一行：
```
https://da.gd/xxxxx
```

失敗時 stderr 印錯誤訊息、`exit 1`。適合 shell pipe：
```bash
SHORT=$(node shorten-url/scripts/shorten_url.mjs "https://example.com/...")
```

### `--json` 模式

成功：
```json
{
  "status": "success",
  "url": "https://example.com/very/long/path",
  "shortUrl": "https://da.gd/abc12",
  "alias": "abc12",
  "attempts": 1
}
```

錯誤：
```json
{
  "status": "error",
  "url": "https://example.com/foo",
  "errorCode": "alias-rejected",
  "message": "da.gd 拒絕 (HTTP 400): Short URL already taken. Pick a different one.",
  "attempts": 1
}
```

## status 約定

依全庫慣例：
- `status: "success"` — 取得短網址
- `status: "error"` — 失敗（見下表）

`errorCode` 列舉：

| code | 意義 | 是否重試 |
|------|------|---------|
| `'invalid-input'` | client 前置驗證：URL 不以 `http://` / `https://` 開頭 | ✗ |
| `'invalid-alias'` | client 前置驗證：alias 不符 `[A-Za-z0-9_-]{4,10}` | ✗ |
| `'alias-rejected'` | da.gd 回 HTTP 400 含 "already taken" → alias 已被佔用 | ✗ |
| `'invalid-url'` | da.gd 回 HTTP 400 含 "scheme" / "cannot be empty" / "invalid" → URL 內容站方不接受 | ✗ |
| `'alias-mismatch'` | da.gd 回成功，但短碼與請求的 alias 不符（捕捉站方 silent 截斷） | ✗ |
| `'dagd-error'` | da.gd 回 HTTP 400 但訊息不在已知分類 | ✗ |
| `'network-error'` | 網路錯誤 / timeout / HTTP 5xx / HTTP 429，已重試 5 次（含初始最多執行 6 次）失敗 | 已自動重試 |

## 重試與超時

- **單次請求 timeout**：15 秒（`AbortSignal.timeout`）
- **網路錯誤 / HTTP 5xx / HTTP 429**：最多重試 5 次（**含初始最多執行 6 次**），退避 2s / 4s / 8s / 15s / 30s
- **HTTP 400（da.gd 拒絕）**：永久錯誤，不重試

## da.gd 行為說明

實證 2026-05：

- 端點：`https://da.gd/s?url=<URL>&shorturl=<alias>`（GET）
- 成功：HTTP 200，body 為 `https://da.gd/xxxxx`
- 失敗：HTTP 400，body 為英文錯誤訊息
- redirect 行為：單一 HTTP 302 直達目標 URL，**無任何 preview / interstitial 頁**
- alias 上限 10 字元（超過會 silent 截斷返回的短碼）
- 4 字元以下 alias 多半已被站方自動產碼佔用，建議 5+ 字元
- 自訂 alias 字元集：`[A-Za-z0-9_-]`，case-sensitive

## 邊界與已知限制

1. **URL 必須有 protocol**：`example.com/foo` 會被拒；必須 `https://example.com/foo`
2. **自訂短碼上限 10 字元**：da.gd 對 >10 字元會 silent 截斷；本技能 client 端拒絕避免使用者拿到不符預期的短碼
3. **不檢查目標 URL 是否可達**：da.gd 也不檢；縮短「目標已失效」的 URL 仍會成功，但短網址點開後是 404
4. **無解碼功能**：本技能只縮短，不展開；如需展開短網址→原網址，請另寫工具或直接 fetch 跟 redirect
5. **da.gd 為小型服務**：相較 TinyURL 24 年歷史，da.gd 較小眾；長期可用性仰賴單一營運方
