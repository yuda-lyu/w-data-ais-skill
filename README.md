# w-data-ais-skill — AI Agent 共享技能庫

可重複使用的 AI Agent 技能模組庫，支援多 agent 共用同一技能庫。
每個技能包含 `SKILL.md` 說明文件與可選的 `scripts/` 腳本或 `references/` 參考資料。

## 技能總覽（43 個）

| 分類 | 技能數 |
|------|:------:|
| [開發工作流](#開發工作流類) | 1 |
| [角色定位](#角色定位類) | 4 |
| [綜合分析](#綜合分析類) | 2 |
| [Multi-Agent 協作](#multi-agent-協作類) | 7 |
| [網頁與媒體抓取](#網頁與媒體抓取類) | 9 |
| [台股數據抓取](#台股數據抓取類) | 5 |
| [台股新聞抓取](#台股新聞抓取類) | 4 |
| [AI / 科技新聞](#ai--科技新聞類) | 4 |
| [交易日檢查](#交易日檢查) | 1 |
| [通知與儲存](#通知與儲存類) | 2 |
| [檔案與工具](#檔案與工具類) | 4 |

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

## 角色定位類

| 技能 | 說明 | 前置需求 |
|------|------|----------|
| `role-design-web-for-prototype` | 將 Agent 定位為設計工程師，以 HTML/CSS/JS + React / Vue 3 / Vue 2 打造網頁、登陸頁、儀表板、互動原型、HTML 簡報、動畫示範、UI mockup、資料視覺化等視覺化產物 | 無（純角色／規範技能，CDN 載入各框架） |
| `role-design-web-for-spec` | 在 `role-design-web-for-prototype` 的基礎上加法擴充四項硬性要求：研究前置（Persona / Journey）、WCAG AA 無障礙合規、量化驗收指標、亮／暗／跟隨系統三段式主題標配 | 無（純角色／規範技能，CDN 載入各框架） |
| `role-design-web-for-magazine` | 將 Agent 定位為設計工程師，以「雜誌風格」（編輯感、紙面墨色、強字級節奏、真實圖片、細緻網格）製作高品質靜態 Web 視覺產物，採 L1（角色）→ L2（主設計）→ L3（主題色）→ L4（骨架）→ L5（必要）五層 references 設計 | 無（純角色／規範技能，CDN 載入各框架） |
| `role-writer-report` | 將 Agent 定位為受委任之資深技術顧問兼主筆工程師，以繁體中文工程白皮書／標案書面語撰寫服務建議書、服務實施計劃書、期中／期末報告等大型委辦案技術文件，採 L1（角色）→ L2（原則）→ L3（細則）三層 references 設計 | 無（純角色／規範技能） |

- 預設 React 18 + Babel inline JSX，亦支援 Vue 3 Composition API 與 Vue 2 Options API，各框架硬規則與樣板分列於 `references/`
- 涵蓋裝置外框、Tweaks 面板、`useTime` 動畫引擎、簡報引擎、ECharts/Chart.js、oklch 配色系統等進階模式
- `role-design-web-for-spec` 相對於 `role-design-web-for-prototype` 的差異：新增 Step 0 研究前置、WCAG AA 硬性合規檢查、量化驗收指標（Lighthouse A11y / 對比值 / 響應式 / 鍵盤全路徑）、主題系統標配
- `role-design-web-for-magazine` 為獨立的雜誌風格設計分支：強調編輯感版面、強字級節奏、紙面墨色與真實圖片，採 L1–L5 五層 references（角色 / 主設計 / 主題色 / 骨架 / 必要）
- `role-writer-report` 採三層分檔設計（共用 L1，依報告類型切換 L2/L3），目前已收錄「服務建議書」之 L2/L3，其他類型可在共用 L1 之上新增對應檔組

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
| `dispatch-claude` | 以 Claude Code CLI (`claude -p`) 作為獨立 agent 驅動，支援 `--allowedTools` 細粒度工具控制與 `--max-budget-usd` 預算限制 | 需安裝 `@anthropic-ai/claude-code`（位置由執行 agent 決定，詳見 SKILL.md） |
| `dispatch-codex` | 以 OpenAI Codex CLI (`codex exec`) 作為獨立 agent 驅動，需啟用沙箱網路 | 需安裝 `@openai/codex`（位置由執行 agent 決定，詳見 SKILL.md） |
| `dispatch-gemini` | 以 Google Gemini CLI (`gemini`) 作為獨立 agent 驅動，預設可連網 | 需安裝 `@google/gemini-cli`（位置由執行 agent 決定，詳見 SKILL.md） |
| `dispatch-opencode` | 以 OpenCode CLI (`opencode run`) 作為獨立 agent 驅動，支援多 provider/model（GPT、Claude、Gemini、Nemotron 等），含免費模型 | 需安裝 `opencode-ai`（位置由執行 agent 決定，詳見 SKILL.md） |
| `dispatch-antigravity` | 以 Antigravity CLI (`agy`) 作為獨立 agent 驅動 | 需安裝 `agy` CLI（位置由執行 agent 決定，詳見 SKILL.md） |
| `dispatch-agents` | 同時派出 Claude / Codex / Gemini 三大 agent 平行執行（最強模型 + 最強思考深度），由調度 AI 彙整三方結果 | 三者皆需安裝：`@anthropic-ai/claude-code`、`@openai/codex`、`@google/gemini-cli`（位置由執行 agent 決定，詳見 SKILL.md） |

- `dispatch-cli` 為核心調用層，提供 `run_cli.mjs` 腳本（非同步+自動重試），其餘技能透過它執行
- 調度 AI 與被派遣 agent 以背景方式平行執行，各自寫入不同輸出檔案後再彙整
- `dispatch-agents` 為多 agent 共識整合層，適用於高重要性任務需多方觀點交叉驗證

---

## 網頁與媒體抓取類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-web` | 通用網頁抓取，四階段自動升級：curl → Playwright 無頭 → Playwright 有頭 → Camofox 反偵測瀏覽器，統一由 Readability 解析文章主體 | `fetch_web.mjs`, `fetchWeb.mjs` | `@mozilla/readability`, `jsdom`, `playwright`, `@askjo/camofox-browser` |
| `fetch-web-by-curl` | 用系統 `curl` 抓原始 HTML，繞過層級 1-3 反爬（UA/Headers/TLS 指紋），零瀏覽器依賴、最輕量 | `fetch_web_by_curl.mjs`, `fetchWebByCurl.mjs` | 無（系統 `curl`） |
| `fetch-web-by-playwright-headless` | Playwright 無頭抓原始 HTML，完整 JS 渲染 SPA，含 Shadow DOM 穿透 | `fetch_web_by_playwright_headless.mjs`, `fetchWebByPlaywrightHeadless.mjs` | `playwright` |
| `fetch-web-by-playwright-head` | Playwright 有頭抓原始 HTML，自動點擊 Cloudflare Turnstile / hCaptcha 驗證 checkbox，含 Shadow DOM 穿透 | `fetch_web_by_playwright_head.mjs`, `fetchWebByPlaywrightHead.mjs` | `playwright` |
| `fetch-web-by-camofox` | Camofox（修改版 Firefox）反偵測瀏覽器抓 HTML，繞過 Cloudflare Turnstile 等進階驗證 | `fetch_web_by_camofox.mjs`, `fetchWebByCamofox.mjs` | `@askjo/camofox-browser` |
| `fetch-aisixiang` | 抓取愛思想（aisixiang.com）文章，五模式：作者 / 關鍵字 / 標題 / 主題 / 單篇轉 markdown（查詢字串需簡體） | `fetch_aisixiang.mjs`, `fetchAisixiang.mjs` | 無（委派 `fetch-web-by-curl`） |
| `fetch-guancha` | 抓取觀察者網（guancha.cn）文章轉 markdown，五模式：作者 / 關鍵字 / 標題 / 主題 / 單篇（查詢字串需簡體） | `fetch_guancha.mjs`, `fetchGuancha.mjs` | 無（委派 `fetch-web-by-curl`） |
| `fetch-youtube-transcript` | Playwright + 本機 Chrome 抓 YouTube 字幕，走「顯示轉錄稿」UI 流程繞過 POT 限制，雙路徑（DOM + 網路攔截） | `fetch_youtube_transcript.mjs`, `fetchYoutubeTranscript.mjs` | `playwright` |
| `download-baidu-pdf` | Playwright + 本機 Chrome 抓百度網盤「免登入公開」分享 PDF（文件預覽）逐頁圖片併為本機 PDF；攔截帶簽章頁圖 URL，拋棄式 headless、零介入；臨時/輸出檔落於 `download-baidu-pdf/tmp` | `download_baidu_pdf.mjs`, `downloadBaiduPdf.mjs` | `playwright`, `pdfkit` |

### 參數格式

```bash
# 通用抓取（自動階梯升級；可 --method 強制指定）
node fetch-web/scripts/fetch_web.mjs <url> [outputPath] [--method=curl|playwright|playwright-headed]

# 單方法抓取（皆回原始 HTML，不做 Readability 解析）
node fetch-web-by-curl/scripts/fetch_web_by_curl.mjs <url> [outputPath]
node fetch-web-by-playwright-headless/scripts/fetch_web_by_playwright_headless.mjs <url> [outputPath]
node fetch-web-by-playwright-head/scripts/fetch_web_by_playwright_head.mjs <url> [outputPath]
node fetch-web-by-camofox/scripts/fetch_web_by_camofox.mjs <url> [outputPath]

# 知識站抓取（查詢字串需為簡體中文）
node fetch-aisixiang/scripts/fetch_aisixiang.mjs <mode> <query> [outputPath]
node fetch-guancha/scripts/fetch_guancha.mjs <mode> <query> [outputPath]

# YouTube 字幕
node fetch-youtube-transcript/scripts/fetch_youtube_transcript.mjs <url-or-id> [outputPath] [--language=zh-TW]

# 百度網盤「免登入公開」分享 PDF（輸出預設於 download-baidu-pdf/tmp）
node download-baidu-pdf/scripts/download_baidu_pdf.mjs <百度分享網址> [輸出檔.pdf] [--out-dir <path>]
```

- `fetch-web` 預設自動升級：curl 被擋（403/CAPTCHA）→ Playwright 無頭 → Playwright 有頭 → Camofox；底層四個 `fetch-web-by-*` 亦可單獨使用
- Playwright 系列使用系統 Chrome（`channel: 'chrome'`），不需額外下載 Chromium
- `fetch-aisixiang` / `fetch-guancha` 委派 `fetch-web-by-curl` 取 HTML，查詢字串需由呼叫端轉為簡體

---

## 台股數據抓取類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `fetch-tw-data-holiday` | 查詢台灣國定假日（TWSE OpenAPI），回傳指定日期是否為假日及假日名稱 | `fetch_tw_data_holiday.mjs` | 無（Node.js 內建 `https`） |
| `fetch-tw-data-stock` | 抓取收盤 OHLC 資料（上市 TWSE + 上櫃 TPEX） | `fetch_twse_stock.mjs`, `fetch_tpex_stock.mjs` | `axios` |
| `fetch-tw-data-futures` | 抓取期交所台指期行情、法人未平倉、P/C Ratio | `fetch_taifex.mjs` | `axios` |
| `fetch-tw-data-margin` | 抓取融資融券餘額（上市 + 上櫃） | `fetch_twse_margin.mjs`, `fetch_tpex_margin.mjs` | `axios` |
| `fetch-tw-data-institutional` | 抓取三大法人買賣超（官方 TWSE T86 + TPEX 3Insti） | `fetch_twse_t86.mjs`, `fetch_tpex_3insti.mjs` | `axios` |

### 參數格式

| 技能 | 參數格式 |
|------|----------|
| `fetch-tw-data-holiday` | `[YYYYMMDD] [outputPath]`（空字串即取當年度完整清單） |
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
| `fetch-news-ai` | 整合 10 個來源（RSS + AI News Aggregator + Hacker News），過濾今日與昨日新聞，依時間降冪排序 | `fetch_news_ai.mjs` | `axios`, `rss-parser` |

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

## 檔案與工具類

| 技能 | 說明 | 主要腳本 | 依賴 |
|------|------|----------|------|
| `convert-chinese` | 繁簡中文互轉（opencc-js）：cn ↔ tw/twp ↔ hk ↔ jp ↔ t 任意方向，預設 cn→twp（簡轉繁台灣詞級） | `convert_chinese.mjs`, `convertChinese.mjs` | `opencc-js` |
| `shorten-url` | 長網址轉短網址（da.gd 公開 API，免註冊、免 API key、無 preview 中間頁），支援自訂短碼 | `shorten_url.mjs`, `shortenUrl.mjs` | 無（Node 18+ 內建 `fetch`） |
| `zip-files-or-folder` | 壓縮單檔／多檔／資料夾為 zip，各模式皆可設密碼（zip20 預設、aes256 可選） | `zip_files_or_folder.mjs`, `zipFilesOrFolder.mjs` | `w-zip`, `@zip.js/zip.js` |
| `share-file` | Playwright + 本機 Chrome 上傳檔案到 Wormhole.app，取一次性 24h 內過期分享連結（≤ 5GB） | `share_file.mjs`, `shareFile.mjs` | `playwright` |

### 參數格式

```bash
# 繁簡轉換（預設 cn→twp；可指定來源/目標，或接受字串/檔案/stdin）
node convert-chinese/scripts/convert_chinese.mjs (--text "..." | --input <path> | --stdin) [--from cn] [--to twp]

# 短網址
node shorten-url/scripts/shorten_url.mjs <longUrl> [--alias <自訂短碼>]

# 壓縮（單檔/多檔/資料夾；--password 設密碼）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs <input...> [--output out.zip] [--password <pwd>]

# 上傳取一次性連結
node share-file/scripts/share_file.mjs <file> [--max-downloads <N>] [--expiration <T>]
```

---

## Fetcher 通用特性

所有數據與新聞抓取類技能共享以下特性：

- **結果寫檔**：一律寫入檔案（`outputPath` 或自動產生），無論成功或錯誤均寫入後才 exit，請讀取檔案取得結果
- **自動重試**：5xx 或網路錯誤自動等待重試，線性遞增退避（台股數據／台股新聞／交易日檢查類最多重試 10 次 / 5s~30s，含初始請求最多執行 11 次；AI 科技新聞與 GAS〔send-email／save-news-to-sheet〕類最多重試 5 次 / 3s~15s，含初始請求最多執行 6 次）
- **執行位置**：由執行 agent 依自身環境決定，腳本不強制特定工作目錄

> 程式化 API（camelCase）與 CLI（snake_case）雙檔慣例：每個技能的 `scripts/` 同時提供可程式化 import 的函式檔（回 `{ status, ... }` 結構）與 CLI 包裝檔。

---

## 目錄結構

```text
.
├── check-tw-trading-day/
│   ├── SKILL.md
│   └── scripts/
│       ├── checkTwTradingDay.mjs
│       └── check_tw_trading_day.mjs
├── convert-chinese/
│   ├── SKILL.md
│   └── scripts/
│       ├── convertChinese.mjs
│       └── convert_chinese.mjs
├── dispatch-agents/
│   └── SKILL.md
├── dispatch-antigravity/
│   ├── SKILL.md
│   └── references/
│       └── agy-flags.md
├── dispatch-claude/
│   ├── SKILL.md
│   └── references/
│       └── claude-flags.md
├── dispatch-cli/
│   ├── SKILL.md
│   └── scripts/
│       └── run_cli.mjs
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
├── do-loop/
│   ├── SKILL.md
│   └── references/
│       ├── roles.md
│       └── state-example.jsonc
├── download-baidu-pdf/
│   ├── SKILL.md
│   └── scripts/
│       ├── downloadBaiduPdf.mjs
│       └── download_baidu_pdf.mjs
├── fetch-ai-news-aggregator/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchAiNewsAggregator.mjs
│       └── fetch_ai_news_aggregator.mjs
├── fetch-aisixiang/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchAisixiang.mjs
│       └── fetch_aisixiang.mjs
├── fetch-guancha/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchGuancha.mjs
│       └── fetch_guancha.mjs
├── fetch-hacker-news/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchHackerNews.mjs
│       └── fetch_hacker_news.mjs
├── fetch-news-ai/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchNewsAi.mjs
│       └── fetch_news_ai.mjs
├── fetch-rss/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchRSS.mjs
│       └── fetch_rss.mjs
├── fetch-tw-data-futures/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchTaifex.mjs
│       └── fetch_taifex.mjs
├── fetch-tw-data-holiday/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchTwDataHoliday.mjs
│       └── fetch_tw_data_holiday.mjs
├── fetch-tw-data-institutional/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchTpex3insti.mjs
│       ├── fetchTwseT86.mjs
│       ├── fetch_tpex_3insti.mjs
│       └── fetch_twse_t86.mjs
├── fetch-tw-data-margin/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchTpexMargin.mjs
│       ├── fetchTwseMargin.mjs
│       ├── fetch_tpex_margin.mjs
│       └── fetch_twse_margin.mjs
├── fetch-tw-data-stock/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchTpexStock.mjs
│       ├── fetchTwseStock.mjs
│       ├── fetch_tpex_stock.mjs
│       └── fetch_twse_stock.mjs
├── fetch-tw-news-cnyes/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchCnyes.mjs
│       └── fetch_cnyes.mjs
├── fetch-tw-news-moneydj/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchMoneydj.mjs
│       └── fetch_moneydj.mjs
├── fetch-tw-news-mops/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchMops.mjs
│       └── fetch_mops.mjs
├── fetch-tw-news-statementdog/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchStatementdog.mjs
│       └── fetch_statementdog.mjs
├── fetch-web/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchWeb.mjs
│       └── fetch_web.mjs
├── fetch-web-by-camofox/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchWebByCamofox.mjs
│       └── fetch_web_by_camofox.mjs
├── fetch-web-by-curl/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchWebByCurl.mjs
│       └── fetch_web_by_curl.mjs
├── fetch-web-by-playwright-head/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchWebByPlaywrightHead.mjs
│       └── fetch_web_by_playwright_head.mjs
├── fetch-web-by-playwright-headless/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchWebByPlaywrightHeadless.mjs
│       └── fetch_web_by_playwright_headless.mjs
├── fetch-youtube-transcript/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetchYoutubeTranscript.mjs
│       └── fetch_youtube_transcript.mjs
├── role-design-web-for-magazine/
│   ├── SKILL.md
│   └── references/
│       ├── L1角色原則.md
│       ├── L2主設計原則.md
│       ├── L3主題色原則.md
│       ├── L4骨架原則.md
│       ├── L5必要原則.md
│       ├── patterns-react.md
│       ├── patterns-vue2.md
│       └── patterns-vue3.md
├── role-design-web-for-prototype/
│   ├── SKILL.md
│   └── references/
│       ├── patterns-advanced.md
│       ├── patterns-react.md
│       ├── patterns-vue2.md
│       └── patterns-vue3.md
├── role-design-web-for-spec/
│   ├── SKILL.md
│   └── references/
│       ├── accessibility-wcag-aa.md
│       ├── metrics-validation.md
│       ├── patterns-advanced.md
│       ├── patterns-react.md
│       ├── patterns-vue2.md
│       ├── patterns-vue3.md
│       └── research-lite.md
├── role-writer-report/
│   ├── SKILL.md
│   └── references/
│       ├── L1角色設定.md
│       ├── L2報告設定-服務建議書.md
│       └── L3撰寫設定-服務建議書.md
├── save-news-to-sheet/
│   ├── SKILL.md
│   └── scripts/
│       ├── saveNewsToSheet.mjs
│       └── save_news_to_sheet.mjs
├── send-email/
│   ├── SKILL.md
│   └── scripts/
│       ├── sendEmail.mjs
│       └── send_email.mjs
├── share-file/
│   ├── SKILL.md
│   └── scripts/
│       ├── shareFile.mjs
│       └── share_file.mjs
├── shorten-url/
│   ├── SKILL.md
│   └── scripts/
│       ├── shortenUrl.mjs
│       └── shorten_url.mjs
├── tw-stock-post-market/
│   ├── SKILL.md
│   └── scripts/
│       ├── generate_report.mjs
│       └── run_post_market.mjs
├── tw-stock-research/
│   ├── SKILL.md
│   └── scripts/
│       ├── generate_report.mjs
│       └── run_research.mjs
└── zip-files-or-folder/
    ├── SKILL.md
    └── scripts/
        ├── zipFilesOrFolder.mjs
        └── zip_files_or_folder.mjs
```

## 依賴安裝

```bash
# 台股研究全套（盤前調研 + 盤後總結 + 新聞抓取）
npm install axios cheerio playwright

# 網頁與媒體抓取（fetch-web 全套）
npm install @mozilla/readability jsdom playwright @askjo/camofox-browser
# 其中 fetch-web-by-curl 零依賴；fetch-youtube-transcript 僅需 playwright

# 百度網盤 PDF（download-baidu-pdf）
npm install playwright pdfkit

# AI / 科技新聞
npm install axios rss-parser

# 僅台股數據抓取或盤後總結
npm install axios

# 通知與儲存（send-email / save-news-to-sheet）
npm install axios

# 檔案與工具
npm install opencc-js               # convert-chinese
npm install w-zip @zip.js/zip.js   # zip-files-or-folder
npm install playwright              # share-file
# shorten-url 零依賴（Node 18+ 內建 fetch）
```

> 各技能 SKILL.md 內皆有獨立的安裝指引與驗證指令，詳見各技能說明。

## 使用方式

1. AI Agent 讀取各技能目錄下的 `SKILL.md` 了解用法
2. 依 `SKILL.md` 安裝指引完成依賴安裝
3. 以 Node.js 執行 `scripts/` 內的腳本

## License

MIT
