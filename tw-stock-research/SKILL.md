---
name: tw-stock-research
description: 台股盤前調研技能。從 5 個來源（MOPS、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心法人）序列抓取近兩日（昨日+今日）重大訊息，篩選會影響股價的公告/新聞，並彙整盤前報告。使用時機：(1) 需要查詢今日台股重大訊息、(2) 需要法人買賣超資料、(3) 需要個股公告/財報/訴訟/庫藏股等即時資訊、(4) 台股盤前調研任務。
---

# 台股盤前調研

從 5 個來源**序列**抓取**近兩日（昨日+今日）**重大訊息，篩選會影響股價的公告/新聞，產出**盤前調研報告**。

## 🚦 交易日檢查（必要）

執行前**必須先檢查當日是否為台股交易日**，若非交易日則跳過不執行。

### 檢查方式

使用 `check-tw-trading-day` 技能：

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# TRADING_DAY=true  → 交易日，繼續執行
# TRADING_DAY=false → 非交易日，跳過
```

> 詳見 `check-tw-trading-day` 技能。
> ⚠️ 務必指定 `outputPath`，否則輸出檔案會寫入專案根目錄。調用方應傳入 `./w-data-news/tw-stock-research/YYYYMMDD/raw/trading_day.json`。

### 非交易日處理

若為非交易日，回報：
> 今日（YYYY/MM/DD）為台股非交易日，跳過盤前調研。

**常見非交易日**：
- 週六、週日
- 國定假日（春節、清明、端午、中秋、國慶、元旦等）
- 颱風假、臨時停市

## 📦 資料來源與抓取技能

本技能透過調用 5 個專職抓取技能取得資料：

| 來源 | 抓取技能 | 資料類型 | 時間範圍 |
|------|----------|----------|----------|
| MOPS | `fetch-mops` | 官方公告 | 昨日+今日 |
| 鉅亨網 | `fetch-cnyes` | 即時新聞 | 昨日+今日 |
| 財報狗 | `fetch-statementdog` | 產業分析 | 昨日+今日 |
| MoneyDJ | `fetch-moneydj` | 法說/營收 | 昨日+今日 |
| 法人買賣超（官方） | `fetch-institutional-net-buy-sell` | 三大法人買賣超（外資/投信/自營/合計）；可指定日期 | 昨日或前一交易日 |

> **技術細節**請參閱各抓取技能的 SKILL.md

## 執行模式

### ✅ 主控腳本模式（推薦）

使用 `run_research.mjs` 一行完成所有步驟，**不需要手動逐一執行各抓取腳本**：

```bash
# 語法
node tw-stock-research/scripts/run_research.mjs [YYYYMMDD] [skillsDir] [outputDir]

# 參數說明
# YYYYMMDD  (選填)：指定日期，預設為今日
# skillsDir (選填)：技能庫根目錄（node_modules 所在位置），預設為 cwd
# outputDir (選填)：主輸出目錄（raw/ 與 error_log.jsonl 均置於此），
#                   預設為 <skillsDir>/w-data-news/tw-stock-research/<YYYYMMDD>

# 範例：從技能庫根目錄執行（最常見）
node tw-stock-research/scripts/run_research.mjs 20260316

# 範例：從其他工作路徑執行，明確指定技能庫與輸出目錄
node /path/to/w-data-ais-skill/tw-stock-research/scripts/run_research.mjs \
     20260316 \
     /path/to/w-data-ais-skill \
     /path/to/output/tw-stock-research/20260316
```

`run_research.mjs` 自動執行以下流程：

```
run_research.mjs
  │
  ├─ 1. 交易日檢查（check-tw-trading-day）
  │     └─ 非交易日 → 印出提示並 exit 1，不繼續
  │
  ├─ 2. 建立輸出目錄 w-data-news/tw-stock-research/YYYYMMDD/raw/
  │
  ├─ 3. fetch-mops               → raw/mops.json
  ├─ 4. fetch-cnyes              → raw/cnyes.json
  ├─ 5. fetch-statementdog       → raw/statementdog.json
  ├─ 6. fetch-moneydj            → raw/moneydj.json        ⚠️ 最多 5 分鐘
  ├─ 7. fetch-twse-t86 (all, 前一交易日)     → raw/institutional_twse.json
  ├─ 8. fetch-tpex-3insti (all, 前一交易日)  → raw/institutional_tpex.json
  │
  └─ 9. generate_report.mjs      → report_YYYYMMDD.md
