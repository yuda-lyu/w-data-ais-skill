---
name: tw-stock-post-market
description: 台股盤後總結技能。收盤後執行，比對盤前調研報告的利多/利空研判與實際漲跌表現，分析符合率與誤判原因，累積調研經驗。使用時機：(1) 盤後驗證調研準確度、(2) 檢討研判邏輯、(3) 累積調研經驗。
---

# 台股盤後總結

收盤後執行，驗證盤前調研報告的研判準確度，分析符合與誤判原因。

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
> ⚠️ 務必指定 `outputPath`，否則輸出檔案會寫入專案根目錄。調用方應傳入 `./w-data-news/tw-stock-post-market/YYYYMMDD/raw/trading_day.json`。

### 非交易日處理

若為非交易日，回報：
> 今日（YYYY/MM/DD）為台股非交易日，跳過盤後總結。

## ⏰ 執行時機

- **建議時間**：14:30 ~ 17:30（收盤後，法人資料更新後）
- **資料來源**：證交所收盤資料、櫃買中心收盤資料、官方三大法人買賣超

## 📦 資料來源與抓取技能

本技能透過調用專職抓取技能取得資料：

| 資料 | 抓取技能 | 說明 |
|------|----------|------|
| 開收盤價（上市） | `fetch-twse` | 證交所股票收盤資料（上市） |
| 開收盤價（上櫃） | `fetch-tpex` | 櫃買中心股票收盤資料（上櫃；若 fetch-twse 查無資料則改用） |
| 法人買賣超（逐檔） | `fetch-institutional-net-buy-sell` | 以 TWSE + TPEX 官方資料抓指定日期、指定代碼三大法人買賣超（外資/投信/自營/合計） |

> **技術細節**請參閱各抓取技能的 SKILL.md

## 輸入格式

須從盤前調研報告提取「個股影響總表」JSON 陣列：

```json
[
  {
    "code": "3481",
    "name": "群創",
    "impact": "利多",
    "reason": "法人買超 7.9 萬張（02/04），漲停 +9.79%"
  },
  {
    "code": "2409",
    "name": "友達",
    "impact": "利空",
    "reason": "鉅亨網報導外資調節"
  }
]
```

**欄位說明**：
- `code`：股票代碼
- `name`：股票名稱
- `impact`：`⬆️ 利多` / `⬇️ 利空` / `➖ 中性`（從盤前報告 Markdown 表格提取時含 emoji）
- `reason`：研判理由

## 執行流程

使用 `run_post_market.mjs` 一行完成所有步驟：

```bash
# 語法
node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [outputDir] [preMarketDir]

# 參數說明
# YYYYMMDD     (選填)：指定日期，預設為今日
# skillsDir    (選填)：技能庫根目錄（node_modules 所在位置），預設為 cwd
# outputDir    (選填)：盤後主輸出目錄（raw/ 與 error_log.jsonl 均置於此），
#                      預設為 <skillsDir>/w-data-news/tw-stock-post-market/<YYYYMMDD>
# preMarketDir (選填)：盤前調研輸出目錄（用於比對盤前研判），
#                      預設為 <skillsDir>/w-data-news/tw-stock-research/<YYYYMMDD>

# 範例：從技能庫根目錄執行（最常見）
node tw-stock-post-market/scripts/run_post_market.mjs 20260316

# 範例：從其他工作路徑執行，明確指定所有目錄
node /path/to/w-data-ais-skill/tw-stock-post-market/scripts/run_post_market.mjs \
     20260316 \
     /path/to/w-data-ais-skill \
     /path/to/output/tw-stock-post-market/20260316 \
     /path/to/output/tw-stock-research/20260316
```

`run_post_market.mjs` 自動執行以下流程：

```
run_post_market.mjs
  │
  ├─ 1. 交易日檢查（check-tw-trading-day）
  │     └─ 非交易日 → 印出提示並 exit 1，不繼續
  │
  ├─ 2. 建立輸出目錄 w-data-news/tw-stock-post-market/YYYYMMDD/raw/
  │
  ├─ 3. fetch-twse (all)        → raw/prices_twse.json
  ├─ 4. fetch-tpex (all)        → raw/prices_tpex.json
  ├─ 5. fetch-twse-t86 (all)    → raw/institutional_twse.json
  ├─ 6. fetch-tpex-3insti (all) → raw/institutional_tpex.json
  │
  └─ 7. generate_report.mjs     → report_YYYYMMDD.md
```

