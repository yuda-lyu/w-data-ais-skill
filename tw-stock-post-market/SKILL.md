---
name: tw-stock-post-market
description: 台股盤後總結技能。收盤後執行，比對盤前調研報告的利多/利空研判與實際漲跌表現，分析符合率與誤判原因，累積調研經驗。使用時機：(1) 盤後驗證調研準確度、(2) 檢討研判邏輯、(3) 累積調研經驗。
---

# 台股盤後總結

收盤後執行，驗證盤前調研報告的研判準確度，分析符合與誤判原因。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需套件：`axios`

執行前請先驗證套件是否可用：
```bash
node -e "import('axios').then(() => console.log('deps OK'))"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install axios
```

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

- **建議時間**：15:00 ~ 17:30（法人買賣超資料每日 15:00 後更新，過早執行會取得空資料）
- **資料來源**：證交所收盤資料、櫃買中心收盤資料、官方三大法人買賣超

## 📦 資料來源與抓取技能

本技能透過調用專職抓取技能取得資料：

| 資料 | 抓取技能 | 說明 |
|------|----------|------|
| 開收盤價（上市） | `fetch-tw-data-stock` (TWSE) | 證交所股票收盤資料（上市） |
| 開收盤價（上櫃） | `fetch-tw-data-stock` (TPEX) | 櫃買中心股票收盤資料（上櫃；於 TWSE 抓取完成後序列執行） |
| 法人買賣超（逐檔） | `fetch-tw-data-institutional` | 以 TWSE + TPEX 官方資料抓指定日期、指定代碼三大法人買賣超（外資/投信/自營/合計） |

> **技術細節**請參閱各抓取技能的 SKILL.md

## 輸入格式

`generate_report.mjs` 直接讀取盤前調研 Markdown 報告（`tw-stock-research/<YYYYMMDD>/report_<YYYYMMDD>.md`），自動解析其中「個股影響總表」的利多/利空兩張表格。

**解析規則**：
- 段落標題模糊匹配：`### ⬆️ 利多（N 檔）` / `### ⬇️ 利空（N 檔）`（尾端檔數可有可無）
- 表格欄位（新版，5 欄）：`代碼 | 名稱 | 信心 | 法人動向 | 簡要理由`
- 表格欄位（舊版，3 欄，相容）：`代碼 | 名稱 | 簡要理由`
- `impact` 從段落標題推導（`⬆️ 利多` / `⬇️ 利空`）

**無需手動準備任何 JSON 輸入**；只要盤前調研已正常產出報告，盤後腳本即可自動讀取。

## 執行流程

使用 `run_post_market.mjs` 一行完成所有步驟：

```bash
# 語法
node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [baseOutputDir]

# 參數說明
# YYYYMMDD      (選填)：指定日期，預設為今日
# skillsDir     (選填)：技能腳本目錄（各子技能腳本所在位置），預設為 cwd
# baseOutputDir (選填)：資料輸出根目錄，腳本自動在此建立：
#                         tw-stock-post-market/<YYYYMMDD>/（盤後輸出）
#                         tw-stock-research/<YYYYMMDD>/   （讀取盤前報告）
#                       agent 調用時應顯式傳入；若省略僅作本地手動執行時的便利 fallback
#
# 實際輸出目錄：<baseOutputDir>/tw-stock-post-market/<YYYYMMDD>/
# 讀取盤前報告：<baseOutputDir>/tw-stock-research/<YYYYMMDD>/

# 範例：外部 agent 從任意工作目錄執行
node /path/to/skills-dir/tw-stock-post-market/scripts/run_post_market.mjs \
     20260316 \
     /path/to/skills-dir \
     /path/to/base-output-dir
```

> Agent 調用契約：
> - `skillsDir` 只用來定位技能腳本與依賴，不代表資料輸出位置
> - `baseOutputDir` 只用來存放資料輸出，不代表技能庫位置
> - `run_post_market.mjs` 與 `generate_report.mjs` 都接收 `baseOutputDir`
> - 腳本會自行推導：
>   - `<baseOutputDir>/tw-stock-post-market/YYYYMMDD/`
>   - `<baseOutputDir>/tw-stock-research/YYYYMMDD/`
> - 不要把 `./w-data-news/tw-stock-post-market/YYYYMMDD` 傳給任何一支 post-market 腳本作為 `baseOutputDir`

`run_post_market.mjs` 自動執行以下流程：