```

**容錯機制**：任一抓取步驟失敗時，錯誤自動記錄至 `error_log.jsonl`，**不中斷整體流程**，繼續執行下一步。報告產出失敗則 exit 2。

**法人資料往前偵測**：法人腳本（TWSE/TPEX）以前一工作日為起點，若 TWSE API 回傳無資料（公假日），自動往前推一個工作日，最多回溯 **30 個工作日**（可涵蓋農曆春節等長假）。

> ⚠️ 腳本執行時間約 **3~8 分鐘**（主要取決於 fetch-moneydj 的 50 頁爬取）。外層 exec 呼叫時請設定 **timeout ≥ 600000 ms（10 分鐘）**，避免 SIGTERM 中斷。

**完成訊號**：腳本成功產出報告後，會在 stdout 輸出 `RESEARCH_COMPLETE=true`，接著立即 `process.exit(0)`。外層呼叫方可偵測此字串判斷執行成功，無需等待其他 I/O。

### 手動逐步模式（除錯用）

需要單獨重跑某一來源時才使用，各腳本皆須從**專案根目錄**執行：

```bash
node fetch-mops/scripts/fetch_mops.mjs                                             ./w-data-news/tw-stock-research/YYYYMMDD/raw/mops.json
node fetch-cnyes/scripts/fetch_cnyes.mjs                                           ./w-data-news/tw-stock-research/YYYYMMDD/raw/cnyes.json
node fetch-statementdog/scripts/fetch_statementdog.mjs                             ./w-data-news/tw-stock-research/YYYYMMDD/raw/statementdog.json
node fetch-moneydj/scripts/fetch_moneydj.mjs                                       ./w-data-news/tw-stock-research/YYYYMMDD/raw/moneydj.json
node fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs    all PREV_YYYYMMDD   ./w-data-news/tw-stock-research/YYYYMMDD/raw/institutional_twse.json
node fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs all PREV_YYYYMMDD   ./w-data-news/tw-stock-research/YYYYMMDD/raw/institutional_tpex.json
node tw-stock-research/scripts/generate_report.mjs YYYYMMDD
```

> ⚠️ 新聞類腳本（mops/cnyes/statementdog/moneydj）只接受 `outputPath` 一個參數，**不接受日期**。法人類腳本（t86/3insti）參數順序為 `[all|code] [YYYYMMDD] [outputPath]`，日期須填**前一交易日**（`PREV_YYYYMMDD`），非當日——當日法人資料 15:00 後才有，盤前執行必填前一交易日。

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

## 輸出結構

```
w-data-news/tw-stock-research/
└── YYYYMMDD/
    ├── report_YYYYMMDD.md      # 最終報告（依執行日期命名）
    ├── error_log.jsonl         # 錯誤紀錄
    └── raw/
        ├── trading_day.json        # 交易日檢查結果
        ├── mops.json
        ├── cnyes.json
        ├── statementdog.json
        ├── moneydj.json
        ├── institutional_twse.json
        └── institutional_tpex.json
```

## 📝 錯誤紀錄機制

`run_research.mjs` 執行過程中遭遇的錯誤**自動**記錄至 `error_log.jsonl`，供未來排錯和改進技能參考。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T00:15:30.000Z",
  "date": "20260205",
  "source": "fetch-mops",
  "phase": "fetch",
  "error": {
    "type": "unknown",
    "message": "Puppeteer launch failed",
    "details": "Error: Failed to launch the browser process"
  },
  "resolution": "failed"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式（UTC，`Z` 結尾） |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 來源：fetch-mops / fetch-cnyes / fetch-statementdog / fetch-moneydj / fetch-twse-t86 / fetch-tpex-3insti / generate_report |
| `phase` | ✅ | 階段：fetch / report |
| `error.type` | ✅ | 錯誤類型：timeout / unknown |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `error.details` | ❌ | 詳細錯誤內容（stderr 等） |
| `resolution` | ✅ | 最終結果：固定為 `failed`（錯誤發生才寫入此 log） |

### 定期回顧

每週（或累積 10+ 筆錯誤後）應回顧 `error_log.jsonl`：
1. 分析常見錯誤模式
2. 更新相關抓取技能說明
3. 調整重試策略

## 報告檔名規則

- 檔名格式：`report_YYYYMMDD.md`（例如 `report_20260204.md`）
- YYYYMMDD 為**執行當日**日期（台灣時間）
- 每次執行產生獨立檔案，歷史報告皆保留
- 報告開頭須包含：
  ```markdown
  # 台股盤前調研報告（YYYY/MM/DD）

  > 調研日期：YYYYMMDD
  > 執行時間：YYYY/MM/DD HH:MM:SS (台灣時間)
  > 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心
  ```

## 報告結構

報告須包含以下章節（依序）：

### 1. 📊 個股影響總表（必要）

報告開頭須提供**個股影響總表**，彙整所有明顯會影響股價的個股，並標示法人動向與信心等級：

```markdown
## 📊 個股影響總表

### ⬆️ 利多（N 檔）

| 代碼 | 名稱 | 信心 | 法人動向 | 簡要理由 |
|------|------|------|----------|----------|
| 3037 | 欣興 | ★★★ | ✅買超 8,383,855 | ABF 載板黃金週期延續至 2030 年 |
| 2330 | 台積電 | ★★★ | ✅買超 182,880 | ⚠️前日已漲停｜台積電站回1900元... |
| 2485 | 兆赫 | ★☆☆ | ⚠️賣超 6,776,882 | 輝達點火「太空 AI」新戰場！... |

