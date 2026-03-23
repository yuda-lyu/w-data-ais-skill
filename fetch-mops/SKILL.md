---
name: fetch-mops
description: 抓取 MOPS（公開資訊觀測站）重大公告，回傳結構化 JSON。適用於台股調研、個股公告查詢、財報/訴訟/庫藏股等即時資訊。
---

# MOPS 資料抓取

從公開資訊觀測站（MOPS）抓取上市櫃公司重大公告。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://mops.twse.com.tw |
| 資料類型 | 官方公告（財報、重訊、股利、庫藏股、訴訟等） |
| 抓取方式 | browser evaluate + 內部 API |
| 更新頻率 | 即時 |

## 🚦 交易日檢查（建議）

MOPS 重大公告僅在台股交易日產生。建議執行前先確認：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD]
# TRADING_DAY=true  → 繼續執行
# TRADING_DAY=false → 跳過，非交易日無公告資料
```

> 詳見 `check-tw-trading-day` 技能。

## 最佳實踐：使用 Puppeteer Script（推薦）

由於 MOPS 網站結構複雜（Vue SPA + Anti-bot），建議直接使用本技能附帶的 Puppeteer 腳本進行抓取，穩定性最高。

### 安裝指引

1. 環境需安裝 Chrome 或 Chromium（腳本自動偵測 Windows、Linux、macOS 路徑）
2. 安裝所需 npm 套件：

```bash
npm install puppeteer-core
```

### 執行方式

> 執行環境須可存取 `node_modules`（含所需依賴套件）。

1. **執行腳本**：`node fetch-mops/scripts/fetch_mops.mjs [outputPath]`
2. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `mops_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：輸出至指定路徑
node fetch-mops/scripts/fetch_mops.mjs ./w-data-news/tw-stock-research/20260316/raw/mops.json
```

### 腳本邏輯摘要
- 自動偵測系統瀏覽器路徑。
- 啟動 Headless Chrome。
- 前往 MOPS 頁面取得 Session/Referer（導航失敗自動重試，最多重試 10 次，含初始請求最多執行 11 次）。
- 使用 `page.evaluate` 於瀏覽器環境內發送 API 請求（每次 API 呼叫均有重試機制）。
- 依序抓取上市、上櫃、興櫃、公開發行四類公告。
- 輸出結構化 JSON。
- **注意**：若任一市場類別抓取失敗（即使其餘成功），整體 `status` 仍為 `"error"`。呼叫端收到 `status: "error"` 時應一律視為有問題並回報，不區分全部失敗或部分失敗。

## 輸出格式

**預設檔名**：`mops_YYYYMMDD.json`

成功：
```json
{
  "status": "success",
  "message": [
    {
      "market": "上市",
      "marketKind": "sii",
      "data": {
        "code": 200,
        "message": "查詢成功",
        "result": [
          {
            "data": [
              ["2330", "台積電", "115/02/05", 1, "本公司董事會決議股利分派", "", "..."]
            ],
            "header": "決定分派股息及紅利或其他利益之基準日公告",
            "titles": ["公司代號", "公司簡稱", "公告日期", "..."]
          }
        ]
      },
      "timestamp": "2026-02-05T08:00:00.000Z"
    }
  ]
}
```

錯誤：
```json
{
  "status": "error",
  "message": "錯誤：找不到 Chrome 或 Edge 瀏覽器。請確認已安裝。"
}
```

## 篩選標準

### 要抓（會影響股價）

- 營收公告、財報
- 股利分派
- 庫藏股買回、減資、現增
- 併購、處分資產、重大合約
- 訴訟、仲裁結果、罰鍰
- 駭客攻擊、資安事件
- 澄清媒體報導

### 跳過（例行公告）

- 更名公告
- 背書保證、資金貸與
- 董事會/股東會召開通知
- 發言人/主管異動

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'puppeteer-core'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install puppeteer-core
```

### 2. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多重試 10 次，含初始請求最多執行 11 次），遇到以下情況時自動等待後重試：
- 頁面導航失敗（`page.goto` 拋出例外）
- API 回傳 HTTP 5xx 錯誤
- 瀏覽器內部網路錯誤（`fetch` 拋出例外）

| 重試次 | 等待時間 |
|--------|---------|
| 1 | 5s |
| 2 | 10s |
| 3 | 15s |
| ... | ... |
| 6+ | 30s（上限）|

> 解析錯誤（`Parse Error`）**不會**觸發重試（非暫時性錯誤）。

### 3. 瀏覽器未找到

**症狀**：
- 腳本輸出 `錯誤：找不到 Chrome 或 Edge 瀏覽器`

**解決方法**：
- 確認系統已安裝 Chrome/Chromium。
- 或手動修改腳本中的 `executablePath` 指向正確路徑。

## 快速執行

```bash
# 執行時須確保 `node_modules` 可存取
node fetch-mops/scripts/fetch_mops.mjs [outputPath]

# 範例
node fetch-mops/scripts/fetch_mops.mjs ./w-data-news/tw-stock-research/YYYYMMDD/raw/mops.json
```
