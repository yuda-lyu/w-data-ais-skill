---
name: fetch-tpex
description: 抓取櫃買中心（TPEX）上櫃股票收盤資料。支援指定日期與多檔股票代碼，回傳結構化 JSON。適用於台股盤後分析、開收盤價查詢、上市(TWSE)/上櫃(TPEX)資料補齊。
---

# 櫃買中心（TPEX）資料抓取

從櫃買中心（TPEX）抓取**上櫃股票**盤後收盤資料（開盤/收盤/漲跌幅等）。

## 網站資訊

- 網址：https://www.tpex.org.tw/
- 資料類型：上櫃股票行情（盤後）
- 更新時間：收盤後（通常 14:30 後逐步完整）

## 🚦 交易日檢查（建議）

TPEX 股價資料僅在台股交易日產生。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無收盤資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援民國年自動轉換。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

> 須從**專案根目錄**（`node_modules` 所在位置）執行。

1. **安裝依賴**：`npm install axios`。
2. **執行腳本**：`node fetch-tpex/scripts/fetch_tpex.mjs [stockCode|all] [date] [outputPath]`
   - `stockCode`: 股票代碼（單檔或逗號分隔）或 `all`（全市場）
   - `date`: YYYYMMDD（例如 20260210）
   - `outputPath`: 輸出 JSON 檔案路徑
3. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `tpex_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：抓取全市場 (2026/02/10) 並輸出至檔案
node fetch-tpex/scripts/fetch_tpex.mjs all 20260210 ./data/tpex.json

# 範例：抓取特定個股 (2026/02/10) 並輸出至檔案
node fetch-tpex/scripts/fetch_tpex.mjs 6499 20260210 ./data/tpex_6499.json

# 範例：抓取特定個股 (今日)，自動產生 tpex_6499_YYYYMMDD.json
node fetch-tpex/scripts/fetch_tpex.mjs 6499
```

---

## API 端點

### 上櫃股票行情（指定交易日、全市場）

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

## 交易日檢查

- 腳本透過回傳資料列數是否為空來判斷：
  - 有資料列：交易日，正常輸出
  - 資料為空：視為非交易日/查無資料

## 輸出格式

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

## 注意事項

- **上櫃才查得到**：若股票是上市（TWSE），這個 API 可能找不到該代碼。
- 建議整合策略：
  1) 先用 `fetch-twse` 查上市
  2) 若 `not-found` 或無該代碼，再用 `fetch-tpex` 補齊

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

### 2. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多 10 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

若 10 次後仍失敗，才寫入錯誤並 exit 1。

### 3. 查無資料 (no data returned)

**原因**：
- 該日為非交易日。
- 時間過早（盤後資料未更新）。
- 指定的個股代碼錯誤或非上櫃股票。

> 無資料情況**不會**觸發重試（非暫時性錯誤）。

## 快速執行

```bash
# 從專案根目錄執行
node fetch-tpex/scripts/fetch_tpex.mjs [stockCode|all] [date] [outputPath]

# 範例：全市場
node fetch-tpex/scripts/fetch_tpex.mjs all 20260316 ./w-data-news/tw-stock-post-market/20260316/raw/prices_tpex.json
```
