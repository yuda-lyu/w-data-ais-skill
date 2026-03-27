---
name: fetch-margin-trading
description: 抓取台股融資融券（信用交易）餘額資料。支援上市（TWSE）與上櫃（TPEX）全市場或指定個股查詢，回傳結構化 JSON。適用於盤後分析融資融券增減、資券變化追蹤、籌碼面研判。
---

# 融資融券資料抓取

從臺灣證券交易所（TWSE）與櫃買中心（TPEX）抓取**融資融券餘額**（信用交易）資料。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 (上市) | https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN |
| 網址 (上櫃) | https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php |
| 資料類型 | 融資融券餘額日報（融資買進/賣出/餘額、融券買進/賣出/餘額） |
| 抓取方式 | Node.js Axios Script |
| 更新時間 | 每日 15:00 後 |

## 交易日檢查（建議）

融資融券資料僅在台股交易日產生（每日 15:00 後更新）。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  -> 繼續執行
# TRADING_DAY=false -> 跳過，非交易日無融資融券資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Node.js Axios Scripts

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援完整資料解析。

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

### 執行方式

> 執行環境須可存取 `node_modules`（含所需依賴套件）。

1. **執行抓取**：
   - **TWSE (上市)**: `node fetch-margin-trading/scripts/fetch_twse_margin.mjs [stockCode|all] [date] [outputPath]`
   - **TPEX (上櫃)**: `node fetch-margin-trading/scripts/fetch_tpex_margin.mjs [stockCode|all] [date] [outputPath]`

   參數說明：
   - `stockCode`: 股票代碼（單檔或逗號分隔）或 `all`（全市場，預設）
   - `date`: YYYYMMDD（例如 20260326）；可省略，預設為今日
   - `outputPath`: 輸出 JSON 檔案路徑

```bash
# 範例：抓取 TWSE 全市場融資融券 (2026/03/26)，輸出至檔案
node fetch-margin-trading/scripts/fetch_twse_margin.mjs all 20260326 ./data/twse_margin.json

# 範例：抓取 TPEX 全市場融資融券 (2026/03/26)，輸出至檔案
node fetch-margin-trading/scripts/fetch_tpex_margin.mjs all 20260326 ./data/tpex_margin.json

# 範例：抓取特定個股
node fetch-margin-trading/scripts/fetch_twse_margin.mjs 2330 20260326 ./data/margin_2330.json

# 範例：逗號分隔多檔查詢
node fetch-margin-trading/scripts/fetch_twse_margin.mjs 2330,2317 20260326

# 範例：抓取上櫃特定個股
node fetch-margin-trading/scripts/fetch_tpex_margin.mjs 3293 20260326
```

### 輸出結果
腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生）。請讀取輸出檔取得資料，勿依賴 stdout：
- TWSE 預設：`twse_margin_YYYYMMDD.json`（指定個股時為 `twse_margin_CODE_YYYYMMDD.json`）
- TPEX 預設：`tpex_margin_YYYYMMDD.json`（指定個股時為 `tpex_margin_CODE_YYYYMMDD.json`）

無論成功或錯誤均寫入後才 exit。

## 輸出格式

### 成功

```json
{
  "status": "success",
  "message": {
    "source": "twse_margin",
    "date": "20260326",
    "count": 1254,
    "data": [
      {
        "code": "2330",
        "name": "台積電",
        "marginBuy": 635,
        "marginSell": 436,
        "marginCashRepay": 21,
        "marginPrevBalance": 26399,
        "marginBalance": 26577,
        "marginChange": 178,
        "marginLimit": 6483131,
        "shortSell": 0,
        "shortBuy": 15,
        "shortCashRepay": 2,
        "shortPrevBalance": 18,
        "shortBalance": 1,
        "shortChange": -17,
        "shortLimit": 6483131,
        "offset": 0,
        "note": "X"
      }
    ]
  }
}
```

### 欄位說明

| 欄位 | 說明 |
|------|------|
| `code` | 股票代號 |
| `name` | 股票名稱 |
| `marginBuy` | 融資買進（張） |
| `marginSell` | 融資賣出（張） |
| `marginCashRepay` | 融資現金償還（張） |
| `marginPrevBalance` | 融資前日餘額（張） |
| `marginBalance` | 融資今日餘額（張） |
| `marginChange` | 融資增減（張）= 今日餘額 - 前日餘額 |
| `marginLimit` | 融資次一營業日限額 |
| `shortSell` | 融券賣出（張）= 新增放空 |
| `shortBuy` | 融券買進（張）= 回補 |
| `shortCashRepay` | 融券現券償還（張） |
| `shortPrevBalance` | 融券前日餘額（張） |
| `shortBalance` | 融券今日餘額（張） |
| `shortChange` | 融券增減（張）= 今日餘額 - 前日餘額 |
| `shortLimit` | 融券次一營業日限額 |
| `offset` | 資券互抵（張） |
| `note` | 註記 |

### 錯誤

```json
{
  "status": "error",
  "message": "TWSE MI_MARGN API returned: 很抱歉，沒有符合條件的資料!"
}
```

## 注意事項

- **資料時間**：融資融券資料通常於交易日 15:00 後更新。非交易日（假日、國定假日）無資料。
- **上市 vs 上櫃**：上市股票使用 `fetch_twse_margin.mjs`，上櫃股票使用 `fetch_tpex_margin.mjs`。若不確定股票所屬市場，建議兩者都查詢。
- **單位**：所有數量單位為「張」（1,000 股）。

## 常見問題與排除

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

> 查無資料（`stat !== 'OK'` 或 `tables` 為空）**不會**觸發重試（非暫時性狀態）。

### 2. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

### 3. 資料缺失

**症狀**：
- 回傳 `很抱歉，沒有符合條件的資料!`（TWSE）
- 回傳 `no data`（TPEX）

**原因**：
- 該日為非交易日。
- 時間過早（融資融券資料通常在盤後 15:00 公佈）。
- 指定的個股代碼錯誤或非上市/上櫃股票。

> 無資料情況**不會**觸發重試（非暫時性錯誤）。

## 快速執行

```bash
# 執行時須確保 `node_modules` 可存取
node fetch-margin-trading/scripts/fetch_twse_margin.mjs [stockCode|all] [date] [outputPath]
node fetch-margin-trading/scripts/fetch_tpex_margin.mjs [stockCode|all] [date] [outputPath]

# 範例：全市場
node fetch-margin-trading/scripts/fetch_twse_margin.mjs all 20260326 ./data/margin_twse.json
node fetch-margin-trading/scripts/fetch_tpex_margin.mjs all 20260326 ./data/margin_tpex.json
```
