# AI 共享 Skills 庫

AI Agent 的技能模組庫。

## 用途

- 存放可重複使用的 AI agent 技能模組
- 支援多 agent 共用同一技能庫
- 每個技能包含 `SKILL.md` 與可選的 `scripts/` 腳本
- 目前以台股研究、自動化抓取、模型額度檢查為主

## 目錄結構

```text
.
├── check-all-quota/
│   ├── SKILL.md
│   └── scripts/
│       └── check_quota_batch.py
├── check-antigravity-quota/
│   ├── SKILL.md
│   └── scripts/
│       └── check_quota.py
├── check-codex-quota/
│   ├── SKILL.md
│   └── scripts/
│       ├── check_codex_quota.py
│       └── check_quota.py
├── check-tw-trading-day/
│   ├── SKILL.md
│   └── scripts/
│       └── check_tw_trading_day.mjs
├── fetch-cnyes/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_cnyes.mjs
├── fetch-institutional-net-buy-sell/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_tpex_3insti.mjs
│       └── fetch_twse_t86.mjs
├── fetch-moneydj/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_moneydj.mjs
├── fetch-mops/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_mops.mjs
├── fetch-statementdog/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_statementdog.mjs
├── fetch-tpex/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_tpex.mjs
├── fetch-twse/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_twse.mjs
├── tw-stock-post-market/
│   ├── SKILL.md
│   └── scripts/
│       ├── run_post_market.mjs   ← 主控腳本（推薦入口）
│       └── generate_report.mjs
├── tw-stock-research/
│   ├── SKILL.md
│   └── scripts/
│       ├── run_research.mjs      ← 主控腳本（推薦入口）
│       └── generate_report.mjs
├── claude_call_codex/
│   ├── SKILL.md
│   └── references/
├── claude_call_gemini/
│   ├── SKILL.md
│   └── references/
└── claude_call_opencode/
    ├── SKILL.md
    └── references/
```

## 現有技能清單

### 綜合分析類

| 技能 | 說明 | 主要腳本 | 執行時間 |
|------|------|----------|----------|
| `tw-stock-research` | 台股盤前調研：整合 MOPS、鉅亨網、財報狗、MoneyDJ、三大法人共 5 個來源，產出盤前報告 | `run_research.mjs` | 3~8 分鐘 |
| `tw-stock-post-market` | 台股盤後總結：抓取收盤價與法人資料，比對盤前研判準確度，累積調研經驗 | `run_post_market.mjs` | 1~3 分鐘 |

#### 主控腳本用法

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
- `baseOutputDir` 應傳入資料根目錄，例如 `./w-data-news`，不要傳入已含 `tw-stock-research/YYYYMMDD` 或 `tw-stock-post-market/YYYYMMDD` 的最終目錄
- 輸出位置：`w-data-news/tw-stock-research/YYYYMMDD/` / `w-data-news/tw-stock-post-market/YYYYMMDD/`

---

### Multi-Agent 協作類

| 技能 | 說明 | 前置需求 |
|------|------|----------|
| `claude_call_codex` | 以 OpenAI Codex CLI (`codex exec`) 作為獨立 agent 驅動，實現 Claude + Codex 混合多 agent 工作流程 | `npm install -g @openai/codex` |
| `claude_call_gemini` | 以 Google Gemini CLI (`gemini`) 作為獨立 agent 驅動，實現 Claude + Gemini 混合多 agent 工作流程 | `npm install -g @google/gemini-cli` |
| `claude_call_opencode` | 以 OpenCode CLI (`opencode run`) 作為獨立 agent 驅動，支援多 provider/model 選擇（GPT、Claude、Gemini、Nemotron 等），預設免費模型 | `npm install -g opencode-ai` |

- 無腳本，僅提供 `SKILL.md` 操作說明與 `references/` 參考資料
- 兩個 agent 以背景方式平行執行，各自寫入不同輸出檔案後再彙整
- Codex：需加 `--config sandbox_workspace_write.network_access=true` 啟用沙箱網路
- Gemini：預設可連網，以 `cd` 指定工作目錄 + `--yolo` 自動核准
- OpenCode：用 `opencode run --agent build` 執行任務，`--agent build` 已預設權限全開，不需額外旗標

