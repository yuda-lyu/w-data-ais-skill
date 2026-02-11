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

1. **複製腳本**：將技能目錄下的 `scripts/fetch_mops.mjs` 複製到當前 Agent 的 Workspace。
2. **安裝依賴**：在 Workspace 執行 `npm install puppeteer-core lodash-es`。
3. **執行腳本**：使用 `node fetch_mops.mjs` 執行（在 Workspace 內）。
   - **可選參數**：指定輸出檔案路徑 `node fetch_mops.mjs [outputPath]`。
4. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 與 `JSON_OUTPUT_END` 之間），若指定 outputPath 則會寫入檔案。

```bash
# 範例：輸出至 stdout
cp /path/to/skill/scripts/fetch_mops.mjs .
npm install puppeteer-core lodash-es
node fetch_mops.mjs

# 範例：輸出至檔案
node fetch_mops.mjs ./data/mops.json
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
[
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
          "titles": ["公司代號", "公司簡稱", "公告日期", ...]
        }
      ]
    },
    "timestamp": "2026-02-05T08:00:00.000Z"
  }
]
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

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄規則
當 Node.js 腳本執行失敗（Exit Code != 0）、標準錯誤輸出（stderr）包含錯誤訊息，或產出的 JSON 包含 `error` 欄位時，Agent 應捕捉錯誤並寫入 Log。

### 紀錄格式 (JSONL)

每行一筆 JSON，追加寫入：

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "mops",
  "phase": "fetch",
  "error": {
    "type": "browser",
    "message": "Puppeteer launch failed",
    "details": "Error: Failed to launch the browser process..."
  },
  "resolution": "failed"
}
```

### 常見錯誤類型 (type)

| type | 說明 | 觸發場景 |
|---|---|---|
| `browser` | 瀏覽器錯誤 | Chrome 未安裝、Puppeteer 啟動失敗 |
| `anti-bot` | 阻擋機制 | 頁面跳轉驗證、無法取得 Session |
| `timeout` | 逾時 | 網站回應過慢 (>60s) |
| `selector` | 解析錯誤 | 網頁改版導致找不到對應 DOM 元素 |
| `io` | 存檔錯誤 | 指定的 `outputPath` 無法寫入 |

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
2. 執行 scripts/fetch_mops.mjs [outputPath]
3. 讀取並解析 JSON 輸出
```
