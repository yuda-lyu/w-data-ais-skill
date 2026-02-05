---
name: fetch-statementdog
description: 抓取財報狗（Statementdog）產業分析與個股新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、基本面分析、產業趨勢研究。
---

# 財報狗資料抓取

從財報狗抓取產業分析與個股新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://statementdog.com/news |
| 資料類型 | 產業分析、個股基本面新聞 |
| 抓取方式 | web_fetch（靜態頁面） |
| 更新頻率 | 每日更新 |

## 技術說明

財報狗新聞頁為靜態 HTML，可直接用 web_fetch 抓取。

### 抓取步驟

```
步驟 1：使用 web_fetch 抓取頁面
  web_fetch → https://statementdog.com/news
  extractMode: markdown

步驟 2：解析 markdown 內容
  提取新聞標題、連結、日期

步驟 3：日期篩選
  只保留昨日+今日的新聞
```

### 頁面結構

新聞列表通常包含：
- 標題（含股票名稱）
- 發布日期
- 摘要
- 連結

## 輸出格式

```json
{
  "source": "statementdog",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "title": "台積電 2024 Q4 財報分析：營收創高，毛利率維持",
      "url": "https://statementdog.com/news/...",
      "date": "2026-02-05",
      "code": "2330",
      "name": "台積電",
      "impact": "利多",
      "reason": "財報優於預期"
    }
  ],
  "error": null
}
```

## 篩選標準

### 要抓（會影響股價）

- 財報分析（季報、年報）
- 營收追蹤
- 產業趨勢重大變化
- 個股基本面變化

### 跳過

- 教學文章
- 一般知識介紹
- 超過兩天的舊聞

## 日期判斷

- 檢查文章日期標記
- 超過兩天的文章跳過
- 日期格式可能為：`2026-02-05`、`02/05`、`今天`

## 錯誤處理

```json
{
  "source": "statementdog",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "network",
    "message": "Failed to fetch page",
    "details": "..."
  }
}
```

## 快速執行

```
請使用 fetch-statementdog 技能抓取財報狗新聞：
- 日期範圍：昨日 + 今日
- 輸出：JSON 格式
```
