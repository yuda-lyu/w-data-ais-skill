---
name: fetch-tw-stock
description: 抓取台股收盤資料（上市 TWSE + 上櫃 TPEX）。支援指定日期與股票代碼，回傳結構化 JSON（OHLC、成交量、本益比等）。適用於盤後分析、價量查詢、上市/上櫃資料整合。
---

# 台股收盤資料抓取（上市 TWSE + 上櫃 TPEX）

從臺灣證券交易所（TWSE）與櫃買中心（TPEX）抓取股票收盤資料。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 (上市) | https://www.twse.com.tw |
| 網址 (上櫃) | https://www.tpex.org.tw/ |
| 資料類型 | 開收盤價、成交量、漲跌幅 |
| 抓取方式 | API（JSON 格式） |
| 更新時間 | 每日 14:30 後（收盤後） |

## 🚦 交易日檢查（建議）

股價資料僅在台股交易日產生。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無收盤資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援單檔與全市場模式。

### 安裝指引

所需套件：`axios`

執行前請先驗證套件是否可用：
```bash
node -e "require('axios'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install axios
```

## 上市（TWSE）

### 執行方式

> 執行環境須可存取 `node_modules`（含所需依賴套件）。

1. **執行腳本**：`node fetch-tw-stock/scripts/fetch_twse_stock.mjs [stockCode|all] [date] [outputPath]`
   - `stockCode`: 股票代碼 (單檔) 或 `all`（全市場）
   - `date`: YYYYMMDD（例如 20260210）；可省略，預設為今日。
   > ⚠️ **注意**：個股查詢（STOCK_DAY）回傳的是該月份**整月**資料而非單日；全市場查詢（MI_INDEX）則為單日資料
   - `outputPath`: 輸出 JSON 檔案路徑
2. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `twse_STOCKCODE_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：抓取全市場 (2026/02/10) 並輸出至檔案
node fetch-tw-stock/scripts/fetch_twse_stock.mjs all 20260210 ./data/twse.json

# 範例：抓取個股 (2026/02/10) 並輸出至檔案
node fetch-tw-stock/scripts/fetch_twse_stock.mjs 2330 20260210 ./data/twse_2330.json

# 範例：抓取個股 (今日)，自動產生 twse_2330_YYYYMMDD.json
node fetch-tw-stock/scripts/fetch_twse_stock.mjs 2330
```

---

### API 端點 (Legacy)

以下說明為直接呼叫 API 的方式，僅供參考。

#### 1. 個股日成交資訊

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

#### 2. 全市場成交資訊

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

#### 3. 交易日檢查

```bash
curl -s "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=YYYYMMDD&type=IND" | jq '.stat'
# "OK" = 交易日
# "很抱歉，沒有符合條件的資料!" = 非交易日
```

### TWSE 輸出格式

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
      ["2330", "台積電", "28,456,789", "28,456,789,012", "18,567", "982.00", "990.00", "980.00", "988.00", "+", "6.00", "988.00", "50", "989.00", "100", "25.00"]
    ]
  }
}
```

錯誤：
```json
{
  "status": "error",
  "message": "TWSE API returned: 很抱歉，沒有符合條件的資料!"
}
```

---

## 上櫃（TPEX）

### 執行方式

1. **執行腳本**：`node fetch-tw-stock/scripts/fetch_tpex_stock.mjs [stockCode|all] [date] [outputPath]`
   - `stockCode`: 股票代碼（單檔或逗號分隔）或 `all`（全市場）
   - `date`: YYYYMMDD（例如 20260210）；可省略，預設為今日
   - `outputPath`: 輸出 JSON 檔案路徑
2. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `tpex_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：抓取全市場 (2026/02/10) 並輸出至檔案
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs all 20260210 ./data/tpex.json

# 範例：抓取特定個股 (2026/02/10) 並輸出至檔案
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs 6499 20260210 ./data/tpex_6499.json

# 範例：抓取特定個股 (今日)，自動產生 tpex_6499_YYYYMMDD.json
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs 6499

# 範例：逗號分隔多檔查詢
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs 6499,4977 20260210 ./data/tpex_multi.json
```

### TPEX API 端點

#### 上櫃股票行情（指定交易日、全市場）

```
https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php
  ?l=zh-tw
  &d=YYY/MM/DD
  &s=0,asc,0
  &o=json
```

- `d`：民國日期（例如 `115/02/05`）
- `o=json`：JSON 回傳

**回傳格式（2026 年後新版）**：`{ stat, tables: [{ title: "上櫃股票行情", fields: [...], data: [[...], ...] }] }`

欄位順序（`tables[0].data` 每列）：`[0]=代號, [1]=名稱, [2]=收盤, [3]=漲跌, [4]=開盤, [5]=最高, [6]=最低, [7]=成交股數, ...`

> 腳本使用新版 `tables` 格式解析回傳資料。

### TPEX 輸出格式

**預設檔名**：`tpex_YYYYMMDD.json`（指定個股時為 `tpex_CODE_YYYYMMDD.json`，多檔時為 `tpex_CODE1_CODE2_YYYYMMDD.json`）

成功：
```json
{
  "status": "success",
  "message": {
    "source": "tpex",
    "date": "20260205",
    "count": 800,
    "data": [
      ["6499", "益安", "45.50", "+0.50", "45.00", "46.00", "44.50", "1,234,567"]
    ]
  }
}
```

錯誤：
```json
{
  "status": "error",
  "message": "TPEX API returned no data. Possibly a holiday or data not yet available."
}
```

---

## 注意事項

### 上市 vs 上櫃

- **上市股票**：使用 TWSE 腳本（`fetch_twse_stock.mjs`）
- **上櫃股票**：使用 TPEX 腳本（`fetch_tpex_stock.mjs`）

### 股票代碼判斷

| 代碼開頭 | 市場 | 腳本 |
|----------|------|------|
| 1xxx~9xxx（4碼） | 通常上市 | fetch_twse_stock.mjs |
| 部分 4 碼 | 可能上櫃 | fetch_tpex_stock.mjs |

建議：先查 TWSE，若無資料再查 TPEX

### API 限制

- 無需認證
- 建議間隔 1-2 秒避免被封鎖
- 大量查詢建議用全市場 API

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

兩支腳本皆內建**自動重試機制**（最多重試 10 次，含初始請求最多執行 11 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

若 10 次後仍失敗，才寫入錯誤並 exit 1。

> 查無資料（`stat !== 'OK'` 或資料列為空）**不會**觸發重試（非暫時性狀態）。

### 2. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

### 3. 查無資料

**原因**：
- 該日為非交易日（假日）。
- 尚未開盤或尚未收盤（資料未產生）。
- 股票代碼錯誤或已下市。
- 上市股票用了 TPEX 腳本（或反之），請改用對應腳本。

## 快速執行

```bash
# 執行時須確保 `node_modules` 可存取

# TWSE（上市）
node fetch-tw-stock/scripts/fetch_twse_stock.mjs [stockCode|all] [date] [outputPath]

# TPEX（上櫃）
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs [stockCode|all] [date] [outputPath]

# 範例：全市場
node fetch-tw-stock/scripts/fetch_twse_stock.mjs all 20260316 ./w-data-news/tw-stock-post-market/20260316/raw/prices_twse.json
node fetch-tw-stock/scripts/fetch_tpex_stock.mjs all 20260316 ./w-data-news/tw-stock-post-market/20260316/raw/prices_tpex.json
```
