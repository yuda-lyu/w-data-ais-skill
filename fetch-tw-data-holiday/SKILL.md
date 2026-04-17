---
name: fetch-tw-data-holiday
description: 查詢台灣國定假日，回傳指定日期是否為假日及假日名稱。資料來源為證交所 OpenAPI，涵蓋當年度所有國定假日（含補假）。
---

# 台灣假日查詢

從證交所 OpenAPI 取得台灣當年度國定假日清單，支援查詢指定日期是否為假日。

## 資料來源

| 項目 | 說明 |
|------|------|
| API | https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule |
| 資料類型 | 台灣國定假日（元旦、春節、和平紀念日、兒童節、清明節、勞動節、端午節、中秋節、國慶日等） |
| 抓取方式 | HTTPS GET（純 Node.js，無外部依賴） |
| 涵蓋範圍 | 當年度（API 僅提供當年資料） |
| 自動過濾 | 排除交易日標記、結算作業日等非假日條目 |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

本技能**無需額外安裝 npm 套件**，僅使用 Node.js 內建模組（`https`、`fs`、`path`）。確認 Node.js ≥ 18 即可。

驗證 Node.js 可用：
```bash
node -v
```

## 執行方式

```bash
node fetch-tw-data-holiday/scripts/fetch_tw_data_holiday.mjs [YYYYMMDD] [outputPath]
```

| 參數 | 必填 | 說明 |
|------|------|------|
| `YYYYMMDD` | 否 | 西元日期（8 碼），指定時會判定該日是否為假日 |
| `outputPath` | 否 | 輸出 JSON 路徑，預設 `tw_holiday_YYYYMMDD.json` |

### 範例

```bash
# 查詢特定日期是否為假日
node fetch-tw-data-holiday/scripts/fetch_tw_data_holiday.mjs 20260101 ./output/holiday.json

# 僅取得當年度完整假日清單
node fetch-tw-data-holiday/scripts/fetch_tw_data_holiday.mjs "" ./output/holiday.json
```

### stdout 關鍵輸出

| 輸出 | 說明 |
|------|------|
| `HOLIDAY=true` | 指定日期為台灣假日 |
| `HOLIDAY=false` | 指定日期非台灣假日 |
| `HOLIDAY=error` | API 錯誤 |
| `HOLIDAY_COUNT=N` | 未指定日期時，回傳假日總數 |

## 輸出格式

**預設檔名**：`tw_holiday_YYYYMMDD.json`（使用查詢日期或當天日期）

成功（有指定日期）：
```json
{
  "status": "success",
  "message": {
    "source": "twse-openapi",
    "dataYear": "2026",
    "totalHolidays": 22,
    "checkDate": "20260101",
    "isHoliday": true,
    "holidayName": "中華民國開國紀念日",
    "holidays": [
      {
        "date": "20260101",
        "rocDate": "1150101",
        "name": "中華民國開國紀念日",
        "weekday": "四",
        "description": "依規定放假1日。"
      }
    ]
  }
}
```

成功（未指定日期，僅清單）：
```json
{
  "status": "success",
  "message": {
    "source": "twse-openapi",
    "dataYear": "2026",
    "totalHolidays": 22,
    "holidays": [ ... ]
  }
}
```

錯誤：
```json
{
  "status": "error",
  "message": "API 錯誤：HTTP 503"
}
```

## 腳本邏輯摘要

1. 呼叫證交所 OpenAPI 取得當年度假日排程（民國日期格式）。
2. 過濾非假日條目（交易日標記、結算作業日）。
3. 民國日期轉換為西元日期（`YYYMMDD` → `YYYYMMDD`）。
4. 去重、排序後輸出結構化 JSON。
5. 若指定查詢日期，額外比對並回傳 `isHoliday` / `holidayName`。
6. 若查詢年份與 API 資料年份不同，輸出警告。

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `API 錯誤：HTTP 5xx` | 證交所伺服器暫時無回應 | 腳本自動重試（最多重試 10 次，含初始請求最多執行 11 次，含漸進延遲） |
| `API 錯誤：HTTP 429` | 請求過於頻繁 | 腳本自動重試，或稍後再試 |
| `API 回傳非 JSON 格式` | 伺服器回傳維護頁面 | 稍後再試 |
| `警告：查詢年份 X 與 API 資料年份 Y 不同` | API 僅提供當年度資料 | 只能查詢當年度日期 |
| `HOLIDAY=false` 但該日確為假日 | 查詢日期非當年度 | 確認日期年份與當年一致 |

## 快速執行

```bash
# 查詢指定日期
node fetch-tw-data-holiday/scripts/fetch_tw_data_holiday.mjs YYYYMMDD [outputPath]

# 範例：查詢 2026 元旦
node fetch-tw-data-holiday/scripts/fetch_tw_data_holiday.mjs 20260101 ./output/holiday.json
```
