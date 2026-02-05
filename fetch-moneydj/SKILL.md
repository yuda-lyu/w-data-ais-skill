---
name: fetch-moneydj
description: 抓取 MoneyDJ 理財網法說會與營收新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、法說會追蹤、營收公告分析。
---

# MoneyDJ 資料抓取

從 MoneyDJ 理財網抓取法說會與營收相關新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=MB06 |
| 資料類型 | 法說會、營收公告、產業新聞 |
| 抓取方式 | web_fetch（靜態頁面） |
| 更新頻率 | 即時 |

## 技術說明

MoneyDJ 新聞頁為靜態 HTML，可直接用 web_fetch 抓取。

### 抓取步驟

```
步驟 1：使用 web_fetch 抓取頁面
  web_fetch → https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=MB06
  extractMode: markdown

步驟 2：解析 markdown 內容
  提取新聞標題、連結、時間

步驟 3：日期篩選
  只保留昨日+今日的新聞
```

### 常用分類

| 分類代碼 | 說明 |
|----------|------|
| MB06 | 台股新聞（推薦） |
| MB07 | 產業新聞 |
| MB010 | 法說會 |

## 輸出格式

```json
{
  "source": "moneydj",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "title": "台積電法說會：2025 年資本支出上看 320 億美元",
      "url": "https://www.moneydj.com/kmdj/news/...",
      "time": "08:30",
      "date": "2026-02-05",
      "code": "2330",
      "name": "台積電",
      "impact": "利多",
      "reason": "資本支出擴大，展望正向"
    }
  ],
  "error": null
}
```

## 篩選標準

### 要抓（會影響股價）

- 法說會內容/展望
- 營收公告
- 獲利預估調整
- 產業重大變化
- 外資報告

### 跳過

- 一般市場評論
- 技術分析
- 超過兩天的舊聞

## 時間標記解析

MoneyDJ 時間格式：
- `08:30` = 今天 08:30
- `昨 15:00` = 昨天 15:00
- `02/04` = 02月04日

## 錯誤處理

```json
{
  "source": "moneydj",
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
請使用 fetch-moneydj 技能抓取 MoneyDJ 新聞：
- 日期範圍：昨日 + 今日
- 輸出：JSON 格式
```
