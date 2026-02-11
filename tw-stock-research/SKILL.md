---
name: tw-stock-research
description: 台股盤前調研技能。從 4 個來源（MOPS、鉅亨網、財報狗、MoneyDJ）序列抓取近兩日（昨日+今日）重大訊息，篩選會影響股價的公告/新聞，並彙整盤前報告。使用時機：(1) 需要查詢今日台股重大訊息、(2) 需要法人買賣超資料、(3) 需要個股公告/財報/訴訟/庫藏股等即時資訊、(4) 台股盤前調研任務。
---

# 台股盤前調研

從 4 個來源**序列**抓取**近兩日（昨日+今日）**重大訊息，篩選會影響股價的公告/新聞，產出**盤前調研報告**。

## 🚦 交易日檢查（必要）

執行前**必須先檢查當日是否為台股交易日**，若非交易日則跳過不執行。

### 檢查方式

使用證交所 API 檢查當日是否有交易資料：

```bash
# 檢查當日是否為交易日（以大盤指數為例）
curl -s "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=YYYYMMDD&type=IND" | jq '.stat'
# 回傳 "OK" = 交易日
# 回傳 "很抱歉..." = 非交易日
```

### 非交易日處理

若為非交易日，回報：
> 今日（YYYY/MM/DD）為台股非交易日，跳過盤前調研。

**常見非交易日**：
- 週六、週日
- 國定假日（春節、清明、端午、中秋、國慶、元旦等）
- 颱風假、臨時停市

## 📦 資料來源與抓取技能

本技能透過調用 4 個專職抓取技能取得資料：

| 來源 | 抓取技能 | 資料類型 | 時間範圍 |
|------|----------|----------|----------|
| MOPS | `fetch-mops` | 官方公告 | 昨日+今日 |
| 鉅亨網 | `fetch-cnyes` | 即時新聞 | 昨日+今日 |
| 財報狗 | `fetch-statementdog` | 產業分析 | 昨日+今日 |
| MoneyDJ | `fetch-moneydj` | 法說/營收 | 昨日+今日 |
| 法人買賣超（官方） | `fetch-institutional-net-buy-sell` | 三大法人買賣超（外資/投信/自營/合計）；可指定日期 | 指定日期（盤後建議用當日或前一交易日） |

> **技術細節**請參閱各抓取技能的 SKILL.md

## 執行模式

### 循序執行模式（推薦）

由當前 Agent **自行依序執行**各項抓取任務，不使用 `sessions_spawn` 派發子 Agent。

執行流程：

```
主控 Agent
  │
  ├─ 1. 執行 MOPS 抓取（參閱 fetch-mops 技能）
  │     └─ 產出 raw/mops.json
  │
  ├─ 2. 執行 鉅亨網 抓取（參閱 fetch-cnyes 技能）
  │     └─ 產出 raw/cnyes.json
  │
  ├─ 3. 執行 財報狗 抓取（參閱 fetch-statementdog 技能）
  │     └─ 產出 raw/statementdog.json
  │
  ├─ 4. 執行 MoneyDJ 抓取（參閱 fetch-moneydj 技能）
  │     └─ 產出 raw/moneydj.json
  │
  └─ 5. 執行 法人買賣超 抓取（參閱 fetch-institutional-net-buy-sell 技能）
        └─ 產出 raw/institutional.json
```

**注意事項**：
- 每個步驟間建議間隔 2-3 秒，避免過於頻繁的請求。
- 若某個來源抓取失敗，應記錄錯誤至 `error_log.jsonl`，並**繼續執行下一個來源**，不可中斷整個任務。
- 所有抓取完成後，再統一讀取 `raw/*.json` 進行彙整。

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
tw-stock-research/
└── YYYYMMDD/
    ├── report_YYYYMMDD.md      # 最終報告（依執行日期命名）
    ├── error_log.jsonl         # 錯誤紀錄
    └── raw/
        ├── mops.json
        ├── cnyes.json
        ├── statementdog.json
        ├── moneydj.json
        └── institutional.json
```

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的**所有錯誤**和**嘗試修復**都須記錄至 `error_log.jsonl`，供未來排錯和改進技能參考。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "goodinfo",
  "phase": "fetch",
  "error": {
    "type": "anti-bot",
    "message": "JavaScript redirect detected, page not loaded",
    "details": "setCookie('CLIENT_KEY', ...); window.location.replace(...)"
  },
  "attempts": [
    {
      "action": "wait 3s then navigate",
      "result": "failed",
      "message": "Still showing redirect page"
    },
    {
      "action": "wait 5s then navigate again",
      "result": "success",
      "message": "Page loaded, table visible"
    }
  ],
  "resolution": "success",
  "notes": "Goodinfo anti-bot requires 5s wait instead of 3s"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 來源：mops / cnyes / statementdog / moneydj / system |
| `phase` | ✅ | 階段：init / fetch / parse / report / push |
| `error.type` | ✅ | 錯誤類型：network / timeout / anti-bot / parse / quota / auth / unknown |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `error.details` | ❌ | 詳細錯誤內容（堆疊、回應內容等） |
| `attempts` | ❌ | 嘗試修復的紀錄（陣列） |
| `resolution` | ✅ | 最終結果：success / failed / skipped |
| `notes` | ❌ | 額外備註（供未來改進參考） |

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
  # 台股盤前調研報告（民國年/MM/DD）

  > 調研日期：昨日 (MM/DD) + 今日 (MM/DD)
  > 執行時間：YYYY-MM-DD HH:MM (台灣時間)
  > 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ
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

**影響標記（⚠️ 僅允許三種）**：
- ⬆️ 利多：正面消息，可能推升股價（HTML 可設紅色）
- ⬇️ 利空：負面消息，可能壓抑股價（HTML 可設綠色）
- ➖ 中性：影響不明確或需觀察

**輸出約束（必要）**：

- 個股影響總表的「影響」欄位**只能**輸出：`利多` / `利空` / `中性`。
- 若模型在草稿中產生其他詞（例如：`觀望` / `偏多` / `偏空` / `謹慎` / `保守` 等），一律映射為：`中性`。
  - 文字理由可以保留「觀望/偏多/偏空」等描述，但**分類必須是中性**。

- 個股影響總表的「代碼」欄位必須是**單一**證券代碼（例如 `3481`、`2409`、`6770`、`00940`）。
- 禁止把多檔股票/族群用 `/` 或 `、` 合併塞到代碼欄（例如 `群創/友達/力積電`）。
- 若是族群事件（例如面板/DRAM/航運），請拆成多列（每檔一列），或把族群敘述放到「重點摘要」段落，不得污染個股總表。

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

```
請執行台股盤前調研任務（循序模式）：
1. 檢查是否為交易日
2. 建立 tasks/stock-research/ 目錄
3. 安裝依賴：npm install axios cheerio puppeteer-core lodash-es
4. 依序執行 5 個抓取任務（由本 Agent 自行執行，不 spawn）：
   - fetch-mops (node fetch_mops.mjs)
   - fetch-cnyes (node fetch_cnyes.mjs)
   - fetch-statementdog (node fetch_statementdog.mjs)
   - fetch-moneydj (node fetch_moneydj.mjs)
   - fetch-institutional-net-buy-sell (node fetch_all.mjs)
5. 讀取 raw/*.json 彙整 report_YYYYMMDD.md（YYYYMMDD = 執行當日）
6. 推送至 GitHub
```
