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

## 最佳實踐：使用 Puppeteer Script（推薦）

由於 Goodinfo 設有 JavaScript 重導向與 Anti-bot 機制，建議使用本技能附帶的 Puppeteer 腳本進行抓取，穩定性最高。

### 前置需求
1. 確保環境已安裝 Chrome/Chromium。
2. 在工作區安裝依賴：`npm install puppeteer-core`。

### 執行方式

1. **複製腳本**：將 `scripts/fetch_emerging.mjs` 複製到工作區。
2. **安裝依賴**：`npm install puppeteer-core`。
3. **執行腳本**：使用 `node fetch_emerging.mjs [日期] [代碼]`。

```bash
# 範例：抓取 6610 在 2026/02/10 的資料
node fetch_emerging.mjs 20260210 6610
```

### 輸出結果
腳本會輸出 JSON 格式資料（包在 `JSON_OUTPUT_START` 標記中），並在工作區產生備份檔案。

---

## 舊版 Python 腳本 (Legacy)

Python 版本使用 requests 模擬 cookie，但在高強度反爬下可能失效。

### 用法
```bash
python3 scripts/fetch_emerging.py --date 20260205 --stockNo 6610
```

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

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T15:30:00+08:00",
  "date": "20260205",
  "source": "goodinfo",
  "phase": "fetch",
  "error": {
    "type": "anti-bot",
    "message": "Browser redirect timeout",
    "details": "Page stuck on redirect screen"
  },
  "attempts": [
    {"action": "retry after 10s", "result": "failed"}
  ],
  "resolution": "failed",
  "notes": "Anti-bot active"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 固定為 `goodinfo` |
| `phase` | ✅ | 階段：fetch / parse |
| `error.type` | ✅ | anti-bot / not-found / parse / timeout / browser |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `attempts` | ❌ | 重試紀錄（選填） |
| `resolution` | ✅ | success / failed |

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'puppeteer-core'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install puppeteer-core
```

### 2. 瀏覽器未找到

**症狀**：
- 腳本輸出 `Error: Browser not found.`

**解決方法**：
- 確認系統已安裝 Chrome/Chromium (`/usr/bin/google-chrome` 等)。

## 快速執行

```
請使用 fetch-emerging 技能抓取興櫃個股資料（使用 Puppeteer 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_emerging.mjs [日期] [代碼]
3. 讀取並解析 JSON 輸出
```
