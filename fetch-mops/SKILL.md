---
name: fetch-mops
description: 抓取 MOPS（公開資訊觀測站）重大公告。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、個股公告查詢、財報/訴訟/庫藏股等即時資訊。
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

## 最佳實踐：使用 Puppeteer Script（推薦）

由於 MOPS 網站結構複雜（Vue SPA + Anti-bot），建議直接使用本技能附帶的 Puppeteer 腳本進行抓取，穩定性最高。

### 前置需求
1. 確保環境已安裝 Chrome/Chromium (`/usr/bin/google-chrome` 或類似路徑)。
2. 在工作區安裝依賴：`npm install puppeteer-core lodash-es`。

### 執行方式

1. **讀取腳本**：從技能目錄讀取 `scripts/fetch_mops.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 與 `JSON_OUTPUT_END` 之間）。

```bash
# 範例
node scripts/fetch_mops.mjs
```

### 腳本邏輯摘要
- 自動偵測系統瀏覽器路徑。
- 啟動 Headless Chrome。
- 前往 MOPS 頁面取得 Session/Referer。
- 使用 `page.evaluate` 於瀏覽器環境內發送 API 請求。
- 依序抓取上市、上櫃、興櫃、公開發行四類公告。
- 輸出結構化 JSON。

## 輸出格式

```json
{
  "source": "mops",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "code": "2330",
      "name": "台積電",
      "date": "2026-02-05",
      "time": "07:30",
      "title": "本公司董事會決議股利分派",
      "type": "股利",
      "url": "https://mops.twse.com.tw/..."
    }
  ],
  "error": null
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

## 錯誤處理

遭遇錯誤時，回傳錯誤資訊並記錄：

```json
{
  "source": "mops",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "network",
    "message": "API request failed",
    "details": "..."
  }
}
```

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄格式

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "mops",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "API request timeout",
    "details": "POST /mops/api/home_page/t05sr01_1 timeout after 30s"
  },
  "attempts": [
    {"action": "retry after 5s", "result": "failed"},
    {"action": "retry after 10s", "result": "success"}
  ],
  "resolution": "success",
  "notes": "MOPS API may be slow during market open hours"
}
```

### 錯誤類型

| type | 說明 |
|------|------|
| `network` | 網路連線失敗 |
| `timeout` | 請求逾時 |
| `parse` | JSON 解析失敗 |
| `empty` | API 回傳空資料 |
| `browser` | 瀏覽器操作失敗 |

### 何時紀錄

1. API 請求失敗或逾時
2. 瀏覽器無法開啟/evaluate 失敗
3. 回傳資料格式異常
4. 重試嘗試（成功或失敗皆記錄）

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'puppeteer-core'` 或 `lodash-es`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install puppeteer-core lodash-es
```

### 2. 瀏覽器未找到

**症狀**：
- 腳本輸出 `錯誤：找不到 Chrome 或 Edge 瀏覽器`

**解決方法**：
- 確認系統已安裝 Chrome/Chromium。
- 或手動修改腳本中的 `executablePath` 指向正確路徑。

## 快速執行

```
請使用 fetch-mops 技能抓取 MOPS 重大公告（使用 Puppeteer 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_mops.mjs
3. 讀取並解析 JSON 輸出
```
