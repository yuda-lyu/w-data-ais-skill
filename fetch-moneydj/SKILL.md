---
name: fetch-moneydj
description: 抓取 MoneyDJ 理財網法說會與營收新聞（最新 50 頁），回傳結構化 JSON。適用於台股調研、法說會追蹤、營收公告分析。
---

# MoneyDJ 資料抓取

從 MoneyDJ 理財網抓取法說會與營收相關新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=mb06 |
| 資料類型 | 法說會、營收公告、產業新聞 |
| 抓取方式 | Node.js Axios Script（支援分頁與延遲） |
| 更新頻率 | 即時 |

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，支持分頁與延遲，穩定性較高。

**⚠️ 注意事項：**
由於腳本需抓取 50 頁且包含 Anti-bot 延遲機制，執行時間約需 **1.5 ~ 3 分鐘**。
調用 `exec` 執行此腳本時，**必須設定足夠的逾時時間 (timeout)** 或使用 **背景執行 (background)**，避免 Process 被提早 Kill。

### 執行方式

> 須從**專案根目錄**（`node_modules` 所在位置）執行。
> ⚠️ 執行約需 **1.5 ~ 3 分鐘**（50 頁 + 隨機延遲），請確保逾時設定 ≥ 300000 ms 或使用背景執行。

1. **安裝依賴**：`npm install axios cheerio`。
2. **執行腳本**：`node fetch-moneydj/scripts/fetch_moneydj.mjs [outputPath]`
3. **解析輸出**：腳本執行完畢後，結果**一律寫入檔案**（若指定 outputPath 則使用該路徑，否則自動產生 `moneydj_YYYYMMDD.json`）。無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得資料，勿依賴 stdout。

```bash
# 範例：指定輸出路徑
node fetch-moneydj/scripts/fetch_moneydj.mjs ./w-data-news/tw-stock-research/20260316/raw/moneydj.json

# 範例：無指定路徑，自動產生 moneydj_YYYYMMDD.json
node fetch-moneydj/scripts/fetch_moneydj.mjs
```

### 腳本邏輯摘要
- 使用 `axios` 發送 HTTP GET 請求。
- 加入 User-Agent 偽裝以避免簡單的 Anti-bot 阻擋。
- 支援 `mb06` (台股新聞) 分頁抓取（預設抓取 50 頁）。
- 加入隨機延遲 (1-3秒) 避免請求過快。
- 使用 cheerio CSS selector（`$('tr')` 逐行遍歷）解析 HTML 提取新聞標題、時間與連結。
- 輸出結構化 JSON。

---

## 輸出格式

**預設檔名**：`moneydj_YYYYMMDD.json`

成功：
```json
{
  "status": "success",
  "message": [
    {
      "time": "02/05 08:30",
      "title": "台積電法說會：2025 年資本支出上看 320 億美元",
      "link": "https://www.moneydj.com/kmdj/news/..."
    }
  ]
}
```

錯誤：
```json
{
  "status": "error",
  "message": "Access denied (403)"
}
```

0 筆偵測（selector 失效）：
```json
{
  "status": "error",
  "message": "抓取到 0 筆新聞，可能是頁面結構改變或 selector 失效，請確認 MoneyDJ 頁面是否正常。"
}
```

> ⚠️ 抓取到 0 筆新聞時視為錯誤（selector 可能失效），輸出 `status: error` 並 exit 1。

## 篩選標準

### 要抓（會影響股價）

- 法說會內容/展望
- 營收公告
- 獲利預估調整
- 產業重大變化
- 外資報告

### 跳過

- 一般市場評論
- 技術分析
- 超過兩天的舊聞

## 時間標記解析

MoneyDJ 時間格式：
- `08:30` = 今天 08:30
- `昨 15:00` = 昨天 15:00
- `02/04 08:30` = 02月04日 08:30

## 🔧 常見問題與排除

### 1. 伺服器錯誤（502/503 等 5xx）

腳本內建**自動重試機制**（最多 10 次），遇到 HTTP 5xx 或網路錯誤時會自動等待後重試：

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
- `Cannot find module 'axios'` 或 `cheerio`

**解決方法**：
確保在工作區執行了依賴安裝：
```bash
npm install axios cheerio
```

## 快速執行

```bash
# 從專案根目錄執行（背景執行避免逾時）
node fetch-moneydj/scripts/fetch_moneydj.mjs [outputPath]

# 範例
node fetch-moneydj/scripts/fetch_moneydj.mjs ./w-data-news/tw-stock-research/YYYYMMDD/raw/moneydj.json
```
