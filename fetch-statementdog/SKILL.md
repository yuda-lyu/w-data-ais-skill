---
name: fetch-statementdog
description: 抓取財報狗（Statementdog）最新產業分析與個股新聞，回傳結構化 JSON。適用於台股調研、基本面分析、產業趨勢研究。
---

# 財報狗資料抓取

從財報狗抓取產業分析與個股新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://statementdog.com/news/latest |
| 資料類型 | 產業分析、個股基本面新聞 |
| 抓取方式 | Node.js Axios Script |
| 更新頻率 | 每日更新 |

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，該腳本直接呼叫財報狗最新新聞頁面，並使用 Cheerio 解析內容。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios cheerio`。

### 執行方式

> 須從**專案根目錄**（`node_modules` 所在位置）執行。

1. **安裝依賴**：`npm install axios cheerio`。
2. **執行腳本**：`node fetch-statementdog/scripts/fetch_statementdog.mjs [outputPath]`
3. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `statementdog_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：指定輸出路徑
node fetch-statementdog/scripts/fetch_statementdog.mjs ./w-data-news/tw-stock-research/20260316/raw/statementdog.json

# 範例：無指定路徑，自動產生 statementdog_YYYYMMDD.json
node fetch-statementdog/scripts/fetch_statementdog.mjs
```

### 腳本邏輯摘要
- 使用 `axios` 請求 `https://statementdog.com/news/latest`。
- 加入 User-Agent 偽裝以避免簡單的 Anti-bot 阻擋。
- 使用 `cheerio` 解析 HTML，提取新聞標題、連結與日期。
- 輸出結構化 JSON。

---

## 輸出格式

**預設檔名**：`statementdog_YYYYMMDD.json`

成功：
```json
{
  "status": "success",
  "message": [
    {
      "time": "2026-02-05",
      "title": "台積電 2024 Q4 財報分析：營收創高，毛利率維持",
      "link": "https://statementdog.com/news/..."
    }
  ]
}
```

錯誤：
```json
{
  "type": "error",
  "message": "connect ETIMEDOUT"
}
```

```json
{
  "type": "error",
  "message": "抓取到 0 筆新聞，可能是頁面結構改變或 selector 失效，請確認財報狗頁面是否正常。"
}
```

> ⚠️ 抓取到 0 筆新聞時視為錯誤（selector 可能失效），輸出 `type: error` 並 exit 1。

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

## 日期判斷（Agent 層級處理）

腳本本身不過濾日期，會抓取頁面所有文章。
呼叫方 Agent 須自行根據文章日期欄位（`time`）過濾：
- 超過兩天的文章略過
- 日期格式可能為：`2026-02-05`、`02/05`、`今天`

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

```bash
# 從專案根目錄執行
node fetch-statementdog/scripts/fetch_statementdog.mjs [outputPath]

# 範例
node fetch-statementdog/scripts/fetch_statementdog.mjs ./w-data-news/tw-stock-research/YYYYMMDD/raw/statementdog.json
```
