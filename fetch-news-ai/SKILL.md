---
name: fetch-news-ai
description: 從多個 RSS 與資料來源取得 AI / 科技新聞，統一格式並過濾為今日與昨日的消息。適用於 AI Agent 每日新聞彙整。
---

# fetch-news-ai — 多來源 AI / 科技新聞彙整（僅今日+昨日）

## 概述

整合 8 個新聞來源（RSS + AI News Aggregator），取得資料後統一填入 `from` 欄位，並過濾為僅保留今日與昨日（UTC+8）的消息，依時間降冪排序輸出。

## 資料來源

| from | 類型 | 網站 | RSS / 資料網址 |
|------|------|------|----------------|
| AI News Aggregator | GitHub JSON | https://github.com/SuYxh/ai-news-aggregator | https://github.com/SuYxh/ai-news-aggregator/tree/main/data |
| 橘鴉Juya | YouTube RSS | https://www.youtube.com/@imjuya | https://www.youtube.com/feeds/videos.xml?channel_id=UCIDll3SRcbHwwcXbrwvBZNw |
| 最佳拍檔 | YouTube RSS | https://www.youtube.com/@bestpartners | https://www.youtube.com/feeds/videos.xml?channel_id=UCGWYKICLOE8Wxy7q3eYXmPA |
| GitCovery | YouTube RSS | https://www.youtube.com/@GitCovery | https://www.youtube.com/feeds/videos.xml?channel_id=UCBnIBXjWVKnkxDOwChuBHFA |
| 奇客Solidot | RSS | https://www.solidot.org/ | https://www.solidot.org/index.rss |
| 36氪 | RSS | https://36kr.com/ | https://36kr.com/feed |
| 少数派 | RSS | https://sspai.com/ | https://sspai.com/feed |
| IT之家 | RSS | https://www.ithome.com/ | https://www.ithome.com/rss/ |

### 如何取得 YouTube 頻道的 RSS 網址

1. 前往要訂閱的 YouTube 頻道頁面
2. 按 `Ctrl+U`（或右鍵點擊「檢視網頁原始碼」）
3. 在原始碼中搜尋 `application/rss+xml`
4. 即可找到該頻道的 RSS 網址，格式為：`https://www.youtube.com/feeds/videos.xml?channel_id=UC...`

## 技術原理

```text
8 個來源並行取得
→ RSS 來源呼叫 fetch-rss/fetchRSS.mjs
→ AI News Aggregator 呼叫 fetch-ai-news-aggregator/fetchAiNewsAggregator.mjs
→ 各自填入指定 from 欄位，提取 title 欄位
→ 彙整為單一陣列
→ 過濾僅保留今日與昨日（UTC+8）
→ 依時間降冪排序
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

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令），且 fetch-rss 與 fetch-ai-news-aggregator 須為同層兄弟技能目錄

### 基本用法

```bash
node fetch-news-ai/scripts/fetch-news-ai.mjs [outputPath]
```

- `outputPath`（選填）— 輸出 JSON 檔案路徑；未指定時直接輸出至 stdout

### 範例

```bash
# 取得新聞並輸出至螢幕
node fetch-news-ai/scripts/fetch-news-ai.mjs

# 取得新聞並儲存為檔案
node fetch-news-ai/scripts/fetch-news-ai.mjs ./news_ai.json
```

## 輸出格式

JSON 陣列，每筆資料包含以下欄位：

| 欄位 | 說明 |
|------|------|
| `url` | 文章 / 影片連結 |
| `time` | 發布時間（UTC+8 格式：`YYYY-MM-DD HH:mm:ss`） |
| `title` | 文章 / 影片標題 |
| `description` | 內容摘要（RSS 來源取 contentSnippet/summary；AI News Aggregator 為空字串） |
| `from` | 來源名稱（依清單指定） |
| `type` | 固定值 `"news-ai"`（供 sheet 去重與分類使用，**請勿自行變更**） |

輸出範例：

```json
[
  {
    "url": "https://www.ithome.com/0/931/389.htm",
    "time": "2026-03-22 10:13:57",
    "title": "LG Display 量產全球首款可變刷新率筆電面板",
    "description": "LG Display 宣布量產全球首款可變刷新率筆電面板...",
    "from": "IT之家",
    "type": "news-ai"
  }
]
```

## AI Agent 標準操作流程

1. 執行腳本取得 items 陣列
2. 讀取輸出結果，向使用者回報資料筆數與各來源統計
3. 可搭配 `save-news-to-sheet` 技能將結果儲存至 Google Sheet

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `[fetch-news-ai] xxx 失敗` | 單一來源取得失敗 | 該來源會被跳過，其餘來源不受影響（內建重試機制：5xx / 404 / 網路錯誤自動重試最多 5 次，含初始請求最多執行 6 次） |
| `timeout of 30000ms exceeded` | 來源回應過慢 | 重試或確認網路連線 |
| `Cannot find module 'axios'` | 未安裝依賴 | 執行 `npm install axios rss-parser` |
| 結果為空陣列 | 今日／昨日無新資料 | 確認來源網站是否有更新 |

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令），且 fetch-rss 與 fetch-ai-news-aggregator 須為同層兄弟技能目錄
node fetch-news-ai/scripts/fetch-news-ai.mjs [outputPath]
```