```
run_post_market.mjs
  │
  ├─ 1. 交易日檢查（check-tw-trading-day）
  │     └─ 非交易日 → 印出提示並 exit 1，不繼續
  │
  ├─ 2. 建立輸出目錄 w-data-news/tw-stock-post-market/YYYYMMDD/raw/
  │
  ├─ 3. fetch-tw-data-stock/twse (all)        → raw/prices_twse.json
  ├─ 4. fetch-tw-data-stock/tpex (all)        → raw/prices_tpex.json
  ├─ 5. fetch-tw-data-institutional/twse-t86 (all)    → raw/institutional_twse.json
  ├─ 6. fetch-tw-data-institutional/tpex-3insti (all) → raw/institutional_tpex.json
  │
  └─ 7. generate_report.mjs     → report_YYYYMMDD.md
```

**容錯機制**：任一抓取步驟失敗時，錯誤自動記錄至 `error_log.jsonl`，**不中斷整體流程**，繼續執行下一步。報告產出失敗則 exit 2。

> ⚠️ 腳本執行時間約 **1~3 分鐘**（最差情況 4 步各 60s + 報告 300s ≈ 9 分鐘）。外層 exec 呼叫時請設定 **timeout ≥ 600000 ms（10 分鐘）**，避免 SIGTERM 中斷。

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
        ├── prices_twse.json        # fetch-tw-data-stock (TWSE) all 全市場輸出（MI_INDEX 格式）
        ├── prices_tpex.json        # fetch-tw-data-stock (TPEX) all 全市場輸出（{ source, date, count, data } 格式）
        ├── institutional_twse.json # fetch-tw-data-institutional TWSE T86 輸出
        └── institutional_tpex.json # fetch-tw-data-institutional TPEX 3Insti 輸出
```

## 📝 錯誤紀錄機制

`run_post_market.mjs` 執行過程中遭遇的錯誤自動記錄至 `error_log.jsonl`，供未來排錯參考。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T07:30:00.000Z",
  "date": "20260205",
  "source": "fetch-tw-data-stock",
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

> 執行時間：YYYY/MM/DD HH:MM:SS（台灣時間）
> 盤前調研：report_YYYYMMDD.md
> 資料來源：證交所、櫃買中心

## 📊 研判驗證總表

### ⬆️ 利多

| 代碼 | 名稱 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |
|------|------|------|------|-------|------------|------|
| 3037 | 欣興 | 550 | 580 | +5.45% | +8,383,855 | ✅ 符合 |
| 2330 | 台積電 | 1900 | 1905 | +0.26% | +1,041,327 | ✅ 符合 |
| 2317 | 鴻海 | 212.5 | 210 | -1.18% | -33,899,575 | ❌ 誤判 |

### ⬇️ 利空

| 代碼 | 名稱 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |
|------|------|------|------|-------|------------|------|
| 3576 | 聯合再生 | 27.15 | 25.6 | -5.71% | -17,775,837 | ✅ 符合 |
| 6451 | 訊芯-KY | 263.5 | 279 | +5.88% | +952,436 | ❌ 誤判 |
```

**研判驗證總表規則**：
- 利多、利空分兩張子表，各自按「✅ 符合 → ❌ 誤判 → ❓ 無數據」排序。
- 結果欄判斷：✅ 符合（利多且收>開，或利空且收<開）、❌ 誤判（方向相反）、❓ 無數據（找不到收盤資料）。
- 法人買賣超欄來自當日三大法人官方資料（正值為買超，負值為賣超）。

```markdown
## 📈 統計摘要

- 總計研判：42 檔
- ✅ 符合：20 檔（48%）
- ❌ 誤判：22 檔（52%）
- ➖ 中性：0 檔（不計入）
- 利多準確率：14/29（48%）
- 利空準確率：6/13（46%）

## ✅ 符合分析

### 1. 欣興（3037）
- **盤前研判**：⬆️ 利多｜ABF 載板產業黃金周期可望延續至 2030 年...
- **實際表現**：開盤 550 → 收盤 580（+5.45%）；法人淨買超 8,383,855 股
- **符合依據**：強勢大漲 +5.45%，多頭走勢明確；法人同步買超 8,383,855 股，動向一致

（以下每一符合個股自動產出，格式同上）

## ❌ 誤判分析

### 1. 永擎（7711）
- **盤前研判**：⬆️ 利多｜輝達GTC背板股15台廠登板...
- **實際表現**：開盤 245 → 收盤 245（+0%）；法人淨買超 12,936 股
- **誤判分類**：收平（0%），量縮整理，利多未能帶動上漲

（以下每一誤判個股自動產出，格式同上）

## 📋 盤前預判機制分析

### 法人動向一致性

| 情境 | 符合/總計 | 準確率 |
|------|-----------|--------|
| 利多 + 法人買超（動向一致） | 11/15 | 73% |
| 利多 + 法人賣超（動向相反） | 3/14 | 21% |
| 利空 + 法人賣超（動向一致） | 4/6 | 67% |
| 利空 + 法人買超（動向相反） | 2/7 | 29% |

### 誤判模式分類

| 模式 | 次數 | 說明 |
|------|------|------|
| 收平 | 8 | 收平（0%），動能不足，利多/利空未帶動方向 |
| 小幅反向 | 7 | 小幅反向（±2% 以內），多空力道相近 |

### 💡 優化建議

1. **法人動向是強力確認因子**：...（依當日統計自動產出）
2. **收平誤判共 N 檔**：...（依當日統計自動產出）
```

