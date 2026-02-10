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
2. **執行腳本**：使用 `node` 執行該腳本，可帶入日期與股票代碼參數。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 標記中）。

```bash
# 範例：抓取全市場 (ALLBUT0999)
node fetch_twse.mjs 20260210 ALL

# 範例：抓取個股 (台積電)
node fetch_twse.mjs 20260210 2330
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

### 個股查詢

```json
{
  "source": "twse",
  "fetchTime": "2026-02-05T15:00:00+08:00",
  "date": "20260205",
  "dateROC": "115/02/05",
  "stock": {
    "code": "2330",
    "name": "台積電",
    "open": 982.00,
    "high": 990.00,
    "low": 980.00,
    "close": 988.00,
    "change": 6.00,
    "changePercent": 0.61,
    "volume": 28456789
  },
  "error": null
}
```

### 批次查詢

```json
{
  "source": "twse",
  "fetchTime": "2026-02-05T15:00:00+08:00",
  "date": "20260205",
  "stocks": [
    {
      "code": "2330",
      "name": "台積電",
      "open": 982.00,
      "close": 988.00,
      "change": 6.00,
      "changePercent": 0.61
    },
    {
      "code": "2317",
      "name": "鴻海",
      "open": 105.00,
      "close": 106.50,
      "change": 1.50,
      "changePercent": 1.43
    }
  ],
  "error": null
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

## 錯誤處理

```json
{
  "source": "twse",
  "fetchTime": "2026-02-05T15:00:00+08:00",
  "date": "20260205",
  "stock": null,
  "error": {
    "type": "not-found",
    "message": "Stock 9999 not found in TWSE",
    "details": "May be OTC stock, try TPEX API"
  }
}
```

### 常見錯誤

| 錯誤類型 | 說明 | 處理方式 |
|----------|------|----------|
| `not-found` | 股票不存在或為上櫃 | 改用 TPEX API |
| `non-trading` | 非交易日 | 回傳空資料 |
| `network` | 網路錯誤 | 重試 2-3 次 |
| `timeout` | 逾時 | 重試或稍後再試 |

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

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

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
  "attempts": [
    {"action": "retry after 5s", "result": "failed"}
  ],
  "resolution": "failed",
  "notes": "TWSE API may be slow during 14:30-15:00"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 固定為 `twse` |
| `phase` | ✅ | 階段：fetch / parse |
| `error.type` | ✅ | network / timeout / parse / empty / blocked / not-found |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `attempts` | ❌ | 重試紀錄（選填） |
| `resolution` | ✅ | success / failed |


### 錯誤類型

| type | 說明 |
|------|------|
| `network` | 網路連線失敗 |
| `timeout` | API 請求逾時 |
| `not-found` | 股票代碼不存在（可能為上櫃） |
| `non-trading` | 非交易日 |
| `parse` | JSON 解析失敗 |
| `rate-limit` | 請求過於頻繁被封鎖 |

### 何時紀錄

1. API 請求失敗或逾時
2. 股票代碼查無資料（需嘗試 TPEX）
3. 回傳資料格式異常
4. 每次重試嘗試

### 特殊處理

若查詢的股票在 TWSE 查無資料，記錄後應建議改用 TPEX API：

```json
{
  "source": "twse",
  "error": {
    "type": "not-found",
    "message": "Stock 6510 not found in TWSE"
  },
  "notes": "Suggest try TPEX API for OTC stocks"
}
```
