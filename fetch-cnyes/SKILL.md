---
name: fetch-cnyes
description: 抓取鉅亨網（Anue）台股即時新聞（近 10 天，最多 100 筆），回傳結構化 JSON。適用於台股調研、產業新聞、法人動態等即時資訊。
---

# 鉅亨網資料抓取

從鉅亨網（Anue/cnyes）抓取台股即時新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://news.cnyes.com/news/cat/tw_stock |
| 資料類型 | 即時新聞（產業動態、法人買賣、個股消息） |
| 抓取方式 | Node.js Axios Script（支援分頁與延遲） |
| 更新頻率 | 即時 |

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，該腳本直接呼叫鉅亨網 API，比瀏覽器渲染更快速且穩定。

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

> 執行環境須可存取 `node_modules`（含所需依賴套件）。

1. **執行腳本**：`node fetch-cnyes/scripts/fetch_cnyes.mjs [outputPath]`
2. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `cnyes_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：指定輸出路徑
node fetch-cnyes/scripts/fetch_cnyes.mjs ./w-data-news/tw-stock-research/20260316/raw/cnyes.json

# 範例：無指定路徑，自動產生 cnyes_YYYYMMDD.json
node fetch-cnyes/scripts/fetch_cnyes.mjs
```

### 腳本邏輯摘要
- 使用 `axios` 呼叫鉅亨網官方 API (`https://api.cnyes.com/media/api/v1/newslist/category/tw_stock`)。
- API 請求帶有 `isCategoryHeadline: 1` 參數，僅抓取台股分類的頭條新聞（非全部新聞），實際回傳筆數可能少於 100 筆。
- 內建分頁邏輯，自動翻頁抓取最近 100 筆新聞（以 10 天為時間範圍）。
- 自動處理日期格式與連結。
- 輸出結構化 JSON。

---

## 輸出格式

**預設檔名**：`cnyes_YYYYMMDD.json`

成功：
```json
{
  "status": "success",
  "message": [
    {
      "time": "2026-02-05 07:45:00",
      "title": "台積電法說會釋正向展望 外資連三買",
      "link": "https://news.cnyes.com/news/id/..."
    }
  ]
}
```

錯誤：
```json
{
  "status": "error",
  "message": "Request failed with status code 503"
}
```

## 篩選標準

### 要抓（會影響股價）

- 法人買賣超報導
- 營收/財報相關新聞
- 產業趨勢重大變化
- 個股利多/利空消息
- 外資報告/目標價

### 跳過

- 純盤勢評論（大盤分析）
- 技術分析文章
- 一般產業介紹

## 個股識別（Agent 層級處理）

腳本輸出僅含 `time`、`title`、`link` 三個欄位，不包含股票代碼。
呼叫方 Agent 須自行從標題識別個股：
- 標題包含「(2330)」→ code: 2330
- 標題包含公司名稱 → 對應查詢代碼
- 無法識別時略過

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

若 10 次後仍失敗，才寫入錯誤並 exit 1。

### 2. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

## 快速執行

```bash
# 執行時須確保 `node_modules` 可存取
node fetch-cnyes/scripts/fetch_cnyes.mjs [outputPath]

# 範例
node fetch-cnyes/scripts/fetch_cnyes.mjs ./w-data-news/tw-stock-research/YYYYMMDD/raw/cnyes.json
```
