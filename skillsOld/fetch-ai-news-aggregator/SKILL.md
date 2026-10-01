---
name: fetch-ai-news-aggregator
description: 取得 AI News Aggregator 最近 24 小時的 AI 新聞並轉換為統一格式的 JSON 資料陣列。適用於 AI Agent 擷取 AI 領域最新新聞摘要。
---

# fetch-ai-news-aggregator — 取得 AI 新聞聚合資料並轉換為統一 JSON 格式

## 概述

從 [ai-news-aggregator](https://github.com/SuYxh/ai-news-aggregator) 的 GitHub 資料來源取得最近 24 小時的 AI 新聞，以 `axios` 取得 JSON 後轉換為統一格式的 items 陣列。

## 技術原理

```text
固定資料來源 URL（latest-24h.json）
→ axios GET 取得 JSON（內建重試機制：5xx / 429 / 網路錯誤自動重試最多 5 次，含初始請求最多執行 6 次，線性遞增退避 3s→6s→…→15s）
→ 解析 items 陣列
→ 轉換為統一格式 { url, time, title, description, from }
→ 輸出 JSON 陣列
```

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需套件：`axios`

執行前請先驗證套件是否可用：
```bash
node -e "require('axios'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install axios
```

## 執行方式

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）。

### 基本用法

```bash
node fetch-ai-news-aggregator/scripts/fetch_ai_news_aggregator.mjs [outputPath]
```

- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定時直接輸出至 stdout

### 範例

```bash
# 取得 AI 新聞並輸出至螢幕
node fetch-ai-news-aggregator/scripts/fetch_ai_news_aggregator.mjs

# 取得 AI 新聞並儲存為檔案
node fetch-ai-news-aggregator/scripts/fetch_ai_news_aggregator.mjs ./ai_news.json
```

## 輸出格式

JSON 陣列，每筆資料包含以下欄位：

| 欄位 | 說明 |
|------|------|
| `url` | 新聞文章連結 |
| `time` | 發布時間（已轉換為 UTC+8 格式：`YYYY-MM-DD HH:mm:ss`） |
| `title` | 新聞標題 |
| `description` | 空字串（此來源無摘要） |
| `from` | 新聞來源 |

輸出範例：

```json
[
  {
    "url": "https://example.com/article",
    "time": "2026-03-22 08:49:15",
    "title": "AI 新聞標題",
    "description": "",
    "from": "TechCrunch"
  }
]
```

## AI Agent 標準操作流程

1. 執行腳本取得 items 陣列
2. 讀取輸出結果，向使用者回報資料筆數與內容摘要
3. 可搭配 `save-news-to-sheet` 技能將結果儲存至 Google Sheet

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `Request failed with status code 404` | 資料來源 URL 失效 | 確認 GitHub 原始檔案路徑是否變更 |
| `timeout of 30000ms exceeded` | GitHub 回應過慢 | 已內建自動重試（最多重試 5 次，含初始請求最多執行 6 次），仍失敗請確認網路連線 |
| `Request failed with status code 5xx` | 伺服器暫時錯誤 | 已內建自動重試（最多重試 5 次，含初始請求最多執行 6 次，線性遞增退避），仍失敗請稍後再試 |
| `Cannot find module 'axios'` | 未安裝依賴 | 執行 `npm install axios` |

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）
node fetch-ai-news-aggregator/scripts/fetch_ai_news_aggregator.mjs [outputPath]
```
