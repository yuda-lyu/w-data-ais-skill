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

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援單檔與全市場模式。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

1. **複製腳本**：從技能目錄讀取 `scripts/fetch_twse.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本，可帶入代碼、日期與輸出路徑。
   - **參數**：`node fetch_twse.mjs [stockCode|all] [date] [outputPath]`
   - `stockCode`: 股票代碼 (單檔或 'all' 全市場)
   - `date`: YYYYMMDD (例如 20260210)
   - `outputPath`: 輸出 JSON 檔案路徑

```bash
# 範例：抓取全市場 (2026/02/10) 並輸出至檔案
node fetch_twse.mjs all 20260210 ./data/twse.json

# 範例：抓取個股 (2026/02/10) 並輸出至檔案
node fetch_twse.mjs 2330 20260210 ./data/twse_2330.json

# 範例：抓取個股 (今日) 並輸出至 stdout
node fetch_twse.mjs 2330
```

---

## API 端點 (Legacy)

以下說明為直接呼叫 API 的方式，僅供參考。

### 1. 個股日成交資訊

```
https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=XXXX
```

**參數**：
| 參數 | 說明 | 範例 |
|------|------|------|
| `date` | 查詢日期（YYYYMMDD） | 20260205 |
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

## 抓取步驟

### 單一個股

```
步驟 1：呼叫 API
  使用 exec curl 或 web_fetch：
  curl -s "https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20260205&stockNo=2330"

步驟 2：解析 JSON
  提取 data 陣列中的最後一筆（最新日期）

步驟 3：轉換格式
  輸出結構化資料
```

### 批次查詢（多個個股）

```
步驟 1：使用全市場 API
  curl -s "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20260205&type=ALLBUT0999"

步驟 2：從 data9 欄位提取個股資料
  data9 包含所有個股的成交資訊

步驟 3：篩選需要的股票代碼
```

## 輸出格式

### 個股查詢 (STOCK_DAY)

```json
{
  "stat": "OK",
  "date": "115年02月",
  "title": "115年02月 2330 台積電 各日成交資訊",
  "fields": ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數"],
  "data": [
    ["115/02/03", "25,123,456", "25,123,456,789", "980.00", "985.00", "975.00", "982.00", "+12.00", "15,234"]
  ]
}
```

### 全市場查詢 (MI_INDEX)

```json
{
  "stat": "OK",
  "type": "ALLBUT0999",
  "title": "115年02月05日 每日收盤行情(全部(不含權證、牛熊證))",
  "fields9": ["證券代號", "證券名稱", "成交股數", "成交筆數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌(+/-)", "漲跌價差", "最後揭示買價", "最後揭示買量", "最後揭示賣價", "最後揭示賣量", "本益比"],
  "data9": [
    ["2330", "台積電", "28,456,789", "18,567", "28,456,789,012", "982.00", "990.00", "980.00", "988.00", "+", "6.00", "988.00", "50", "989.00", "100", "25.00"]
  ]
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

### 1. 執行錯誤 (Module not found)

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

```
請使用 fetch-twse 技能抓取證交所資料（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_twse.mjs [日期] [代碼/ALL]
3. 讀取並解析 JSON 輸出
```

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄規則
當 Node.js 腳本執行失敗（Exit Code != 0）或標準錯誤輸出（stderr）包含錯誤訊息時，Agent 應捕捉錯誤並寫入 Log。

### 紀錄格式 (JSONL)

每行一筆 JSON，追加寫入：

```json
{
  "timestamp": "2026-02-05T15:30:00+08:00",
  "date": "20260205",
  "source": "twse",
  "phase": "fetch",
  "error": {
    "type": "timeout",
    "message": "API request timeout",
    "details": "ETIMEDOUT on /exchangeReport/STOCK_DAY"
  },
  "resolution": "failed",
  "notes": "TWSE API may be slow during 14:30-15:00"
}
```

### 常見錯誤類型 (type)

| type | 說明 | 觸發場景 |
|---|---|---|
| `network` | 網路錯誤 | HTTP 狀態碼非 200、連線逾時 |
| `empty` | 查無資料 | 非交易日、盤中資料尚未更新、股票代碼錯誤 (或屬上櫃股票) |
| `parse` | 解析錯誤 | 回傳 JSON 格式異常 |
| `not-found` | 找不到 | 該股票代碼不存在於上市市場 |
| `io` | 存檔錯誤 | 指定的 `outputPath` 無法寫入 |
