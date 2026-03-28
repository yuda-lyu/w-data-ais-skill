---
name: fetch-tw-data-institutional
description: 抓取台股「三大法人買賣超」指定日期、指定個股的明細資料（外資/投信/自營/合計）。優先使用官方來源（TWSE + TPEX）以確保穩定性與可指定日期。適用於：(1) 盤後報告逐檔補齊法人買賣超、(2) 驗證盤前研判（法人買超/賣超）是否延續、(3) 需要可重複、可追溯的法人資料抓取流程。
---

# fetch-tw-data-institutional（法人買賣超；官方版）

> 歷史版本曾使用 Goodinfo 網頁榜單抓取（Top10），但無法覆蓋「每一檔個股」且受 anti-bot 影響。
> 目前此技能改為 **官方來源優先**（TWSE + TPEX），支援「指定日期 + 指定代碼」穩定抓取。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 (上市) | https://www.twse.com.tw/rwd/zh/fund/T86 |
| 網址 (上櫃) | https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php |
| 資料類型 | 三大法人買賣超日報 (外資/投信/自營商) |
| 抓取方式 | Node.js Axios Script |
| 更新時間 | 每日 15:00 後 |

## 🚦 交易日檢查（建議）

三大法人買賣超資料僅在台股交易日產生（每日 15:00 後更新）。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無法人資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Node.js Axios Scripts

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援完整資料解析。

### 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

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

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）。

1. **執行抓取**：
   - **TWSE (上市)**: `node fetch-tw-data-institutional/scripts/fetch_twse_t86.mjs [stockCode|all] [date] [outputPath]`
   - **TPEX (上櫃)**: `node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs [stockCode|all] [date] [outputPath]`

   參數說明：
   - `stockCode`: 股票代碼（單檔或逗號分隔）或 `all`
   - `date`: YYYYMMDD（例如 20260210）
   - `outputPath`: 輸出 JSON 檔案路徑

```bash
# 範例：抓取 TWSE 全市場 (2026/02/10)，輸出至檔案
node fetch-tw-data-institutional/scripts/fetch_twse_t86.mjs all 20260210 ./data/twse_t86.json

# 範例：抓取 TPEX 全市場 (2026/02/10)，輸出至檔案
node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs all 20260210 ./data/tpex_3insti.json

# 範例：抓取 TPEX 特定個股
node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs 6499,6610 20260210
```

### 輸出結果
腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生）。請讀取輸出檔取得資料，勿依賴 stdout：
- 預設：`twse_t86_YYYYMMDD.json`（指定個股時為 `twse_t86_CODE_YYYYMMDD.json`，多檔時為 `twse_t86_CODE1_CODE2_YYYYMMDD.json`）
- 預設：`tpex_3insti_YYYYMMDD.json`（指定個股時為 `tpex_3insti_CODE_YYYYMMDD.json`，多檔時為 `tpex_3insti_CODE1_CODE2_YYYYMMDD.json`）

無論成功或錯誤均寫入後才 exit。

## 輸出格式

### TWSE (上市 T86)

成功：
```json
{
  "status": "success",
  "message": {
    "source": "twse",
    "date": "20260205",
    "data": [
      {
        "證券代號": "2330",
        "證券名稱": "台積電",
        "外陸資買進股數(不含外資自營商)": "...",
        "三大法人買賣超股數": "..."
      }
    ]
  }
}
```

### TPEX (上櫃 3Insti)

成功：
```json
{
  "status": "success",
  "message": {
    "source": "tpex",
    "date": "20260205",
    "data": [
      {
        "代號": "6499",
        "名稱": "益安",
        "外資及陸資(不含外資自營商)-買進股數": "...",
        "三大法人買賣超股數合計": "..."
      }
    ]
  }
}
```

錯誤（兩支腳本相同格式）：
```json
{
  "status": "error",
  "message": "TWSE T86 API returned: 很抱歉，沒有符合條件的資料!"
}
```

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
- 回傳 `很抱歉，沒有符合條件的資料!`

**解決方法**：
- 確認當日是否為交易日。
- 確認時間是否已過下午 3 點（法人資料通常在盤後 3 點公佈）。

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）
# TWSE 上市法人買賣超
node fetch-tw-data-institutional/scripts/fetch_twse_t86.mjs [stockCode|all] [date] [outputPath]

# TPEX 上櫃法人買賣超
node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs [stockCode|all] [date] [outputPath]

# 範例：全市場
node fetch-tw-data-institutional/scripts/fetch_twse_t86.mjs all 20260316 ./w-data-news/tw-stock-research/20260316/raw/institutional_twse.json
node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs all 20260316 ./w-data-news/tw-stock-research/20260316/raw/institutional_tpex.json
```