**容錯機制**：任一抓取步驟失敗時，錯誤自動記錄至 `error_log.jsonl`，**不中斷整體流程**，繼續執行下一步。報告產出失敗則 exit 2。

> ⚠️ 腳本執行時間約 **1~3 分鐘**。外層 exec 呼叫時請設定 **timeout ≥ 300000 ms（5 分鐘）**，避免 SIGTERM 中斷。

**完成訊號**：腳本成功產出報告後，會在 stdout 輸出 `POST_MARKET_COMPLETE=true`，接著立即 `process.exit(0)`。外層呼叫方可偵測此字串判斷執行成功，無需等待其他 I/O。

## 研判比對邏輯

| 盤前研判 | 實際表現 | 結果 |
|----------|----------|------|
| ⬆️ 利多 | 收盤 > 開盤 | ✅ 符合 |
| ⬆️ 利多 | 收盤 ≤ 開盤 | ❌ 誤判 |
| ⬇️ 利空 | 收盤 < 開盤 | ✅ 符合 |
| ⬇️ 利空 | 收盤 ≥ 開盤 | ❌ 誤判 |
| ➖ 中性 | 任何 | ➖ 不計入 |

## 輸出結構

```
w-data-news/tw-stock-post-market/
└── YYYYMMDD/
    ├── report_YYYYMMDD.md          # 盤後總結報告
    ├── error_log.jsonl             # 錯誤紀錄
    └── raw/
        ├── trading_day.json        # 交易日檢查結果
        ├── input.json              # （選填）手動準備的個股影響總表；不存在時自動 fallback 解析盤前 Markdown 報告
        ├── prices_twse.json        # fetch-twse all 全市場輸出（MI_INDEX 格式）
        ├── prices_tpex.json        # fetch-tpex all 全市場輸出（tables 格式）
        ├── institutional_twse.json # fetch-institutional-net-buy-sell TWSE T86 輸出
        └── institutional_tpex.json # fetch-institutional-net-buy-sell TPEX 3Insti 輸出
```

## 📝 錯誤紀錄機制

`run_post_market.mjs` 執行過程中遭遇的錯誤自動記錄至 `error_log.jsonl`，供未來排錯參考。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T07:30:00.000Z",
  "date": "20260205",
  "source": "fetch-twse",
  "phase": "fetch",
  "error": {
    "type": "timeout",
    "message": "執行逾時（>60s）",
    "details": ""
  },
  "resolution": "failed"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式（UTC，`Z` 結尾） |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 來源：fetch-twse / fetch-tpex / fetch-twse-t86 / fetch-tpex-3insti / generate_report |
| `phase` | ✅ | 階段：fetch / report |
| `error.type` | ✅ | 錯誤類型：timeout / unknown |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `error.details` | ❌ | 詳細錯誤內容（stderr 等） |
| `resolution` | ✅ | 固定為 `failed`（錯誤發生才寫入此 log） |

## 報告結構

```markdown
# 台股盤後總結報告（YYYY/MM/DD）

> 執行時間：YYYY-MM-DD HH:MM (台灣時間)
> 盤前調研：report_YYYYMMDD.md
> 資料來源：證交所、櫃買中心

---

## 📊 研判驗證總表

| 代碼 | 名稱 | 盤前研判 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |
|------|------|----------|------|------|-------|------------|------|
| 3481 | 群創 | ⬆️ 利多 | 21.5 | 23.0 | +6.98% | +78,960 | ✅ 符合 |
| 2409 | 友達 | ⬇️ 利空 | 18.2 | 17.8 | -2.20% | -5,230 | ✅ 符合 |
```

**提取規則**：
- 使用 `generate_report.mjs` 自動從盤前報告提取研判與收盤數據進行比對。
- 研判結果欄位自動計算：
  - ✅ 符合：利多且收>開，或利空且收<開
  - ❌ 誤判：方向相反
  - ➖ N/A：無數據或中性研判

