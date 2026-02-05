---
name: tw-stock-research
description: 台股盤前調研技能。從 5 個來源（MOPS、鉅亨網、財報狗、MoneyDJ、Goodinfo）序列抓取近兩日（昨日+今日）重大訊息，篩選會影響股價的公告/新聞，並彙整盤前報告。使用時機：(1) 需要查詢今日台股重大訊息、(2) 需要法人買賣超資料、(3) 需要個股公告/財報/訴訟/庫藏股等即時資訊、(4) 台股盤前調研任務。
---

# 台股盤前調研

從 5 個來源**序列**抓取**近兩日（昨日+今日）**重大訊息，篩選會影響股價的公告/新聞，產出**盤前調研報告**。

## ⏰ 時間範圍

| 來源 | 抓取範圍 | 說明 |
|------|----------|------|
| MOPS | 昨日+今日 | API 支援帶日期參數 |
| 鉅亨網 | 昨日+今日 | 檢查新聞日期標記 |
| 財報狗 | 昨日+今日 | 超過兩天跳過 |
| MoneyDJ | 昨日+今日 | 檢查時間標記 |
| Goodinfo | 前一交易日 | 盤前抓取用，顯示前一交易日法人買賣超資料 |

## 資料來源

| 來源 | 網址 | 資料類型 | 抓取方式 |
|------|------|----------|----------|
| MOPS | mops.twse.com.tw | 官方公告 | browser evaluate + API |
| 鉅亨網 | news.cnyes.com | 即時新聞 | browser evaluate（JS 渲染）|
| 財報狗 | statementdog.com/news | 產業分析 | web_fetch |
| MoneyDJ | moneydj.com | 法說/營收 | web_fetch |
| Goodinfo | goodinfo.tw | 法人籌碼 | browser evaluate |

## 篩選標準

### 要抓（會影響股價）
- 營收公告、財報、股利分派
- 庫藏股買回、減資、現增
- 併購、處分資產、重大合約
- 訴訟、仲裁結果、罰鍰
- 駭客攻擊、資安事件
- 澄清媒體報導
- 法人買賣超異常

### 跳過（例行公告）
- 更名公告
- 背書保證、資金貸與
- 董事會/股東會召開通知
- 發言人/主管異動
- 純盤勢評論

## 📚 研判經驗（持續累積）

> 此區根據盤後總結報告的驗證結果，持續更新研判經驗。

### ✅ 高準確度利多訊號
| 類型 | 說明 | 驗證案例 |
|------|------|----------|
| 法人大買 | 三大法人單日買超 > 1 萬張 | 燿華 +7.79%（02/04） |
| 營收創高 | 單月營收創歷史新高 | 亞德客 +1.26%（02/04） |
| 訴訟勝訴 | 專利/商業訴訟勝訴 | 保瑞 +0.17%（02/04） |
| 主動維權 | 對外提起專利侵權訴訟 | 億光 +1.77%（02/04） |

### ⚠️ 需降級為中性的利空
| 類型 | 判斷標準 | 原因 |
|------|----------|------|
| 小額罰鍰 | 罰鍰 < 500 萬或 < 市值 0.01% | 對大型公司影響微乎其微（國泰金 120 萬罰鍰，股價反漲） |
| 輕微資安 | 無營運中斷、無資料外洩 | 市場反應冷淡（驊陞資安事件，股價反漲） |
| 訴訟未揭露 | 訴訟金額/內容未詳細揭露 | 市場無法評估影響（強茂訴訟，股價反漲） |

### 🔍 研判注意事項
1. **大盤因子**：大盤上漲日，個股利空容易被稀釋
2. **利空延後反映**：部分利空可能 T+1~T+3 才反映
3. **消息提前反映**：重大利多/利空可能已在前日股價反映
4. **法人動向優先**：法人買賣超是最可靠的短期指標

### 📊 歷史驗證統計
| 日期 | 總研判 | 符合 | 誤判 | 符合率 |
|------|--------|------|------|--------|
| 115/02/04 | 10 | 7 | 3 | 77.8% |

## 執行模式

### 序列模式（推薦）

使用 `sessions_spawn` **一次派發 1 個** sub-agent，間隔 5 秒：