---

### 數據抓取類（Fetchers）

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-mops` | 抓取 MOPS 重大公告（上市/上櫃/興櫃/公開發行），Puppeteer + 內部 API | `fetch_mops.mjs` | `puppeteer-core` |
| `fetch-cnyes` | 抓取鉅亨網台股即時新聞（近 100 筆） | `fetch_cnyes.mjs` | `axios` |
| `fetch-statementdog` | 抓取財報狗產業分析與個股新聞 | `fetch_statementdog.mjs` | `axios`, `cheerio` |
| `fetch-moneydj` | 抓取 MoneyDJ 法說/營收新聞（50 頁，~1.5~3 分鐘） | `fetch_moneydj.mjs` | `axios`, `cheerio` |
| `fetch-twse` | 抓取證交所上市股票收盤資料（個股或全市場） | `fetch_twse.mjs` | `axios` |
| `fetch-tpex` | 抓取櫃買中心上櫃股票收盤資料（個股或全市場） | `fetch_tpex.mjs` | `axios` |
| `fetch-institutional-net-buy-sell` | 抓取三大法人買賣超（官方 TWSE T86 + TPEX 3Insti），支援指定日期與代碼 | `fetch_twse_t86.mjs`, `fetch_tpex_3insti.mjs` | `axios` |

#### Fetcher 通用特性

- 輸出：結果**一律寫入檔案**（`outputPath` 或自動產生），無論成功或錯誤均寫入後才 exit，請讀取檔案，勿依賴 stdout
- 重試：內建自動重試（最多 10 次），5xx 或網路錯誤自動等待重試（5s → 10s → ... → 上限 30s）
- 執行位置：**須從專案根目錄**（`node_modules` 所在位置）執行

#### 參數格式

| 技能 | 參數格式 |
|------|----------|
| `fetch-mops` | `[outputPath]` |
| `fetch-cnyes` | `[outputPath]` |
| `fetch-statementdog` | `[outputPath]` |
| `fetch-moneydj` | `[outputPath]` |
| `fetch-twse` | `[stockCode\|all] [date] [outputPath]` |
| `fetch-tpex` | `[stockCode\|all] [date] [outputPath]` |
| `fetch-institutional-net-buy-sell` | `[stockCode\|all] [date] [outputPath]`（TWSE 或 TPEX 腳本） |

---

### 交易日檢查

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `check-tw-trading-day` | 透過 TWSE 官方 API 判斷指定日期是否為台股交易日；exit code：0=交易日、1=非交易日、2=API 錯誤 | `check_tw_trading_day.mjs` | 無（Node.js 內建 `https`） |

```bash
node check-tw-trading-day/scripts/check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
# stdout: TRADING_DAY=true / TRADING_DAY=false
```

---

### 額度 / 配額檢查類

| 技能 | 說明 | 主要腳本 |
|------|------|----------|
| `check-all-quota` | 批次查詢所有帳號（Google Antigravity + OpenAI Codex）額度；自動偵測 auth-profiles.json，平行查詢（最多 8 並行） | `check_quota_batch.py` |
| `check-antigravity-quota` | 查詢單一 Google Antigravity 帳號所有 AI 模型額度（Claude、Gemini、GPT-OSS 等） | `check_quota.py` |
| `check-codex-quota` | 查詢 OpenAI Codex 帳號的 5 小時 session 配額和週配額 | `check_quota.py` |

---

## 依賴安裝

```bash
# 台股研究相關（最常用）
npm install axios cheerio puppeteer-core

# 僅盤後總結（不含 MOPS）
npm install axios
```

## 使用方式

- Agent 可透過讀取各技能目錄下的 `SKILL.md` 了解如何使用技能。
- 技能腳本以 Node.js 或 Python 撰寫，依各技能目錄內容為準。
- 若技能有外部依賴，請依 `SKILL.md` 說明先完成安裝。

## License

MIT

