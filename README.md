# w-data-ais-skill — AI Agent 共享技能庫

可重複使用的 AI Agent 技能模組庫，支援多 agent 共用同一技能庫。
每個技能包含 `SKILL.md` 說明文件與可選的 `scripts/` 腳本或 `references/` 參考資料。

## 技能總覽（24 個）

| 分類 | 技能數 |
|------|:------:|
| [開發工作流](#開發工作流類) | 1 |
| [綜合分析](#綜合分析類) | 2 |
| [Multi-Agent 協作](#multi-agent-協作類) | 5 |
| [網頁抓取](#網頁抓取類) | 1 |
| [台股數據抓取](#台股數據抓取類) | 4 |
| [台股新聞抓取](#台股新聞抓取類) | 4 |
| [AI / 科技新聞](#ai--科技新聞類) | 4 |
| [交易日檢查](#交易日檢查) | 1 |
| [通知與儲存](#通知與儲存類) | 2 |

---

## 開發工作流類

| 技能 | 說明 | 前置需求 |
|------|------|----------|
| `do-loop` | 自主循環開發：以 Planner→Executor→Auditor 三角色驅動完整開發迴圈，持久化 `state.json` 支援跨 session 斷點續接 | 無（純工作流協議） |

- 三角色迴圈：規劃（拆解任務 + 驗收條件）→ 執行（逐一實作）→ 審計（品質檢查）→ 修正（若未通過）→ 結案
- 6 個中止條件：成功結案、需求不明、技術阻塞、單任務修正 ≥ 3 次、整體迴圈 > 5 輪、使用者中斷
- 斷點續接：每步寫入 `state.json`，中斷後下次 session 自動從斷點恢復
- 資料夾可指定，預設 `.do-loop/`

### 使用方式

```bash
# 全新開發（狀態存入預設 .do-loop/）
請依照 do-loop 為「新增 XXX 功能」進行開發

# 指定資料夾
請依照 do-loop 為「新增 XXX 功能」進行開發，資料夾 ./my-loop

# 斷點續接
請依照 do-loop 繼續開發
```

---

## 綜合分析類

| 技能 | 說明 | 主要腳本 | 依賴 | 執行時間 |
|------|------|----------|------|----------|
| `tw-stock-research` | 台股盤前調研：整合 MOPS、鉅亨網、財報狗、MoneyDJ、三大法人、收盤 OHLC、期貨、融資融券共 8 來源，產出盤前報告 | `run_research.mjs` | `axios` `cheerio` `playwright` | 3~8 分鐘 |
| `tw-stock-post-market` | 台股盤後總結：抓取收盤價與法人資料，比對盤前研判準確度，累積調研經驗 | `run_post_market.mjs` | `axios` | 1~3 分鐘 |

### 主控腳本用法

```bash
# 盤前調研（一行完成所有步驟）
node tw-stock-research/scripts/run_research.mjs [YYYYMMDD] [skillsDir] [baseOutputDir]

# 盤後總結（一行完成所有步驟）
node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [baseOutputDir]

# 單獨產生盤前報告（僅在 raw 資料已備妥時使用）
node tw-stock-research/scripts/generate_report.mjs [YYYYMMDD] [baseOutputDir]

# 單獨產生盤後報告（僅在 raw 資料已備妥時使用）
node tw-stock-post-market/scripts/generate_report.mjs [YYYYMMDD] [baseOutputDir]
```

- 容錯機制：任一抓取步驟失敗自動記錄至 `error_log.jsonl`，不中斷整體流程
- 完成訊號：`RESEARCH_COMPLETE=true` / `POST_MARKET_COMPLETE=true`（stdout）
- `skillsDir` 只負責定位技能腳本與依賴；`baseOutputDir` 只負責存放資料輸出，兩者應由調用方明確傳入
- 四支入口腳本都接收 `baseOutputDir`，並在內部自動推導 `tw-stock-research/YYYYMMDD/`、`tw-stock-post-market/YYYYMMDD/` 與 `raw/`
- `baseOutputDir` 應傳入資料根目錄，例如 `./w-data-news`，不要傳入已含最終子目錄的路徑

---

## Multi-Agent 協作類

| 技能 | 說明 | 前置需求 |
|------|------|----------|
| `dispatch-cli` | 通用 CLI 子進程執行器（核心層），提供超時控制、進程樹清理、輸出驗證、結構化錯誤回報與自動重試，供其他 dispatch 技能調用 | Node.js ≥ 18（無 npm 依賴） |
| `dispatch-claude` | 以 Claude Code CLI (`claude -p`) 作為獨立 agent 驅動，支援 `--allowedTools` 細粒度工具控制與 `--max-budget-usd` 預算限制 | `npm install -g @anthropic-ai/claude-code` |
| `dispatch-codex` | 以 OpenAI Codex CLI (`codex exec`) 作為獨立 agent 驅動，需啟用沙箱網路 | `npm install -g @openai/codex` |
| `dispatch-gemini` | 以 Google Gemini CLI (`gemini`) 作為獨立 agent 驅動，預設可連網 | `npm install -g @google/gemini-cli` |
| `dispatch-opencode` | 以 OpenCode CLI (`opencode run`) 作為獨立 agent 驅動，支援多 provider/model（GPT、Claude、Gemini、Nemotron 等），含免費模型 | `npm install -g opencode-ai` |

- `dispatch-cli` 為核心調用層，提供 `run_cli.mjs` 腳本（非同步+自動重試），其餘 4 項技能透過它執行
- 調度 AI 與被派遣 agent 以背景方式平行執行，各自寫入不同輸出檔案後再彙整

---

## 網頁抓取類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-web` | 通用網頁抓取，四階段自動升級：curl → Playwright 無頭 → Playwright 有頭 → Playwright 有頭+新分頁，統一由 Readability 解析文章主體 | `fetch_web.mjs`, `fetchWeb.mjs` | `@mozilla/readability`, `jsdom`, `playwright` |

### 參數格式

```bash
node fetch-web/scripts/fetch_web.mjs <url> [outputPath] [--method=curl|playwright|playwright-headed]
```

- 預設自動升級：curl 被擋（403/CAPTCHA）→ Playwright 無頭 → Playwright 有頭 → Playwright 有頭+新分頁
- 可用 `--method` 強制指定方法，跳過階梯升級
- Playwright 使用系統 Chrome（`channel: 'chrome'`），不需額外下載 Chromium

---

## 台股數據抓取類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-tw-data-stock` | 抓取收盤 OHLC 資料（上市 TWSE + 上櫃 TPEX） | `fetch_twse_stock.mjs`, `fetch_tpex_stock.mjs` | `axios` |
| `fetch-tw-data-futures` | 抓取期交所台指期行情、法人未平倉、P/C Ratio | `fetch_taifex.mjs` | `axios` |
| `fetch-tw-data-margin` | 抓取融資融券餘額（上市 + 上櫃） | `fetch_twse_margin.mjs`, `fetch_tpex_margin.mjs` | `axios` |
| `fetch-tw-data-institutional` | 抓取三大法人買賣超（官方 TWSE T86 + TPEX 3Insti） | `fetch_twse_t86.mjs`, `fetch_tpex_3insti.mjs` | `axios` |

### 參數格式

| 技能 | 參數格式 |
|------|----------|
| `fetch-tw-data-stock` | `[stockCode\|all] [date] [outputPath]`（TWSE 或 TPEX 腳本） |
| `fetch-tw-data-futures` | `[YYYYMMDD] [outputPath]` |
| `fetch-tw-data-margin` | `[stockCode\|all] [date] [outputPath]`（TWSE 或 TPEX 腳本） |
| `fetch-tw-data-institutional` | `[stockCode\|all] [date] [outputPath]`（TWSE 或 TPEX 腳本） |

---

## 台股新聞抓取類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-tw-news-mops` | 抓取 MOPS 重大公告（上市/上櫃/興櫃/公開發行），Playwright + 內部 API | `fetch_mops.mjs` | `playwright` |
| `fetch-tw-news-cnyes` | 抓取鉅亨網台股即時新聞（近 100 筆） | `fetch_cnyes.mjs` | `axios` |
| `fetch-tw-news-statementdog` | 抓取財報狗產業分析與個股新聞 | `fetch_statementdog.mjs` | `axios`, `cheerio` |
| `fetch-tw-news-moneydj` | 抓取 MoneyDJ 法說/營收新聞（50 頁，約 1.5~3 分鐘） | `fetch_moneydj.mjs` | `axios`, `cheerio` |

### 參數格式

| 技能 | 參數格式 |
|------|----------|
| `fetch-tw-news-mops` | `[outputPath]` |
| `fetch-tw-news-cnyes` | `[outputPath]` |
| `fetch-tw-news-statementdog` | `[outputPath]` |
| `fetch-tw-news-moneydj` | `[outputPath]` |

---

## AI / 科技新聞類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-rss` | 取得任意 RSS Feed 並轉為統一 JSON 格式，支援 YouTube、新聞網站等 | `fetch_rss.mjs` | `axios`, `rss-parser` |
| `fetch-ai-news-aggregator` | 取得 AI News Aggregator 最近 24 小時 AI 新聞 | `fetch_ai_news_aggregator.mjs` | `axios` |
| `fetch-hacker-news` | 取得 Hacker News 最新文章（newest），透過 Firebase API 批次取得文章詳情 | `fetch_hacker_news.mjs` | `axios` |
| `fetch-news-ai` | 整合 9 個來源（RSS + AI News Aggregator + Hacker News），過濾今日與昨日新聞，依時間降冪排序 | `fetch-news-ai.mjs` | `axios`, `rss-parser` |

### 參數格式

| 技能 | 參數格式 |
|------|----------|
| `fetch-rss` | `<rssUrl> [outputPath]` |
| `fetch-ai-news-aggregator` | `[outputPath]` |
| `fetch-hacker-news` | `[outputPath] [limit]`（limit 預設 30，最大 500） |
| `fetch-news-ai` | `[outputPath]` |

> `fetch-news-ai` 依賴 `fetch-rss`、`fetch-ai-news-aggregator`、`fetch-hacker-news` 作為同層兄弟技能目錄（以 `__dirname` 動態解析路徑）。

---

## 交易日檢查

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `check-tw-trading-day` | 透過 TWSE 官方 API 判斷指定日期是否為台股交易日；exit code：0=交易日、1=非交易日、2=API 錯誤 | `check_tw_trading_day.mjs` | 無（Node.js 內建 `https`） |

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# stdout: TRADING_DAY=true / TRADING_DAY=false
```

---

## 通知與儲存類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `send-email` | 透過 GAS Web App API 寄送 Email（純文字或 HTML），支援 JSON 檔案與直接參數兩種模式 | `send_email.mjs` | `axios` |
| `save-news-to-sheet` | 透過 GAS Web App API 將新聞資料寫入 Google Sheet，支援自動去重 | `save_news_to_sheet.mjs` | `axios` |

### 參數格式

| 技能 | 模式 A（JSON 檔案） | 模式 B（直接參數） |
|------|------|------|
| `send-email` | `<payload.json> [outputPath]` | `<gas_url> <token> <to> <from> <subject> <body> [outputPath]` |
| `save-news-to-sheet` | `<payload.json> [outputPath]` | `<gas_url> <token> '<itemsNewJSON>' [outputPath]` |

> 兩者皆需使用者提供 `gas_url`（GAS Web App 部署網址）與 `token`（GAS 端驗證 token）。

---

## Fetcher 通用特性

所有數據與新聞抓取類技能共享以下特性：

- **結果寫檔**：一律寫入檔案（`outputPath` 或自動產生），無論成功或錯誤均寫入後才 exit，請讀取檔案取得結果
- **自動重試**：5xx 或網路錯誤自動等待重試，線性遞增退避（台股數據類最多 10 次 / 5s~30s；新聞與 GAS 類最多 5~6 次 / 3s~15s）
- **執行位置**：由執行 agent 依自身環境決定，腳本不強制特定工作目錄

---

## 目錄結構

```text
.
├── check-tw-trading-day/
│   ├── SKILL.md
│   └── scripts/
│       └── check_tw_trading_day.mjs
├── dispatch-cli/
│   ├── SKILL.md
│   └── scripts/
│       └── run_cli.mjs              <- 核心 CLI 執行器
├── do-loop/
│   ├── SKILL.md
│   └── references/
│       ├── roles.md                 <- 三角色行為規範
│       └── state-example.jsonc      <- state.json 範例
├── dispatch-claude/
│   ├── SKILL.md
│   └── references/
│       └── claude-flags.md
├── dispatch-codex/
│   ├── SKILL.md
│   └── references/
│       └── codex-flags.md
├── dispatch-gemini/
│   ├── SKILL.md
│   └── references/
│       └── gemini-flags.md
├── dispatch-opencode/
│   ├── SKILL.md
│   └── references/
│       └── opencode-flags.md
├── fetch-ai-news-aggregator/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_ai_news_aggregator.mjs
│       └── fetchAiNewsAggregator.mjs
├── fetch-hacker-news/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_hacker_news.mjs
│       └── fetchHackerNews.mjs
├── fetch-news-ai/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch-news-ai.mjs
│       └── fetchNewsAi.mjs
├── fetch-rss/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_rss.mjs
│       └── fetchRSS.mjs
├── fetch-web/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_web.mjs            <- CLI 入口
│       └── fetchWeb.mjs             <- 核心函式
├── fetch-tw-data-futures/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_taifex.mjs
├── fetch-tw-data-institutional/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_twse_t86.mjs
│       └── fetch_tpex_3insti.mjs
├── fetch-tw-data-margin/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_twse_margin.mjs
│       └── fetch_tpex_margin.mjs
├── fetch-tw-data-stock/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_twse_stock.mjs
│       └── fetch_tpex_stock.mjs
├── fetch-tw-news-cnyes/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_cnyes.mjs
├── fetch-tw-news-moneydj/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_moneydj.mjs
├── fetch-tw-news-mops/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_mops.mjs
├── fetch-tw-news-statementdog/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_statementdog.mjs
├── save-news-to-sheet/
│   ├── SKILL.md
│   └── scripts/
│       └── save_news_to_sheet.mjs
├── send-email/
│   ├── SKILL.md
│   └── scripts/
│       └── send_email.mjs
├── tw-stock-post-market/
│   ├── SKILL.md
│   └── scripts/
│       ├── run_post_market.mjs   <- 主控腳本（推薦入口）
│       └── generate_report.mjs
└── tw-stock-research/
    ├── SKILL.md
    └── scripts/
        ├── run_research.mjs      <- 主控腳本（推薦入口）
        └── generate_report.mjs
```

## 依賴安裝

```bash
# 台股研究全套（盤前調研 + 盤後總結 + 新聞抓取）
npm install axios cheerio playwright

# 網頁抓取（fetch-web）
npm install @mozilla/readability jsdom playwright

# AI / 科技新聞
npm install axios rss-parser

# 僅台股數據抓取或盤後總結
npm install axios

# 通知與儲存（send-email / save-news-to-sheet）
npm install axios
```

> 各技能 SKILL.md 內皆有獨立的安裝指引與驗證指令，詳見各技能說明。

## 使用方式

1. AI Agent 讀取各技能目錄下的 `SKILL.md` 了解用法
2. 依 `SKILL.md` 安裝指引完成依賴安裝
3. 以 Node.js 執行 `scripts/` 內的腳本

## License

MIT
