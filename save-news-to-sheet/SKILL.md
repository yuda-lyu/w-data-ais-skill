---
name: save-news-to-sheet
description: 透過 Google Apps Script Web App API 將新聞資料（itemsNew）寫入 Google Sheet，支援自動去重。適用於 AI Agent 儲存 RSS、爬蟲結果、新聞摘要等場景。
---

# save-news-to-sheet — 透過 GAS Web App 儲存新聞至 Google Sheet

## 概述

透過 Google Apps Script (GAS) 部署的 Web App HTTP API 將新聞資料寫入 Google Sheet。
調度 AI 組成 `itemsNew` 陣列，以 `axios` POST JSON 到 GAS `/exec` 端點，由 GAS 端驗證 token、自動去重後寫入 Sheet。

## 技術原理

```text
調度 AI 組成 itemsNew 陣列
→ axios POST 到 GAS /exec
→ GAS 驗證 token
→ 以 type + url + title + description + from 去重
→ 寫入新資料至 Sheet
→ 回傳 { ok, addCount, itemsAdd }
```

## 安裝指引

```bash
npm install axios
```

## 前置需求

使用者須提供：
- `gas_url` — GAS Web App 部署網址（須以 `/exec` 結尾）
- `token` — GAS 端設定的驗證 token

## 執行方式

> 執行環境須可存取 `node_modules`（含所需依賴套件）。

### 模式 A：JSON 檔案（推薦，適合大量資料）

```bash
node save-news-to-sheet/scripts/save_news_to_sheet.mjs <payload.json> [outputPath]
```

payload.json 格式：

```json
{
  "gas_url": "https://script.google.com/macros/s/XXXX/exec",
  "token": "your_secret_token",
  "itemsNew": [
    {
      "type": "news",
      "url": "https://example.com/news-1",
      "time": "2026-03-22 09:00:00",
      "title": "新聞標題",
      "description": "新聞摘要內容",
      "from": "reuters"
    }
  ]
}
```

### 模式 B：直接參數（適合少量資料）

```bash
node save-news-to-sheet/scripts/save_news_to_sheet.mjs <gas_url> <token> '<itemsNewJSON>' [outputPath]
```

### 範例

```bash
# JSON 模式 — 寄送多筆新聞
node save-news-to-sheet/scripts/save_news_to_sheet.mjs ./news_payload.json ./result.json

# 參數模式 — 寄送單筆
node save-news-to-sheet/scripts/save_news_to_sheet.mjs \
  "https://script.google.com/macros/s/XXXX/exec" \
  "my_token" \
  '[{"type":"news","url":"https://example.com/a","time":"2026-03-22 09:00:00","title":"標題","description":"摘要","from":"source"}]'
```

## 資料欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `gas_url` | ✅ | GAS Web App 部署網址，須以 `/exec` 結尾 |
| `token` | ✅ | GAS 端設定的驗證 token |
| `itemsNew` | ✅ | 要新增的資料陣列 |
| `type` | ⬜ | 資料類型，如 `news`、`rss`、`report`（為去重依據之一） |
| `url` | ✅ | 資料網址（每筆必填，為去重依據之一） |
| `time` | ⬜ | 時間字串，若未提供 GAS 端會自動補目前時間 |
| `title` | ⬜ | 文章 / 影片標題（為去重依據之一） |
| `description` | ⬜ | 內容摘要（為去重依據之一） |
| `from` | ⬜ | 資料來源（為去重依據之一） |

## 去重邏輯

GAS 端以 `type + url + title + description + from` 五欄位組合作為唯一鍵：
- 若 Sheet 已有相同組合的資料，該筆會被跳過
- 同一次 POST 內若有重複資料，也會去重
- `time` 不參與去重比對
- Node.js 端僅驗證每筆 `url` 欄位存在（必填），其餘欄位之去重邏輯由 GAS 後端處理

## 輸出格式

結果**一律寫入檔案**（JSON），無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得結果，勿依賴 stdout。

**預設檔名**：`save_news_result_YYYYMMDD.json`

成功：

```json
{
  "status": "success",
  "savedAt": "2026-03-22 14:30:00",
  "gasResponse": {
    "ok": true,
    "code": "SUCCESS",
    "message": "處理完成",
    "receivedCount": 5,
    "normalizedCount": 5,
    "oldCount": 3,
    "addCount": 2,
    "itemsAdd": [...]
  }
}
```

錯誤：

```json
{
  "status": "error",
  "message": "HTTP 403: ...",
  "attempt": 5
}
```

## AI Agent 標準操作流程

1. 向使用者確認 `gas_url` 與 `token`（若尚未提供）
2. 組成 `itemsNew` 陣列，每筆至少包含 `url` 欄位
3. 寫入 payload JSON 檔，再用模式 A 執行
4. 讀取輸出檔案，檢查 `status` 是否為 `success`
5. 向使用者回報結果（含 `addCount` 新增筆數與 `oldCount` 既有筆數）

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `缺少必填欄位: gas_url` | 請求缺少 GAS 網址 | 補上 GAS Web App 部署網址 |
| `缺少必填欄位: itemsNew` | 陣列為空或未提供 | 確認 itemsNew 為非空陣列 |
| `有 N 筆資料缺少 url 欄位` | 個別資料缺 url | 每筆資料至少要有 url |
| `HTTP 403` | Web App 部署權限不正確 | 確認 GAS 已部署為公開可呼叫的 Web App |
| `Unauthorized` / `token 驗證失敗` | token 錯誤 | 確認 token 大小寫與內容完全一致 |
| `找不到工作表` | sheetName 設定與實際不符 | 確認 GAS 端 CONFIG.sheetName 與工作表名稱一致 |
| `addCount: 0` | 全部資料已存在 | 正常行為，去重後無新資料需寫入 |
| 5xx 伺服器錯誤 | GAS 暫時不可用 | 腳本內建自動重試（最多重試 5 次，含初始請求最多執行 6 次），等待 3s → 6s → ... → 上限 15s |
| `Cannot find module 'axios'` | 未安裝依賴 | 執行 `npm install axios` |

## 快速執行

```bash
# 執行時須確保 `node_modules` 可存取
node save-news-to-sheet/scripts/save_news_to_sheet.mjs <payload.json> [outputPath]
node save-news-to-sheet/scripts/save_news_to_sheet.mjs <gas_url> <token> '<itemsNewJSON>' [outputPath]
```
