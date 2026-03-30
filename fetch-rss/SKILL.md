---
name: fetch-rss
description: 取得任意 RSS Feed 並轉換為統一格式的 JSON 資料陣列，支援 YouTube、新聞網站等各類 RSS 來源。適用於 AI Agent 擷取 RSS 訂閱內容。
---

# fetch-rss — 取得 RSS Feed 並轉換為統一 JSON 格式

## 概述

以 `axios` 取得 RSS XML，再用 `rss-parser` 解析為統一格式的 items 陣列。
支援各類 RSS / Atom Feed，包括 YouTube 頻道、新聞網站、部落格等。

## 技術原理

```text
傳入 RSS URL
→ axios GET 取得 XML（內建重試機制：5xx / 429 / 404 / 網路錯誤自動重試最多 5 次，含初始請求最多執行 6 次，線性遞增退避 3s→6s→…→15s）
→ rss-parser 解析為 feed 物件
→ 轉換為統一格式 { url, time, title, description, from }
→ 輸出 JSON 陣列
```

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需套件：`axios`、`rss-parser`

執行前請先驗證套件是否可用：
```bash
node -e "require('axios'); require('rss-parser'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install axios rss-parser
```

## 執行方式

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）。

### 基本用法

```bash
node fetch-rss/scripts/fetch_rss.mjs <rssUrl> [outputPath]
```

- `rssUrl`（必填）— RSS Feed 網址
- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定時直接輸出至 stdout

### 範例

```bash
# 取得 YouTube 頻道 RSS 並輸出至螢幕
node fetch-rss/scripts/fetch_rss.mjs "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxx"

# 取得 RSS 並儲存為檔案
node fetch-rss/scripts/fetch_rss.mjs "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxx" ./rss_result.json
```

## 輸出格式

JSON 陣列，每筆資料包含以下欄位：

| 欄位 | 說明 |
|------|------|
| `url` | 文章 / 影片連結 |
| `time` | 發布時間（已轉換為 UTC+8 格式：`YYYY-MM-DD HH:mm:ss`） |
| `title` | 文章 / 影片標題 |
| `description` | 內容摘要（contentSnippet 或 summary，無則為空字串） |
| `from` | 來源（作者或 Feed 標題） |

輸出範例：

```json
[
  {
    "url": "https://www.youtube.com/watch?v=xxxxx",
    "time": "2026-03-22 08:49:15",
    "title": "影片標題",
    "description": "文章摘要內容",
    "from": "頻道名稱"
  }
]
```

## AI Agent 標準操作流程

1. 取得使用者提供的 RSS URL
2. 執行腳本取得 items 陣列
3. 讀取輸出結果，向使用者回報資料筆數與內容摘要
4. 可搭配 `save-news-to-sheet` 技能將結果儲存至 Google Sheet

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `用法: node fetch_rss.mjs <rssUrl>` | 未提供 RSS URL | 補上 RSS Feed 網址 |
| `Request failed with status code 404` | RSS URL 無效或暫時性 404（如 YouTube RSS） | 已內建自動重試（最多重試 5 次，含初始請求最多執行 6 次），仍失敗請確認網址正確且可公開存取 |
| `timeout of 30000ms exceeded` | 來源回應過慢 | 已內建自動重試（最多重試 5 次，含初始請求最多執行 6 次），仍失敗請確認網路連線 |
| `Request failed with status code 5xx` | 伺服器暫時錯誤 | 已內建自動重試（最多重試 5 次，含初始請求最多執行 6 次，線性遞增退避），仍失敗請稍後再試 |
| `Cannot find module 'axios'` | 未安裝依賴 | 執行 `npm install axios rss-parser` |
| `Invalid XML` | 來源非合法 RSS/Atom 格式 | 確認網址回傳的是有效 RSS XML |

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）
node fetch-rss/scripts/fetch_rss.mjs <rssUrl> [outputPath]
```
