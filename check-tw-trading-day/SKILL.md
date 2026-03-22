---
name: check-tw-trading-day
description: 檢查指定日期（或今日）是否為台股交易日。透過 TWSE 官方 API 查詢，無需任何 npm 依賴。適用於所有台股技能的前置交易日判斷。
---

# 台股交易日檢查

透過 TWSE 官方 API 快速判斷指定日期是否為台股交易日。

## 網站資訊

| 項目 | 說明 |
|------|------|
| API | https://www.twse.com.tw/exchangeReport/MI_INDEX |
| 查詢方式 | `type=IND`（大盤指數）回傳 `stat` 欄位判斷 |
| 依賴 | 無（使用 Node.js 內建 `https` 模組） |

## 執行方式

> 須從**專案根目錄**（`node_modules` 所在位置）執行。

```bash
# 語法
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]

# 檢查今日
node check-tw-trading-day/scripts/check_tw_trading_day.mjs

# 檢查指定日期
node check-tw-trading-day/scripts/check_tw_trading_day.mjs 20260316

# 指定輸出路徑
node check-tw-trading-day/scripts/check_tw_trading_day.mjs 20260316 ./output/trading_day.json
```

## 輸出格式

### stdout（供 shell/腳本判斷）

```
檢查日期：20260316
API：https://www.twse.com.tw/...
結果：交易日 ✅
TRADING_DAY=true
```

或

```
結果：非交易日 ❌ (很抱歉，沒有符合條件的資料!)
TRADING_DAY=false
```

### 檔案輸出（自動寫入）

**預設檔名**：`check_tw_trading_day_YYYYMMDD.json`（可透過 `outputPath` 參數覆寫）

交易日：
```json
{
  "status": "success",
  "message": {
    "date": "20260316",
    "tradingDay": true
  }
}
```

非交易日：
```json
{
  "status": "success",
  "message": {
    "date": "20260316",
    "tradingDay": false,
    "reason": "很抱歉，沒有符合條件的資料!"
  }
}
```

錯誤：
```json
{
  "type": "error",
  "message": "API request failed: ..."
}
```

> 無論成功或錯誤，結果**一律寫入檔案**後才 exit。

## Exit Code

| Exit Code | 意義 |
|-----------|------|
| `0` | 交易日 |
| `1` | 非交易日（假日、颱風假等） |
| `2` | API 錯誤（網路問題、解析失敗） |

## 判斷邏輯

- **週末前置檢查**：若指定日期為週六或週日，直接判定為非交易日，不呼叫 API
- TWSE API `stat === "OK"` → **交易日**
- TWSE API `stat` 包含「很抱歉」 → **非交易日**

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多 10 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

若 10 次後仍失敗，才寫入錯誤並 exit 2。

> 非交易日回應（`stat !== "OK"`）**不會**觸發重試（非暫時性狀態）。

## 快速執行

```bash
# 從專案根目錄執行
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# 讀取 stdout 中的 TRADING_DAY=true/false
# 若 TRADING_DAY=false，跳過後續台股任務
# 結果同時寫入 check_tw_trading_day_YYYYMMDD.json（或指定 outputPath）
```