### ⬇️ 利空（N 檔）

| 代碼 | 名稱 | 信心 | 法人動向 | 簡要理由 |
|------|------|------|----------|----------|
| 2317 | 鴻海 | ★★★ | ✅賣超 68,732,297 | 獲利創新高、配息創紀錄，股價不漲反跌 |
| 1735 | 日勝化 | ★☆☆ | ⚠️買超 12,359 | 自結2月合併虧損1100萬元 |

> 信心說明：★★★ 法人方向一致｜★★☆ 無法人資料｜★☆☆ 法人方向相反（高風險）
```

**提取規則**：
- 使用 `generate_report.mjs` 中的 `generateImpactTable` 函式。
- 透過關鍵字評分掃描新聞標題（利多/利空各有關鍵字列表，score > 0 為利多，score < 0 為利空）。
- 利多新聞額外偵測負向關鍵字：`不漲反跌`、`反跌`、`利多出盡`、`股價不漲`。
- 法人確認欄位：透過 `buildInstMap()` 建立法人買賣超對照表，對每檔個股查詢前一交易日三大法人淨買賣超（股數）。
- **信心等級**：法人方向與研判一致 → ★★★；無法人資料 → ★★☆；法人方向相反 → ★☆☆。
- **前日已漲停警示**：利多個股且新聞理由含「漲停」時，自動在理由欄前加 `⚠️前日已漲停｜`（利多出盡風險提示）。
- 表格依信心等級降序排列（★★★ 在前）。
- 利多/利空分兩張子表輸出，各自獨立排序。
- 提取 4 碼股票代碼（括號法 + 名稱查找法，nameCodeMap 含法人資料 + MOPS + COMPANY_ALIASES）。

### 2. 後續章節

- 三大法人買賣超
- MOPS 重大公告
- 各來源新聞精選
- 投資決策重點

## 🔧 常見問題與排除

### 1. 執行錯誤 (Module not found)

**症狀**：
- `Cannot find module 'axios'`, `cheerio`, `puppeteer-core`

**解決方法**：
確保在工作區執行了所有依賴安裝：
```bash
npm install axios cheerio puppeteer-core lodash-es
```

### 2. 瀏覽器未找到

**症狀**：
- 腳本輸出 `Error: Browser not found.` (fetch-mops)

**解決方法**：
- 確認系統已安裝 Chrome/Chromium。
- 或手動修改腳本中的 `executablePath` 指向正確路徑。

## 快速執行

### 推薦：使用主控腳本（一行完成）

```bash
# 從專案根目錄執行，自動依序執行所有步驟
npm install axios cheerio puppeteer-core lodash-es
node tw-stock-research/scripts/run_research.mjs [YYYYMMDD] [skillsDir] [outputDir]

# 範例
node tw-stock-research/scripts/run_research.mjs 20260316
```

報告產出位置：`<outputDir>/report_YYYYMMDD.md`（預設為 `w-data-news/tw-stock-research/YYYYMMDD/report_YYYYMMDD.md`）

### 手動執行（各步驟分開）

```bash
# 1. 交易日檢查（須先建立輸出目錄）
mkdir -p ./w-data-news/tw-stock-research/YYYYMMDD/raw
node check-tw-trading-day/scripts/check_tw_trading_day.mjs YYYYMMDD ./w-data-news/tw-stock-research/YYYYMMDD/raw/trading_day.json

# 2. 安裝依賴
npm install axios cheerio puppeteer-core lodash-es

# 3. 依序抓取（outputPath 必須為完整相對路徑）
node fetch-mops/scripts/fetch_mops.mjs                                             ./w-data-news/tw-stock-research/YYYYMMDD/raw/mops.json
node fetch-cnyes/scripts/fetch_cnyes.mjs                                           ./w-data-news/tw-stock-research/YYYYMMDD/raw/cnyes.json
node fetch-statementdog/scripts/fetch_statementdog.mjs                             ./w-data-news/tw-stock-research/YYYYMMDD/raw/statementdog.json
node fetch-moneydj/scripts/fetch_moneydj.mjs                                       ./w-data-news/tw-stock-research/YYYYMMDD/raw/moneydj.json
node fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs    all PREV_YYYYMMDD   ./w-data-news/tw-stock-research/YYYYMMDD/raw/institutional_twse.json
node fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs all PREV_YYYYMMDD   ./w-data-news/tw-stock-research/YYYYMMDD/raw/institutional_tpex.json

# 4. 產出報告
# 語法：node tw-stock-research/scripts/generate_report.mjs [YYYYMMDD] [outputDir]
node tw-stock-research/scripts/generate_report.mjs YYYYMMDD ./w-data-news/tw-stock-research/YYYYMMDD
```
