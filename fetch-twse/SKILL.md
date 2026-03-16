---
name: fetch-twse
description: 抓取證交所（TWSE）股票收盤資料。支援個股或全市場查詢，回傳結構化 JSON。適用於台股盤後分析、開收盤價查詢、漲跌幅統計。
---

# 證交所資料抓取

從臺灣證券交易所（TWSE）抓取股票收盤資料。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://www.twse.com.tw |
| 資料類型 | 開收盤價、成交量、漲跌幅 |
| 抓取方式 | API（JSON 格式） |
| 更新時間 | 每日 14:30 後（收盤後） |

## 🚦 交易日檢查（建議）

TWSE 股價資料僅在台股交易日產生。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無收盤資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援單檔與全市場模式。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

> 須從**專案根目錄**（`node_modules` 所在位置）執行。

1. **安裝依賴**：`npm install axios`。
2. **執行腳本**：`node fetch-twse/scripts/fetch_twse.mjs [stockCode|all] [date] [outputPath]`
   - `stockCode`: 股票代碼 (單檔) 或 `all`（全市場）
   - `date`: YYYYMMDD（例如 20260210）
   - `outputPath`: 輸出 JSON 檔案路徑
3. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `twse_STOCKCODE_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：抓取全市場 (2026/02/10) 並輸出至檔案
node fetch-twse/scripts/fetch_twse.mjs all 20260210 ./data/twse.json

# 範例：抓取個股 (2026/02/10) 並輸出至檔案
node fetch-twse/scripts/fetch_twse.mjs 2330 20260210 ./data/twse_2330.json

# 範例：抓取個股 (今日)，自動產生 twse_2330_YYYYMMDD.json
node fetch-twse/scripts/fetch_twse.mjs 2330
```

---

## API 端點 (Legacy)

以下說明為直接呼叫 API 的方式，僅供參考。

### 1. 個股日成交資訊

```
https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=XXXX
```

> ⚠️ **注意**：此 API 傳回的是 `date` 所在**整個月份**的所有交易日資料（非單日），若需特定日期的收盤價，需從傳回的 `data` 陣列中自行篩選對應日期。

**參數**：
| 參數 | 說明 | 範例 |
|------|------|------|
| `date` | 查詢月份（YYYYMMDD，取年月） | 20260205 |
| `stockNo` | 股票代碼 | 2330 |

**回傳範例**：
```json
{
  "stat": "OK",
  "date": "115年02月",
  "title": "115年02月 2330 台積電 各日成交資訊",
  "fields": ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數"],
  "data": [
    ["115/02/03", "25,123,456", "25,123,456,789", "980.00", "985.00", "975.00", "982.00", "+12.00", "15,234"],
    ["115/02/04", "28,456,789", "28,456,789,012", "982.00", "990.00", "980.00", "988.00", "+6.00", "18,567"]
  ]
}
```

### 2. 全市場成交資訊

```
https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=YYYYMMDD&type=ALLBUT0999
```

**參數**：
| 參數 | 說明 | 範例 |
|------|------|------|
| `date` | 查詢日期（YYYYMMDD） | 20260205 |
| `type` | 市場類型 | ALLBUT0999（排除權證） |

**type 參數值**：
| 值 | 說明 |
|----|------|
| `ALLBUT0999` | 全部（排除權證） |
| `ALL` | 全部 |
| `IND` | 大盤指數 |

### 3. 交易日檢查

```bash
curl -s "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=YYYYMMDD&type=IND" | jq '.stat'
# "OK" = 交易日
# "很抱歉，沒有符合條件的資料!" = 非交易日
```

## 輸出格式

**預設檔名**：`twse_STOCKCODE_YYYYMMDD.json`（全市場時為 `twse_ALL_YYYYMMDD.json`）

成功（個股查詢 STOCK_DAY）：
```json
{
  "status": "success",
  "message": {
    "stat": "OK",
    "date": "115年02月",
    "title": "115年02月 2330 台積電 各日成交資訊",
    "fields": ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數"],
    "data": [
      ["115/02/03", "25,123,456", "25,123,456,789", "980.00", "985.00", "975.00", "982.00", "+12.00", "15,234"]
    ]
  }
}
```

成功（全市場查詢 MI_INDEX）：
```json
{
  "status": "success",
  "message": {
    "stat": "OK",
    "type": "ALLBUT0999",
    "title": "115年02月05日 每日收盤行情(全部(不含權證、牛熊證))",
    "fields9": ["證券代號", "證券名稱", "成交股數", "..."],
    "data9": [
      ["2330", "台積電", "28,456,789", "18,567", "28,456,789,012", "982.00", "990.00", "980.00", "988.00", "+", "6.00", "988.00", "50", "989.00", "100", "25.00"]
    ]
  }
}
```

錯誤：
```json
{
  "type": "error",
  "message": "TWSE API returned: 很抱歉，沒有符合條件的資料!"
}
```

## 注意事項

### 上市 vs 上櫃

- **上市股票**：使用 TWSE API（本技能）
- **上櫃股票**：需使用 TPEX API（櫃買中心）
  - 網址：`https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php`
  - 格式不同，需另外處理

### 股票代碼判斷

| 代碼開頭 | 市場 | API |
|----------|------|-----|
| 1xxx~9xxx（4碼） | 通常上市 | TWSE |
| 部分 4 碼 | 可能上櫃 | TPEX |

建議：先查 TWSE，若無資料再查 TPEX

### API 限制

- 無需認證
- 建議間隔 1-2 秒避免被封鎖
- 大量查詢建議用全市場 API

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多 10 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

若 10 次後仍失敗，才寫入錯誤並 exit 1。

> 查無資料（`stat !== 'OK'`）**不會**觸發重試（非暫時性狀態）。

### 2. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

### 2. 查無資料 (很抱歉，沒有符合條件的資料!)

**原因**：
- 該日為非交易日（假日）。
- 尚未開盤或尚未收盤（資料未產生）。
- 股票代碼錯誤或已下市。
- 該股票為「上櫃」而非「上市」（請改用 `fetch-tpex`）。

## 快速執行

```bash
# 從專案根目錄執行
node fetch-twse/scripts/fetch_twse.mjs [stockCode|all] [date] [outputPath]

# 範例：全市場
node fetch-twse/scripts/fetch_twse.mjs all 20260316 ./w-data-news/tw-stock-post-market/20260316/raw/prices_twse.json
```

