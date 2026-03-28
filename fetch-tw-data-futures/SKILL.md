---
name: fetch-tw-data-futures
description: 抓取台灣期貨交易所（TAIFEX）資料。包含台指期行情（TX 近月合約開高低收結算價）、三大法人期貨未平倉、Put/Call Ratio。適用於期貨盤後分析、法人籌碼追蹤。
---

# 期交所資料抓取

從台灣期貨交易所（TAIFEX）抓取期貨相關資料。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://www.taifex.com.tw |
| 資料類型 | 台指期行情、三大法人未平倉、Put/Call Ratio |
| 抓取方式 | CSV 下載（Big5/MS950 編碼） |
| 更新時間 | 每日 15:00 後（收盤後）；盤後資料約隔日 06:00 後 |

## 🚦 交易日檢查（建議）

期交所資料僅在台股交易日產生。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，穩定性高且支援三種資料同時抓取。

### 安裝指引

所需套件：`axios`

執行前請先驗證套件是否可用：
```bash
node -e "require('axios'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install axios
```

### 執行方式

> 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）。

1. **執行腳本**：`node fetch-tw-data-futures/scripts/fetch_taifex.mjs [YYYYMMDD] [outputPath]`
   - `YYYYMMDD`: 查詢日期（例如 20260326）；可省略，預設為今日。
   - `outputPath`: 輸出 JSON 檔案路徑；可省略，預設為 `taifex_YYYYMMDD.json`。
2. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：抓取 2026/03/26 資料
node fetch-tw-data-futures/scripts/fetch_taifex.mjs 20260326

# 範例：抓取今日資料並輸出至指定路徑
node fetch-tw-data-futures/scripts/fetch_taifex.mjs 20260326 ./data/taifex.json
```

### 抓取內容

腳本會同時抓取三類資料（平行請求），任一類失敗不影響其他類：

| 資料 | 來源 | 說明 |
|------|------|------|
| 台指期行情 | `futDataDown` | TX 近月合約：開高低收、結算價、成交量；盤後收盤價與成交量 |
| 三大法人未平倉 | `futContractsDateDown` | 外資、投信、自營商的台指期未平倉口數與淨額 |
| Put/Call Ratio | `pcRatioDown` | 買賣權成交量、未平倉量及比率 |

---

## API 端點

### 1. 台指期行情 (Futures Daily Market)

```
https://www.taifex.com.tw/cht/3/futDataDown?down_type=1&queryStartDate=YYYY/MM/DD&queryEndDate=YYYY/MM/DD&commodity_id=TX
```

**參數**：
| 參數 | 說明 | 範例 |
|------|------|------|
| `down_type` | 下載類型 | 1 |
| `queryStartDate` | 起始日期（YYYY/MM/DD） | 2026/03/26 |
| `queryEndDate` | 結束日期（YYYY/MM/DD） | 2026/03/26 |
| `commodity_id` | 商品代碼 | TX（台指期）、MTX（小台指） |

**CSV 欄位**：交易日期, 契約, 到期月份(週別), 開盤價, 最高價, 最低價, 收盤價, 漲跌價, 漲跌%, 成交量, 結算價, 未沖銷契約數, ..., 交易時段

### 2. 三大法人期貨未平倉 (Institutional Positions)

```
https://www.taifex.com.tw/cht/3/futContractsDateDown?queryStartDate=YYYY/MM/DD&queryEndDate=YYYY/MM/DD&commodityId=TXF
```

**參數**：
| 參數 | 說明 | 範例 |
|------|------|------|
| `queryStartDate` | 起始日期 | 2026/03/26 |
| `queryEndDate` | 結束日期 | 2026/03/26 |
| `commodityId` | 商品代碼 | TXF（臺股期貨） |

**CSV 欄位**：日期, 商品名稱, 身份別, 多方交易口數, ..., 多方未平倉口數, ..., 空方未平倉口數, ..., 多空未平倉口數淨額, ...

### 3. Put/Call Ratio

```
https://www.taifex.com.tw/cht/3/pcRatioDown?queryStartDate=YYYY/MM/DD&queryEndDate=YYYY/MM/DD
```

**CSV 欄位**：日期, 賣權成交量, 買權成交量, 買賣權成交量比率%, 賣權未平倉量, 買權未平倉量, 買賣權未平倉量比率%

## 輸出格式

**預設檔名**：`taifex_YYYYMMDD.json`

成功：
```json
{
  "status": "success",
  "message": {
    "source": "taifex",
    "date": "20260326",
    "futures": {
      "tx": {
        "contractMonth": "202604",
        "open": 33855,
        "high": 34024,
        "low": 33347,
        "close": 33440,
        "settlement": 33441,
        "volume": 68947,
        "afterHoursClose": 33800,
        "afterHoursSettlement": null,
        "afterHoursVolume": 72885
      }
    },
    "institutional": {
      "foreign": {
        "longContracts": 10102,
        "shortContracts": 47167,
        "netContracts": -37065,
        "netAmount": -247910478,
        "tradingLong": 74567,
        "tradingShort": 75746,
        "tradingNet": -1179
      },
      "dealers": { "..." : "..." },
      "trust": { "..." : "..." }
    },
    "pcRatio": {
      "putVolume": 214983,
      "callVolume": 196814,
      "ratio": 109.23,
      "putOpenInterest": 93998,
      "callOpenInterest": 73093,
      "openInterestRatio": 128.60
    }
  }
}
```

部分成功（某類資料抓取失敗）：
```json
{
  "status": "partial",
  "message": { "..." : "..." },
  "errors": ["台指期行情: ..."]
}
```

錯誤：
```json
{
  "status": "error",
  "message": "所有資料抓取失敗: ..."
}
```

## 注意事項

### 日期格式

- 腳本輸入：`YYYYMMDD`（例如 20260326）
- TAIFEX API：`YYYY/MM/DD`（腳本內自動轉換）
- **不使用民國年**，API 接受西元年

### 近月合約判定

腳本自動選取最近到期月份的 TX 合約（排除價差合約），分別取「一般」（日盤）和「盤後」（夜盤）的行情資料。

### 編碼

TAIFEX CSV 下載使用 **MS950（Big5）** 編碼，腳本使用 `TextDecoder('big5')` 進行解碼。

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多重試 10 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

### 2. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
```bash
npm install axios
```

### 3. 查無資料

**原因**：
- 該日為非交易日（假日）。
- 尚未收盤或資料尚未更新。
- 盤後交易資料通常於隔日清晨更新。

### 4. 部分資料抓取失敗

腳本採用**部分成功**機制：三類資料平行抓取，任一類失敗不影響其他類。失敗的類別會記錄在 `errors` 陣列中，對應欄位設為 `null`。

## 快速執行

```bash
# 執行前須先偵測所需套件是否已安裝（參考安裝指引中的驗證指令）
node fetch-tw-data-futures/scripts/fetch_taifex.mjs [YYYYMMDD] [outputPath]

# 範例：抓取特定日期
node fetch-tw-data-futures/scripts/fetch_taifex.mjs 20260326 ./data/taifex.json
```
