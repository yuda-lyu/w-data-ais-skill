---
name: fetch-cnyes
description: 抓取鉅亨網（Anue）台股即時新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、產業新聞、法人動態等即時資訊。
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

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios`。

### 執行方式

1. **讀取腳本**：從技能目錄讀取 `scripts/fetch_cnyes.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本。
   - **可選參數**：指定輸出檔案路徑 `node fetch_cnyes.mjs [outputPath]`。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 與 `JSON_OUTPUT_END` 之間），若指定 outputPath 則會寫入檔案。

```bash
# 範例：輸出至 stdout
cp /path/to/skill/scripts/fetch_cnyes.mjs .
npm install axios
node fetch_cnyes.mjs

# 範例：輸出至檔案
node fetch_cnyes.mjs ./data/cnyes.json
```

### 腳本邏輯摘要
- 使用 `axios` 呼叫鉅亨網官方 API (`https://api.cnyes.com/media/api/v1/newslist/category/tw_stock`)。
- 內建分頁邏輯，自動翻頁抓取最近 100 筆新聞。
- 自動處理日期格式與連結。
- 輸出結構化 JSON。

---

## 輸出格式

```json
{
  "source": "cnyes",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "title": "台積電法說會釋正向展望 外資連三買",
      "url": "https://news.cnyes.com/news/id/...",
      "time": "今天 07:45",
      "code": "2330",
      "name": "台積電",
      "impact": "利多",
      "reason": "法說會正向展望"
    }
  ],
  "error": null
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

## 個股識別

從標題提取股票代碼和名稱：
- 標題包含「台積電」→ code: 2330
- 標題包含「(2330)」→ code: 2330
- 無法識別時 code 留空

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "cnyes",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "API request failed",
    "details": "HTTP 503 Service Unavailable"
  },
  "attempts": [
    {"action": "retry after 5s", "result": "failed"}
  ],
  "resolution": "failed",
  "notes": "API unstable"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 固定為 `cnyes` |
| `phase` | ✅ | 階段：fetch / parse |
| `error.type` | ✅ | network / timeout / parse / empty / blocked |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `attempts` | ❌ | 重試紀錄（選填） |
| `resolution` | ✅ | success / failed |


### 錯誤類型

| type | 說明 |
|------|------|
| `timeout` | 頁面載入逾時 |
| `browser` | 瀏覽器操作失敗 |
| `parse` | 內容解析失敗 |
| `empty` | 無法找到新聞列表 |
| `blocked` | 被網站封鎖 |

### 何時紀錄

1. HTTP 請求失敗 (Axios Error)
2. 回傳內容無法解析
3. 找不到預期的新聞結構
4. 重試嘗試

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios
```

## 快速執行

```
請使用 fetch-cnyes 技能抓取鉅亨網新聞（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_cnyes.mjs
3. 讀取並解析 JSON 輸出
```
