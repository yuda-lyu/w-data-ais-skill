---
name: check-tw-trading-day
description: 檢查指定日期（或今日）是否為台股交易日。透過 TWSE 假日排程 API 前置檢查國定假日，再以 MI_INDEX API 確認交易狀態，僅需 `wsemi`（入口參數驗證）。適用於所有台股技能的前置交易日判斷。
---

# 台股交易日檢查

透過 TWSE 官方 API 快速判斷指定日期是否為台股交易日。

## 網站資訊

| 項目 | 說明 |
|------|------|
| MI_INDEX API | https://www.twse.com.tw/exchangeReport/MI_INDEX |
| 假日排程 API | https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule |
| 查詢方式 | 先比對假日排程攔截國定假日，再以 MI_INDEX 是否有當日收盤資料判斷 |
| 依賴 | `wsemi`（入口參數驗證）；並引用同技能庫的 fetch-tw-data-holiday（跨技能檔案相依） |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需套件：`wsemi`（用於核心函數入口的參數驗證）；其餘僅使用 Node.js 內建模組。確認 Node.js ≥ 18。

```bash
node -v   # 確認 Node.js 已安裝
node -e "import('wsemi').then(()=>console.log('deps OK')).catch(e=>{console.error(e.message);process.exit(1)})"
npm install wsemi   # 若上一行顯示錯誤
```

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
結果：交易日 ✅
TRADING_DAY=true
```

或（盤前推定）

```
結果：推定交易日 ✅ (盤前/盤中：API 尚無當日收盤資料，推定為交易日（平日且非 TWSE 已知假日）)
TRADING_DAY=true
```

或（國定假日）

```
結果：非交易日 ❌ (台灣假日：兒童節及民族掃墓節)
TRADING_DAY=false
```

或（平日但 MI_INDEX 已過收盤時間仍無資料）

```
結果：非交易日 ❌ (API 回傳 OK 但無交易資料（已過收盤時間仍無資料，推定為非交易日）)
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
    "reason": "API 回傳 OK 但無交易資料（已過收盤時間仍無資料，推定為非交易日）"
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
2. 台灣假日前置檢查 → 透過 TWSE 假日排程 API 比對國定假日
   ├─ 命中假日 → 非交易日（回傳假日名稱，如「兒童節及民族掃墓節」）
   └─ API 失敗 → 略過，交由後續 MI_INDEX 判斷
3. TWSE MI_INDEX API 查詢（type=IND；實測對任何「有效日期」一律回 stat=OK，是否為交易日看 data 有無）：
   ├─ stat=OK + data 非空         → 交易日（有收盤資料）
   ├─ stat=OK + data 為空         → 依時間區分：
   │    ├─ 查詢日期=今日 且 < 14:30 → 推定交易日（盤前/盤中，收盤資料尚未就緒）
   │    ├─ 查詢日期=今日 且 ≥ 14:30 → 非交易日（收盤資料應已就緒卻沒有）
   │    └─ 查詢日期≠今日            → 非交易日（未來日期或資料不存在）
   └─ stat≠OK（罕見，如日期格式無效）→ 非交易日（reason 帶回該 stat 字串）
   ※ 國定假日已於步驟 2 攔下、不會走到 MI_INDEX；即使走到，type=IND 對假日也是回 stat=OK+data=[]（非 stat≠OK）
4. 網路錯誤（重試 10 次仍失敗）    → TRADING_DAY=error (exit 2)
```

### 為什麼 stat=OK + data=[] 不等於非交易日？

MI_INDEX（type=IND）是「每日**收盤**指數行情」API（約 14:30~16:00 更新），不是交易日曆 API。實測它對「有效日期」一律回 `stat=OK`，是否為交易日全看 `data` 有無（**不會**用 stat≠OK／「很抱歉」否認非交易日）：
- **國定假日**：已在步驟 2（假日前置檢查）就攔下並回傳假日名稱，**根本不會走到 MI_INDEX**；縱使走到，type=IND 也是回 `stat=OK` + data=[]（非 stat≠OK）
- **盤前查當日**：`stat=OK`，但收盤資料尚未產生 → data=[]
- **未來日期 / 其他無資料日**：同樣 `stat=OK` + data=[]，因日期有效但資料不存在

因此 `stat=OK + data=[]` 本身無法區分「非交易日」與「盤前」，需結合「是否為當日」和「當前時間」判斷。

### 盤前推定的安全性

推定為交易日時，JSON 輸出包含 `"presumed": true` 欄位。推定的前提：
1. 已通過 isWeekend() → 不是週六日
2. 已通過假日排程 API 比對 → **不在國定假日清單內**（假日的排除主要靠這一步，非靠 MI_INDEX 的 stat）
3. TWSE MI_INDEX 回 stat=OK 且 API 正常運作（注意：type=IND 對假日也回 stat=OK+data=[]，故此項僅確認日期有效、服務正常，不負責排除假日）
4. 當前時間 < 14:30 → 收盤資料確實尚未就緒

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

> 非交易日回應（`stat=OK` 但 data=[]，或罕見的 `stat≠OK`）**不會**觸發重試（非暫時性狀態）；只有 HTTP 5xx／網路錯誤才重試。

## 快速執行

```bash
# 需先安裝 wsemi（見上方安裝指引）
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# 讀取 stdout 中的 TRADING_DAY=true/false
# 若 TRADING_DAY=false，跳過後續台股任務
# 結果同時寫入 check_tw_trading_day_YYYYMMDD.json（或指定 outputPath）
```
