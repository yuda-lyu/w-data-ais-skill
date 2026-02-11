---
name: fetch-statementdog
description: 抓取財報狗（Statementdog）產業分析與個股新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、基本面分析、產業趨勢研究。
---

# 財報狗資料抓取

從財報狗抓取產業分析與個股新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://statementdog.com/news |
| 資料類型 | 產業分析、個股基本面新聞 |
| 抓取方式 | Node.js Axios Script |
| 更新頻率 | 每日更新 |

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，該腳本直接呼叫財報狗最新新聞頁面，並使用 Cheerio 解析內容。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios cheerio`。

### 執行方式

1. **讀取腳本**：從技能目錄讀取 `scripts/fetch_statementdog.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本。
   - **可選參數**：指定輸出檔案路徑 `node fetch_statementdog.mjs [outputPath]`。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 與 `JSON_OUTPUT_END` 之間），若指定 outputPath 則會寫入檔案。

```bash
# 範例：輸出至 stdout
cp /path/to/skill/scripts/fetch_statementdog.mjs .
npm install axios cheerio
node fetch_statementdog.mjs

# 範例：輸出至檔案
node fetch_statementdog.mjs ./data/statementdog.json
```

### 腳本邏輯摘要
- 使用 `axios` 請求 `https://statementdog.com/news/latest`。
- 加入 User-Agent 偽裝以避免簡單的 Anti-bot 阻擋。
- 使用 `cheerio` 解析 HTML，提取新聞標題、連結與日期。
- 輸出結構化 JSON。

---

## 輸出格式

```json
[
  {
    "time": "2026-02-05",
    "title": "台積電 2024 Q4 財報分析：營收創高，毛利率維持",
    "link": "https://statementdog.com/news/..."
  }
]
```

## 篩選標準

### 要抓（會影響股價）

- 財報分析（季報、年報）
- 營收追蹤
- 產業趨勢重大變化
- 個股基本面變化

### 跳過

- 教學文章
- 一般知識介紹
- 超過兩天的舊聞

## 日期判斷

- 檢查文章日期標記
- 超過兩天的文章跳過
- 日期格式可能為：`2026-02-05`、`02/05`、`今天`

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄規則
當 Node.js 腳本執行失敗（Exit Code != 0）或標準錯誤輸出（stderr）包含錯誤訊息時，Agent 應捕捉錯誤並寫入 Log。

### 紀錄格式 (JSONL)

每行一筆 JSON，追加寫入：

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "statementdog",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "Axios request failed",
    "details": "Error: connect ETIMEDOUT"
  },
  "resolution": "failed"
}
```

### 常見錯誤類型 (type)

| type | 說明 | 觸發場景 |
|---|---|---|
| `network` | 網路錯誤 | HTTP 狀態碼非 200、連線逾時 |
| `selector` | 解析錯誤 | HTML 結構變更，Cheerio 找不到對應 Class/ID |
| `io` | 存檔錯誤 | 指定的 `outputPath` 無法寫入 |

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'` 或 `cheerio`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios cheerio
```

## 快速執行

```
請使用 fetch-statementdog 技能抓取財報狗新聞（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_statementdog.mjs [outputPath]
3. 讀取並解析 JSON 輸出
```
