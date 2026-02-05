---
name: fetch-goodinfo
description: 抓取 Goodinfo 台灣股市資訊網三大法人買賣超資料。支援買超/賣超排行，回傳結構化 JSON。適用於台股調研、法人動向追蹤、籌碼分析。
---

# Goodinfo 資料抓取

從 Goodinfo 台灣股市資訊網抓取三大法人買賣超資料。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://goodinfo.tw |
| 資料類型 | 三大法人買賣超、籌碼資料 |
| 抓取方式 | browser evaluate |
| 更新頻率 | 每日 16:30-17:00 更新前一交易日資料 |

## ⚠️ Anti-bot 處理（必要）

Goodinfo 有 JavaScript-based anti-bot 防護，會在首次訪問時設定 cookie 並重定向。**必須**按以下步驟處理：

### 抓取步驟

```
步驟 1：開啟頁面（觸發 anti-bot）
  browser open → https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=智慧選股&INDUSTRY_CAT=三大法人持股籌碼%40買賣超彙總

步驟 2：等待重定向完成（關鍵！）
  等待 3-5 秒，讓瀏覽器完成 JavaScript 執行和 cookie 設定
  browser snapshot → 確認頁面已載入完成（檢查是否有表格內容）

步驟 3：若仍在重定向頁面，手動導航
  如果 snapshot 顯示只有 JavaScript 重定向代碼（如 setCookie、window.location.replace），執行：
  browser navigate → 同一網址（此時 cookie 已設定，會正常載入）
  再次等待 2-3 秒

步驟 4：抓取資料
  browser act evaluate → 執行下方 JavaScript
```

### 判斷重定向頁面

如果 snapshot 內容包含以下特徵，表示仍在重定向頁面：
- `setCookie('CLIENT_KEY'`
- `window.location.replace`
- 頁面幾乎沒有其他內容

### 抓取腳本

```javascript
// 抓取法人買超 Top 10
[...document.querySelectorAll('#divStockList tr')]
  .slice(2, 12)
  .map(r => [...r.querySelectorAll('td')].map(c => c.innerText.trim()).join('|'))
  .join('\n')
```

### 結構化抓取

```javascript
// 抓取為結構化資料
[...document.querySelectorAll('#divStockList tr')]
  .slice(2, 12)
  .map(r => {
    const cells = [...r.querySelectorAll('td')];
    return {
      code: cells[0]?.innerText.trim(),
      name: cells[1]?.innerText.trim(),
      price: cells[2]?.innerText.trim(),
      change: cells[3]?.innerText.trim(),
      volume: cells[4]?.innerText.trim(),
      foreignBuy: cells[5]?.innerText.trim(),
      investBuy: cells[6]?.innerText.trim(),
      dealerBuy: cells[7]?.innerText.trim(),
      totalBuy: cells[8]?.innerText.trim()
    };
  })
```

## 常用頁面

| 頁面 | 網址 |
|------|------|
| 三大法人買超 | `StockList.asp?MARKET_CAT=智慧選股&INDUSTRY_CAT=三大法人持股籌碼%40買賣超彙總` |
| 融資融券 | `StockList.asp?MARKET_CAT=智慧選股&INDUSTRY_CAT=融資融券%40融資融券增減` |
| 董監持股 | `StockList.asp?MARKET_CAT=智慧選股&INDUSTRY_CAT=董監持股%40最新董監持股` |

## 輸出格式

```json
{
  "source": "goodinfo",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dataDate": "2026-02-04",
  "dataDateROC": "115/02/04",
  "items": [
    {
      "code": "3481",
      "name": "群創",
      "price": "23.0",
      "change": "+6.98%",
      "volume": "385,000",
      "foreignBuy": "50,000",
      "investBuy": "20,000",
      "dealerBuy": "8,960",
      "totalBuy": "78,960"
    }
  ],
  "error": null
}
```

## 日期格式

報告中使用民國年格式：
- 標題：`Goodinfo 三大法人買賣超（YYY/MM/DD）`
- 例如：`Goodinfo 三大法人買賣超（115/02/04）`

## 錯誤處理

若連續 3 次嘗試後仍無法載入：

```json
{
  "source": "goodinfo",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "anti-bot",
    "message": "Failed to bypass anti-bot after 3 attempts",
    "details": "Page still showing JavaScript redirect"
  }
}
```

**重要**：Goodinfo 失敗時，標記「資料擷取受限」並繼續，不要讓它阻擋整體報告產出。

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄格式

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "goodinfo",
  "phase": "fetch",
  "error": {
    "type": "anti-bot",
    "message": "JavaScript redirect detected",
    "details": "setCookie('CLIENT_KEY', ...); window.location.replace(...)"
  },
  "attempts": [
    {"action": "wait 3s then navigate", "result": "failed", "message": "Still redirect page"},
    {"action": "wait 5s then navigate", "result": "success", "message": "Page loaded"}
  ],
  "resolution": "success",
  "notes": "Goodinfo anti-bot requires 5s wait"
}
```

### 錯誤類型

| type | 說明 |
|------|------|
| `anti-bot` | Anti-bot 防護未能繞過 |
| `timeout` | 頁面載入逾時 |
| `browser` | 瀏覽器操作失敗 |
| `parse` | 表格解析失敗 |
| `empty` | 表格無資料 |

### 何時紀錄

1. Anti-bot 重定向未能繞過
2. 頁面載入失敗
3. 表格元素找不到
4. 每次重試嘗試（**特別重要**，用於優化 anti-bot 策略）

## 快速執行

```
請使用 fetch-goodinfo 技能抓取三大法人買賣超：
- 資料日期：前一交易日
- 輸出：JSON 格式，含買超 Top 10
- 錯誤須記錄至 error_log.jsonl
```