```
主控 Agent
  ├─ spawn → MOPS agent → 等待完成
  │     ↓ sleep 5s
  ├─ spawn → 鉅亨網 agent → 等待完成
  │     ↓ sleep 5s
  ├─ spawn → 財報狗 agent → 等待完成
  │     ↓ sleep 5s
  ├─ spawn → MoneyDJ agent → 等待完成
  │     ↓ sleep 5s
  └─ spawn → Goodinfo agent → 等待完成
       ↓
  彙整報告
```

**為什麼用序列模式？**
- 避免同時 spawn 多個撞到 quota 限制
- 讓 OpenClaw cooldown 機制自動輪換 auth profile
- 6 個 Google Antigravity 帳號自動負載均衡

### 並行模式（風險：可能撞 quota）

同時派發 5 個 sub-agent，可能觸發 429 錯誤。

## Sub-Agent 任務指令

見 `references/subagent-tasks.md`

## MOPS API（關鍵）

MOPS 是 Vue SPA，必須用 browser evaluate 呼叫內部 API：

```javascript
// 取得公告列表（用 IIFE 格式）
(async () => {
  const r = await fetch('https://mops.twse.com.tw/mops/api/home_page/t05sr01_1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: '0', marketKind: '' })
  });
  return r.json();
})()
```

## Goodinfo 表格抓取

**標題日期格式**：`Goodinfo 三大法人買賣超（YYY/MM/DD）`（民國年/月/日，避免跨年顯示不清）

```javascript
// 抓取法人買超 Top 10
[...document.querySelectorAll('#divStockList tr')]
  .slice(2, 12)
  .map(r => [...r.querySelectorAll('td')].map(c => c.innerText.trim()).join('|'))
  .join('\n')
```

## 輸出結構

```
tasks/stock-research/
├── progress.json           # 進度追蹤
├── report_YYYYMMDD.md      # 最終報告（依執行日期命名，如 report_20260204.md）
└── raw/
    ├── mops/*.json
    ├── cnyes/*.json
    ├── statementdog/*.json
    ├── moneydj/*.json
    └── goodinfo/*.json
```

## 報告檔名規則

- 檔名格式：`report_YYYYMMDD.md`（例如 `report_20260204.md`）
- YYYYMMDD 為**執行當日**日期（台灣時間）
- 每次執行產生獨立檔案，歷史報告皆保留
- 報告開頭須包含：
  ```markdown
  # 台股調研報告（民國年/MM/DD）

  > 調研日期：昨日 (MM/DD) + 今日 (MM/DD)
  > 執行時間：YYYY-MM-DD HH:MM (台灣時間)
  > 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、Goodinfo
  ```

## 報告結構

報告須包含以下章節（依序）：

### 1. 📊 個股影響總表（必要）

報告開頭須提供**個股影響總表**，彙整所有明顯會影響股價的個股：

```markdown
## 📊 個股影響總表

| 代碼 | 名稱 | 影響 | 簡要理由 |
|------|------|------|----------|
| 6472 | 保瑞 | ⬆️ 利多 | 專利訴訟勝訴，學名藥可上市 |
| 2882 | 國泰金 | ⬇️ 利空 | 子公司違規遭罰 120 萬 |
| 3296 | 勝德 | ⬇️ 利空 | 資安事件，系統遭駭客攻擊 |
| 2367 | 燿華 | ⬆️ 利多 | 法人大買 3 萬張，低軌衛星題材 |
```

**影響標記**：
- ⬆️ 利多：正面消息，可能推升股價（HTML 可設紅色）
- ⬇️ 利空：負面消息，可能壓抑股價（HTML 可設綠色）
- ➖ 中性：影響不明確或需觀察

### 2. 後續章節

- 三大法人買賣超
- MOPS 重大公告
- 各來源新聞精選
- 投資決策重點

## 快速執行

```
請執行台股調研任務（序列模式）：
1. 建立 tasks/stock-research/ 目錄
2. 序列派發 5 個 sub-agent（每個間隔 5 秒）
3. 等待全部完成
4. 讀取 raw/*.json 彙整 report_YYYYMMDD.md（YYYYMMDD = 執行當日）
```
