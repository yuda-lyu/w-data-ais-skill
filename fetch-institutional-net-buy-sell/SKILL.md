---
name: fetch-institutional-net-buy-sell
description: 抓取台股「三大法人買賣超」指定日期、指定個股的明細資料（外資/投信/自營/合計）。優先使用官方來源（TWSE + TPEX）以確保穩定性與可指定日期。適用於：(1) 盤後報告逐檔補齊法人買賣超、(2) 驗證盤前研判（法人買超/賣超）是否延續、(3) 需要可重複、可追溯的法人資料抓取流程。
---

# fetch-institutional-net-buy-sell（法人買賣超；官方版）

> 歷史版本曾使用 Goodinfo 網頁榜單抓取（Top10），但無法覆蓋「每一檔個股」且受 anti-bot 影響。
> 目前此技能改為 **官方來源優先**（TWSE + TPEX），支援「指定日期 + 指定代碼」穩定抓取。

## 資料來源（官方）

- **TWSE（上市）**：三大法人買賣超日報（T86）
  - `https://www.twse.com.tw/fund/T86?response=json&date=YYYYMMDD&selectType=ALL`
- **TPEX（上櫃）**：三大法人買賣明細資訊
  - `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&t=D&d=YYY/MM/DD&o=json`

> 興櫃通常不在上述兩個市場的「三大法人」明細內；若遇興櫃代碼，可能會落在 `missing`。

## 最佳實踐：使用 Node.js Axios Scripts

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援完整資料解析。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

1. **複製腳本**：將 `scripts/` 下的所有 `.mjs` 檔案複製到工作區。
2. **安裝依賴**：`npm install axios`。
3. **執行抓取**：
   - 抓取上市 (TWSE)：`node fetch_twse_t86.mjs`
   - 抓取上櫃 (TPEX)：`node fetch_tpex_3insti.mjs`
   - **一次抓取兩者**：`node fetch_all.mjs`

### 輸出結果
腳本會輸出 JSON 格式資料（包在 `JSON_OUTPUT_START` 標記中），並在工作區產生備份檔案：
- `twse_t86_YYYYMMDD.json`
- `tpex_3insti_YYYYMMDD.json`

## 輸出格式

```json
{
  "source": "twse+tpex",
  "date": "20260205",
  "dateROC": "115/02/05",
  "items": [
    {
      "code": "3481",
      "name": "群創",
      "market": "TWSE",
      "foreignNet": -124462,
      "investNet": 0,
      "dealerNet": 0,
      "totalNet": -124462,
      "raw": {
        "foreignBuy": 0,
        "foreignSell": 0,
        "investBuy": 0,
        "investSell": 0,
        "dealerBuy": 0,
        "dealerSell": 0
      }
    }
  ],
  "missing": ["6610"],
  "error": null
}
```

## 錯誤處理原則

- 若 TWSE/TPEX 任一方失敗，仍盡可能回傳另一方結果。
- `missing` 代表該代碼在兩邊都找不到（常見：興櫃、非交易日、代碼錯誤）。
- 呼叫端（例如盤後總結）應把錯誤寫入 `error_log.jsonl`，但不要阻斷報告產出。
