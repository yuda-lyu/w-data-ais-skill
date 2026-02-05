---
name: fetch-cnyes
description: 抓取鉅亨網（Anue）台股即時新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、產業新聞、法人動態等即時資訊。
---

# 鉅亨網資料抓取

從鉅亨網（Anue/cnyes）抓取台股即時新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://news.cnyes.com/news/cat/tw_stock |
| 資料類型 | 即時新聞（產業動態、法人買賣、個股消息） |
| 抓取方式 | browser evaluate（JS 渲染頁面） |
| 更新頻率 | 即時 |

## 技術說明

鉅亨網使用 JavaScript 渲染，**必須**用 browser，無法用 web_fetch。

### 抓取步驟

```
步驟 1：開啟新聞列表頁
  browser open → https://news.cnyes.com/news/cat/tw_stock

步驟 2：等待頁面載入
  等待 3-5 秒（確保 JS 渲染完成）

步驟 3：確認頁面載入
  browser snapshot → 檢查是否有新聞列表

步驟 4：抓取新聞資料
  browser act evaluate → 執行下方 JavaScript
```

### 抓取腳本

```javascript
// 抓取新聞列表
[...document.querySelectorAll('a[href*="/news/id/"]')]
  .slice(0, 30)
  .map(a => {
    const time = a.closest('div')?.querySelector('time')?.innerText || '';
    return {
      title: a.innerText.trim(),
      url: a.href,
      time: time
    };
  })
  .filter(n => n.title.length > 5)
```

### 日期篩選

抓取後需檢查新聞時間戳記，只保留昨日+今日的新聞：
- 時間格式可能為：`2 小時前`、`昨天 15:30`、`02/04 09:00`
- 超過兩天的新聞跳過

## 輸出格式

```json
{
  "source": "cnyes",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "title": "台積電法說會釋正向展望 外資連三買",
      "url": "https://news.cnyes.com/news/id/...",
      "time": "今天 07:45",
      "code": "2330",
      "name": "台積電",
      "impact": "利多",
      "reason": "法說會正向展望"
    }
  ],
  "error": null
}
```

## 篩選標準

### 要抓（會影響股價）

- 法人買賣超報導
- 營收/財報相關新聞
- 產業趨勢重大變化
- 個股利多/利空消息
- 外資報告/目標價

### 跳過

- 純盤勢評論（大盤分析）
- 技術分析文章
- 一般產業介紹

## 個股識別

從標題提取股票代碼和名稱：
- 標題包含「台積電」→ code: 2330
- 標題包含「(2330)」→ code: 2330
- 無法識別時 code 留空

## 錯誤處理

```json
{
  "source": "cnyes",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "timeout",
    "message": "Page load timeout after 30s",
    "details": "..."
  }
}
```

## 快速執行

```
請使用 fetch-cnyes 技能抓取鉅亨網新聞：
- 日期範圍：昨日 + 今日
- 輸出：JSON 格式，含個股影響判斷
```
