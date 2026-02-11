---
name: fetch-institutional-net-buy-sell
description: 抓取台股「三大法人買賣超」指定日期、指定個股的明細資料（外資/投信/自營/合計）。優先使用官方來源（TWSE + TPEX）以確保穩定性與可指定日期。適用於：(1) 盤後報告逐檔補齊法人買賣超、(2) 驗證盤前研判（法人買超/賣超）是否延續、(3) 需要可重複、可追溯的法人資料抓取流程。
---

# fetch-institutional-net-buy-sell（法人買賣超；官方版）

> 歷史版本曾使用 Goodinfo 網頁榜單抓取（Top10），但無法覆蓋「每一檔個股」且受 anti-bot 影響。
> 目前此技能改為 **官方來源優先**（TWSE + TPEX），支援「指定日期 + 指定代碼」穩定抓取。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 (上市) | https://www.twse.com.tw/fund/T86 |
| 網址 (上櫃) | https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php |
| 資料類型 | 三大法人買賣超日報 (外資/投信/自營商) |
| 抓取方式 | Node.js Axios Script |
| 更新時間 | 每日 15:00 後 |

## 最佳實踐：使用 Node.js Axios Scripts

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援完整資料解析。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

1. **複製腳本**：將 `scripts/` 下的所有 `.mjs` 檔案複製到工作區。
2. **安裝依賴**：`npm install axios`。
3. **執行抓取**：
   - **TWSE (上市)**: `node fetch_twse_t86.mjs [stockCode|all] [date] [outputPath]`
   - **TPEX (上櫃)**: `node fetch_tpex_3insti.mjs [stockCode|all] [date] [outputPath]`
   
   - `stockCode`: 股票代碼 (單檔或逗號分隔) 或 'all'
   - `date`: YYYYMMDD (例如 20260210)
   - `outputPath`: 輸出 JSON 檔案路徑

```bash
# 範例：抓取 TWSE 全市場 (2026/02/10)，輸出至檔案
node fetch_twse_t86.mjs all 20260210 ./data/twse_t86.json

# 範例：抓取 TPEX 特定個股 (2026/02/10)，輸出至 stdout
node fetch_tpex_3insti.mjs 6499,6610 20260210
```

### 輸出結果
腳本會輸出 JSON 格式資料（包在 `JSON_OUTPUT_START` 標記中），並在工作區產生備份檔案：
- `twse_t86_YYYYMMDD.json`
- `tpex_3insti_YYYYMMDD.json`

## 輸出格式

### TWSE (上市 T86)

```json
{
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
```

### TPEX (上櫃 3Insti)

```json
{
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
```

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄規則
當 Node.js 腳本執行失敗（Exit Code != 0）或標準錯誤輸出（stderr）包含錯誤訊息時，Agent 應捕捉錯誤並寫入 Log。

### 紀錄格式 (JSONL)

每行一筆 JSON，追加寫入：

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "institutional",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "API request failed",
    "details": "TWSE T86 API returned status: 很抱歉，沒有符合條件的資料!"
  },
  "resolution": "failed",
  "notes": "Possibly a holiday or data not yet available"
}
```

### 常見錯誤類型 (type)

| type | 說明 | 觸發場景 |
|---|---|---|
| `network` | 網路錯誤 | HTTP 狀態碼非 200、連線逾時 |
| `empty` | 查無資料 | 非交易日、下午 3 點前資料未更新 |
| `parse` | 解析錯誤 | 回傳 JSON 格式異常 |
| `io` | 存檔錯誤 | 指定的 `outputPath` 無法寫入 |

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

### 2. 資料缺失

**症狀**：
- 回傳 `很抱歉，沒有符合條件的資料!`

**解決方法**：
- 確認當日是否為交易日。
- 確認時間是否已過下午 3 點（法人資料通常在盤後 3 點公佈）。

## 快速執行

```
請使用 fetch-institutional-net-buy-sell 技能抓取法人買賣超（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_twse_t86.mjs 或 scripts/fetch_tpex_3insti.mjs [stockCode|all] [date] [outputPath]
3. 讀取並解析 JSON 輸出
```
