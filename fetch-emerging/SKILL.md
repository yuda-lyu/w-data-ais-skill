---
name: fetch-emerging
description: 從 Goodinfo 的 ShowK_Chart 取得興櫃個股指定日期的 OHLC（開高低收）。提供 CLI（date yyyymmdd + stockNo），輸出結構化 JSON。當 TWSE / TPEX 查無資料時可作為盤後價格備援來源。
---

# fetch-emerging（Goodinfo 興櫃 OHLC）

本技能用來抓取 **興櫃** 個股在指定交易日的 **OHLC（開盤/最高/最低/收盤）**。

資料來源：Goodinfo 台灣股市資訊網 `ShowK_Chart.asp?STOCK_ID=` 的明細表（AJAX data endpoint）。

## 特色

- 支援：輸入 `stockNo`（股票代碼）與 `date`（YYYYMMDD）
- 輸出：JSON（含 source、date、stock、ohlc、error）
- Anti-bot：優先使用 requests + headers + 模擬 Goodinfo 的 CLIENT_KEY cookie（避免必須啟動瀏覽器）

> 註：Goodinfo 有 anti-bot（JS setCookie + redirect）。本技能以「先抓一次頁面 → 解析參數 → 自行計算/寫入 CLIENT_KEY cookie → 再抓資料」方式處理。

## CLI

### 用法

```bash
python3 scripts/fetch_emerging.py --date 20260205 --stockNo 6610
```

### 參數

- `--date`：查詢日期（YYYYMMDD）
- `--stockNo`：股票代碼（例如 6610）

### 輸出格式

```json
{
  "source": "goodinfo",
  "market": "emerging",
  "date": "20260205",
  "dateROC": "115/02/05",
  "stock": {
    "code": "6610"
  },
  "ohlc": {
    "open": 0,
    "high": 0,
    "low": 0,
    "close": 0
  },
  "raw": {
    "fields": ["交易日期", "開盤", "最高", "最低", "收盤"],
    "row": ["115/02/05", "...", "...", "...", "..."]
  },
  "error": null
}
```

## 錯誤處理

- 若 Goodinfo 回傳仍為重定向頁（anti-bot 未繞過） → `error.type = "anti-bot"`
- 若找不到指定日期 → `error.type = "not-found"`
- 若表格解析失敗 → `error.type = "parse"`

## 已知限制

- Goodinfo 偶爾會調整欄位/表格結構；解析以「欄位名稱定位 index」為主，但仍可能需要更新。
- 若短時間大量呼叫可能遇到連線中斷/限流，程式內建重試與簡易退避。
