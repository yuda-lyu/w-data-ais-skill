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

或（盤前推定）

```
結果：推定交易日 ✅ (盤前/盤中：API 尚無當日收盤資料，推定為交易日（平日且非 TWSE 已知假日）)
TRADING_DAY=true
```

或

```
結果：非交易日 ❌ (很抱歉，沒有符合條件的資料!)
TRADING_DAY=false
```

或（API 錯誤時）

```
結果：API 錯誤
TRADING_DAY=error
```

### 檔案輸出（自動寫入）

**預設檔名**：`check_tw_trading_day_YYYYMMDD.json`（可透過 `outputPath` 參數覆寫）

交易日（有收盤資料）：
```json
{
  "status": "success",
  "message": {
    "date": "20260316",
    "tradingDay": true
  }
}
```

交易日（盤前推定）：
```json
{
  "status": "success",
  "message": {
    "date": "20260316",
    "tradingDay": true,
    "presumed": true,
    "reason": "盤前/盤中：API 尚無當日收盤資料，推定為交易日（平日且非 TWSE 已知假日）"
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
  "status": "error",
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

```
1. 週末前置檢查 → 週六/日直接判定非交易日（2019 年起無例外）
2. TWSE MI_INDEX API 查詢：
   ├─ stat≠OK（「很抱歉…」）      → 非交易日（TWSE 明確否認）
   ├─ stat=OK + data 非空         → 交易日（有收盤資料）
   └─ stat=OK + data 為空         → 依時間區分：
        ├─ 查詢日期=今日 且 < 14:30 → 推定交易日（盤前/盤中，收盤資料尚未就緒）
        ├─ 查詢日期=今日 且 ≥ 14:30 → 非交易日（收盤資料應已就緒卻沒有）
        └─ 查詢日期≠今日            → 非交易日（未來日期或資料不存在）
3. 網路錯誤（重試 10 次仍失敗）    → TRADING_DAY=error (exit 2)
```

### 為什麼 stat=OK + data=[] 不等於非交易日？

MI_INDEX 是「每日**收盤**行情」API（約 14:30~16:00 更新），不是交易日曆 API：
- **國定假日**：TWSE 回傳 `stat≠OK`（明確否認），不會走到 data=[] 分支
- **盤前查當日**：TWSE 回傳 `stat=OK`（未否認交易日），但收盤資料尚未產生 → data=[]
- **未來日期**：同樣 `stat=OK` + data=[]，因日期有效但資料不存在

因此 `stat=OK + data=[]` 需結合「是否為當日」和「當前時間」判斷。

### 盤前推定的安全性

推定為交易日時，JSON 輸出包含 `"presumed": true` 欄位。推定的前提：
1. 已通過 isWeekend() → 不是週六日
2. TWSE 回傳 stat=OK → **未被 TWSE 日曆標記為假日**
3. 當前時間 < 14:30 → 收盤資料確實尚未就緒

唯一誤判風險：颱風假等**臨時停市**（TWSE 可能來不及更新 API）。此情形極罕見（一年 0~2 次），且後續子腳本會各自失敗並記錄錯誤，不會產生錯誤資料。

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多重試 10 次，含初始請求最多執行 11 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

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
# 無需額外安裝套件（僅使用 Node.js 內建模組）
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# 讀取 stdout 中的 TRADING_DAY=true/false
# 若 TRADING_DAY=false，跳過後續台股任務
# 結果同時寫入 check_tw_trading_day_YYYYMMDD.json（或指定 outputPath）
```
