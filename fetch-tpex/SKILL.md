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

## API 端點（JSON）

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

## 使用方式

```bash
# 單檔
python3 scripts/fetch_tpex.py 20260205 6499

# 多檔
python3 scripts/fetch_tpex.py 20260205 6499 6610 3443

# JSON 原樣輸出（不格式化）
python3 scripts/fetch_tpex.py 20260205 6499 6610 --json
```

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

## 錯誤處理

- 若 `stat != OK`：

```json
{
  "source": "tpex",
  "date": "20260205",
  "stocks": [],
  "error": {
    "type": "non-trading",
    "message": "TPEX stat not OK",
    "details": "..."
  }
}
```

- 若個股代碼找不到：該代碼的 `stock` 會是 `null`（並在 error.details 記錄 missing codes）。
