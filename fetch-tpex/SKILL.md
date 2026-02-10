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

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援民國年自動轉換。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

1. **複製腳本**：從技能目錄讀取 `scripts/fetch_tpex.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本，可帶入日期與篩選代碼。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 標記中）。

```bash
# 範例：抓取全市場
node fetch_tpex.mjs 20260210

# 範例：抓取特定個股 (篩選)
node fetch_tpex.mjs 20260210 6499 6610
```

---

## API 端點 (Legacy)

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

回傳結構包含 `tables[0].fields` 與 `tables[0].data`。

## 交易日檢查

- 回傳 JSON 的 `stat` 欄位：
  - `OK`：交易日
  - 其他：視為非交易日/查無資料

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T15:30:00+08:00",
  "date": "20260205",
  "source": "tpex",
  "phase": "fetch",
  "error": {
    "type": "empty",
    "message": "API returned no data",
    "details": "aaData is empty or missing"
  },
  "attempts": [
    {"action": "retry after 5s", "result": "failed"}
  ],
  "resolution": "failed",
  "notes": "Possibly a holiday"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 固定為 `tpex` |
| `phase` | ✅ | 階段：fetch / parse |
| `error.type` | ✅ | network / timeout / parse / empty / blocked |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `attempts` | ❌ | 重試紀錄（選填） |
| `resolution` | ✅ | success / failed |

## 輸出格式

```json
{
  "source": "tpex",
  "fetchTime": "2026-02-06T04:50:00+08:00",
  "date": "20260205",
  "dateROC": "115/02/05",
  "stocks": [
    {
      "code": "6499",
      "name": "...",
      "open": 0.0,
      "high": 0.0,
      "low": 0.0,
      "close": 0.0,
      "change": 0.0,
      "changePercent": 0.0,
      "volume": 0
    }
  ],
  "error": null
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

### 2. 查無資料 (aaData is empty)

**原因**：
- 該日為非交易日。
- 時間過早（盤後資料未更新）。
- 指定的個股代碼錯誤或非上櫃股票。

## 快速執行

```
請使用 fetch-tpex 技能抓取櫃買中心資料（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_tpex.mjs [日期] [代碼...]
3. 讀取並解析 JSON 輸出
```
