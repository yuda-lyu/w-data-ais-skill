---
name: tw-stock-research
description: 台股重大訊息調研技能。從 5 個來源（MOPS、鉅亨網、財報狗、MoneyDJ、Goodinfo）序列抓取近兩日（昨日+今日）重大訊息，篩選會影響股價的公告/新聞，並彙整報告。使用時機：(1) 需要查詢今日台股重大訊息、(2) 需要法人買賣超資料、(3) 需要個股公告/財報/訴訟/庫藏股等即時資訊、(4) 台股調研任務。
---

# 台股重大訊息調研

從 5 個來源**序列**抓取**近兩日（昨日+今日）**重大訊息，篩選會影響股價的公告/新聞。

## ⏰ 時間範圍

| 來源 | 抓取範圍 | 說明 |
|------|----------|------|
| MOPS | 昨日+今日 | API 支援帶日期參數 |
| 鉅亨網 | 昨日+今日 | 檢查新聞日期標記 |
| 財報狗 | 昨日+今日 | 超過兩天跳過 |
| MoneyDJ | 昨日+今日 | 檢查時間標記 |
| Goodinfo | 最新交易日 | 收盤後更新 |

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

## 快速執行

```
請執行台股調研任務（序列模式）：
1. 建立 tasks/stock-research/ 目錄
2. 序列派發 5 個 sub-agent（每個間隔 5 秒）
3. 等待全部完成
4. 讀取 raw/*.json 彙整 report_YYYYMMDD.md（YYYYMMDD = 執行當日）
```