**各段產出規則**：
- **符合分析 / 誤判分析**：自動產出全數個股，每筆含「盤前研判」、「實際表現」（開盤→收盤、漲跌%、法人淨買賣超股數）、「符合依據」或「誤判分類」（自動分類：大幅反向/明顯反向/小幅反向/收平/法人反向）。
- **盤前預判機制分析**：統計法人動向一致性、誤判模式分類，並依當日數據自動產出優化建議。
- **誤判分類門檻**（`INST_AMT_THRESHOLD = 50_000_000`，即法人淨買賣超金額達 5000 萬 NTD 視為明顯機構操作；金額 = 股數 × 收盤價，避免固定股數門檻對高低價股產生偏差）：
  - 大幅反向：±5% 以上
  - 明顯反向：±2~5%
  - 小幅反向：±2% 以內
  - 收平：0%
  - 法人反向：法人淨買賣超金額 ≥ 5000 萬 NTD 且方向與研判相反

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
- 調用子技能 (`fetch-tw-data-stock`, `fetch-tw-data-institutional` 等) 時報錯 `Cannot find module`。

**解決方法**：
確保在工作區執行了所有子技能所需的依賴：
```bash
npm install axios
```

> 盤後技能僅使用 `axios`（fetch-tw-data-stock / fetch-tw-data-institutional 均為純 Axios 腳本），**不需要** `cheerio` 或 `playwright`（那是盤前技能的依賴）。

### 2. 找不到盤前報告

**症狀**：
- 盤後報告產出，但「研判驗證總表」為空，無任何個股資料。

**原因**：
- `generate_report.mjs` 找不到盤前報告時，`getPreMarketPredictions()` 會在 `error_log` 中記錄 `file_not_found` 並回傳空陣列，腳本仍正常 exit 0。

**解決方法**：
- 確認今日盤前調研是否已成功執行並產出報告。
- 確認盤前報告路徑是否為 `<baseOutputDir>/tw-stock-research/YYYYMMDD/report_YYYYMMDD.md`。
- 若使用自訂 `baseOutputDir`，請確認與盤前調研使用的 `baseOutputDir` 一致。

## 快速執行

### 推薦：使用主控腳本（一行完成）

```bash
# 外部 agent 可從任意工作目錄執行；請顯式傳入 skillsDir 與 baseOutputDir
npm install axios
node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [baseOutputDir]

# 範例
node tw-stock-post-market/scripts/run_post_market.mjs 20260316
```

報告產出位置：`<baseOutputDir>/tw-stock-post-market/YYYYMMDD/report_YYYYMMDD.md`

### 手動執行（各步驟分開）

```bash
# 1. 交易日檢查（須先建立輸出目錄）
mkdir -p ./w-data-news/tw-stock-post-market/YYYYMMDD/raw   # Unix/Git Bash；PowerShell 請用 New-Item -ItemType Directory -Force -Path .\w-data-news\tw-stock-post-market\YYYYMMDD\raw
node check-tw-trading-day/scripts/check_tw_trading_day.mjs YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/trading_day.json

# 2. 安裝依賴
npm install axios

# 3. 依序抓取（outputPath 必須為完整相對路徑）
node fetch-tw-data-stock/scripts/fetch_twse_stock.mjs                                    all YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/prices_twse.json
node fetch-tw-data-stock/scripts/fetch_tpex_stock.mjs                                    all YYYYMMDD ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/prices_tpex.json
node fetch-tw-data-institutional/scripts/fetch_twse_t86.mjs    all YYYYMMDD   ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/institutional_twse.json
node fetch-tw-data-institutional/scripts/fetch_tpex_3insti.mjs all YYYYMMDD   ./w-data-news/tw-stock-post-market/YYYYMMDD/raw/institutional_tpex.json

# 4. 產出報告
# 語法：node tw-stock-post-market/scripts/generate_report.mjs [YYYYMMDD] [baseOutputDir]
# 注意：這裡的 baseOutputDir 是資料根目錄，腳本會自動補上 tw-stock-post-market/YYYYMMDD 與 tw-stock-research/YYYYMMDD
node tw-stock-post-market/scripts/generate_report.mjs YYYYMMDD \
     ./w-data-news
```
