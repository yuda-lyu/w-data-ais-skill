---
name: fetch-moneydj
description: 抓取 MoneyDJ 理財網法說會與營收新聞。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、法說會追蹤、營收公告分析。
---

# MoneyDJ 資料抓取

從 MoneyDJ 理財網抓取法說會與營收相關新聞。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=MB06 |
| 資料類型 | 法說會、營收公告、產業新聞 |
| 抓取方式 | Node.js Axios Script（支援分頁與延遲） |
| 更新頻率 | 即時 |

## 最佳實踐：使用 Axios Script（推薦）

建議使用本技能附帶的 Node.js 腳本進行抓取，支持分頁與延遲，穩定性較高。

### 前置需求
1. 確保環境已安裝 Node.js。
2. 在工作區安裝依賴：`npm install axios cheerio`。

### 執行方式

1. **讀取腳本**：從技能目錄讀取 `scripts/fetch_moneydj.mjs`。
2. **執行腳本**：使用 `node` 執行該腳本。
3. **解析輸出**：腳本會將結果以 JSON 格式輸出（包在 `JSON_OUTPUT_START` 與 `JSON_OUTPUT_END` 之間）。

```bash
# 範例
cp /path/to/skill/scripts/fetch_moneydj.mjs .
npm install axios cheerio
node fetch_moneydj.mjs
```

### 腳本邏輯摘要
- 使用 `axios` 發送 HTTP GET 請求。
- 加入 User-Agent 偽裝以避免簡單的 Anti-bot 阻擋。
- 支援 `mb06` (台股新聞) 分頁抓取（預設抓取 50 頁）。
- 加入隨機延遲 (1-3秒) 避免請求過快。
- 使用 Regex 解析 HTML 提取新聞標題、時間與連結。
- 輸出結構化 JSON。

---

## 技術說明（Legacy）

舊版可使用 `web_fetch` 抓取單頁靜態 HTML，但缺乏自動化能力。建議優先使用上述 JS 腳本，以獲得更好的穩定性與自動分頁功能。

## 輸出格式

```json
{
  "source": "moneydj",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "title": "台積電法說會：2025 年資本支出上看 320 億美元",
      "url": "https://www.moneydj.com/kmdj/news/...",
      "time": "08:30",
      "date": "2026-02-05",
      "code": "2330",
      "name": "台積電",
      "impact": "利多",
      "reason": "資本支出擴大，展望正向"
    }
  ],
  "error": null
}
```

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
- `02/04` = 02月04日

## 錯誤處理

```json
{
  "source": "moneydj",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "network",
    "message": "Failed to fetch page",
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
  "source": "moneydj",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "Connection refused",
    "details": "ECONNREFUSED on moneydj.com"
  },
  "attempts": [
    {"action": "retry after 10s", "result": "success"}
  ],
  "resolution": "success",
  "notes": ""
}
```

### 錯誤類型

| type | 說明 |
|------|------|
| `network` | 網路連線失敗 |
| `timeout` | 請求逾時 |
| `parse` | 內容解析失敗 |
| `empty` | 無新聞內容 |
| `blocked` | 被網站封鎖 |

### 何時紀錄

1. web_fetch 請求失敗
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
請使用 fetch-moneydj 技能抓取 MoneyDJ 新聞（使用 Axios 腳本）：
1. 確保 npm 依賴已安裝
2. 執行 scripts/fetch_moneydj.mjs
3. 讀取並解析 JSON 輸出
```