---

## 📈 統計摘要

- 總計研判：X 檔
- ✅ 符合：Y 檔（XX%）
- ❌ 誤判：Z 檔（XX%）
- ➖ 中性：W 檔（不計入）

---

## ✅ 符合分析

### 1. 群創（3481）- 利多符合
- **盤前理由**：法人買超 7.9 萬張
- **實際表現**：收盤 +6.98%，法人持續買超
- **符合原因**：法人動向與股價走勢一致

---

## ❌ 誤判分析

### 1. XXX（XXXX）- 利多誤判
- **盤前理由**：...
- **實際表現**：...
- **誤判原因**：...（如：大盤拖累、消息面變化、法人反手等）

---

## 💡 後續建議

1. **強化因子**：...
2. **注意事項**：...
3. **調整方向**：...
```

## 誤判原因分類

常見誤判原因供分析參考：

| 類型 | 說明 |
|------|------|
| 大盤拖累 | 個股利多但大盤重挫 |
| 消息面變化 | 盤中出現新利空/利多消息 |
| 法人反手 | 法人動向與預期相反 |
| 獲利了結 | 連續上漲後回檔 |
| 利多出盡 | 好消息公布後反而下跌 |
| 預期落差 | 實際數據不如預期 |
| 籌碼面壓力 | 融資過高、大戶出貨 |

## 🔧 常見問題與排除

### 1. 抓取失敗 (Module not found)

**症狀**：
- 調用子技能 (`fetch-twse`, `fetch-tpex` 等) 時報錯 `Cannot find module`。

**解決方法**：
確保在工作區執行了所有子技能所需的依賴：
```bash
npm install axios cheerio puppeteer-core lodash-es
```

### 2. 找不到盤前報告

**症狀**：
- 盤後報告產出，但「研判驗證總表」為空，無任何個股資料。

**原因**：
- `generate_report.mjs` 找不到盤前報告時，`getPreMarketPredictions()` 靜默回傳空陣列，腳本仍正常 exit 0，`run_post_market.mjs` **不會**在 error_log 中記錄此狀況。

**解決方法**：
- 確認今日盤前調研是否已成功執行並產出報告。
- 確認盤前報告路徑是否為 `<preMarketDir>/report_YYYYMMDD.md`（預設為 `w-data-news/tw-stock-research/YYYYMMDD/report_YYYYMMDD.md`）。
- 若使用自訂 `preMarketDir`，請確認傳入的路徑與盤前調研的 `outputDir` 一致。

## 快速執行

### 推薦：使用主控腳本（一行完成）

```bash
# 從專案根目錄執行，自動依序執行所有步驟
npm install axios
node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [outputDir] [preMarketDir]

# 範例
node tw-stock-post-market/scripts/run_post_market.mjs 20260316
```

報告產出位置：`<outputDir>/report_YYYYMMDD.md`（預設為 `w-data-news/tw-stock-post-market/YYYYMMDD/report_YYYYMMDD.md`）

### 手動執行（各步驟分開）

```bash
# 1. 交易日檢查（須先建立輸出目錄）
mkdir -p ./w-data-news/tw-stock-post-market/YYYYMMDD/raw
node check-tw-trading-day/scripts/check_tw_trading_day.mjs YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/trading_day.json

# 2. 安裝依賴
npm install axios

# 3. 依序抓取（outputPath 必須為完整相對路徑）
node fetch-twse/scripts/fetch_twse.mjs                                             all YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/prices_twse.json
node fetch-tpex/scripts/fetch_tpex.mjs                                             all YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/prices_tpex.json
node fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs    all YYYYMMDD   ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/institutional_twse.json
node fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs all YYYYMMDD   ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/institutional_tpex.json

# 4. 產出報告
# 語法：node tw-stock-post-market/scripts/generate_report.mjs [YYYYMMDD] [outputDir] [preMarketDir]
node tw-stock-post-market/scripts/generate_report.mjs YYYYMMDD \
     ./w-data-news/tw-stock-post-market/YYYYMMDD \
     ./w-data-news/tw-stock-research/YYYYMMDD
```
