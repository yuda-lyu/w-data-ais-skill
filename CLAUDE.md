# 本技能庫（w-data-ais-skill）工作守則 — 專案記憶

> 本檔記錄「只在本技能庫才會踩到」的陷阱與守則。全域通則見 `~/.claude/CLAUDE.md`；本檔為其在本專案的補充，衝突時以**更嚴格者**為準。

---

## 1. 審計／驗證技能時：禁止「實跑有副作用的技能」

**核心鐵律**：全域規範「runtime 行為優先實測」的**前提是該實測零副作用**。本庫含多支「功能本身就是副作用」的技能；對它們做驗證時**一律改為「讀碼 + mock/stub/純邏輯單元測試 / 靜態分析」，禁止實跑**。證不出就標「未實跑 / refuted」，**絕不為了取證而觸發真實副作用**。

派任何「驗證」工作（自己做或派子代理）前，先一句話講出 **「此驗證的副作用半徑」**（OS 進程／視窗／瀏覽器／網路／檔案／外部服務）。命中下表 🔴 就改靜態，**不准把「實跑」寫進子代理 prompt**。

| 類別 | 技能 | 驗證方式 |
|---|---|---|
| 🔴 **禁止實跑**（spawn 子進程／開 cmd 視窗）| `dispatch-cli`、`dispatch-claude`、`dispatch-codex`、`dispatch-gemini`、`dispatch-opencode`、`dispatch-agents` | 核心 `run_cli.mjs` 的功能**就是 spawn 外部 CLI**；Windows 上 `.cmd` shim / `cmd.exe` fallback 會**彈出真實 cmd 視窗**。只准讀碼 + 對純函式（如 `_parseJsEntryFromCmd`、輸出解碼）做 mock 單元測試；**絕不** `node run_cli.mjs` 跑真實 CLI、**絕不**實測 cmd.exe fallback 路徑 |
| 🔴 **禁止實跑**（開瀏覽器）| `download-baidu-pdf`、`fetch-web-by-playwright-headless`、`fetch-web-by-playwright-head`、`fetch-web-by-camofox`、`fetch-youtube-transcript`、`fetch-tw-news-mops` | Playwright 會啟動本機 Chrome。只准讀碼 + 靜態分析；要驗 DOM/解析邏輯就抽純函式 mock |
| 🔴 **禁止實跑**（不可逆外部動作）| `send-email`（真寄信）、`share-file`（真上傳）、`save-news-to-sheet`（真寫外部 Google Sheet）| 只讀碼 + mock；driver 一律不打真實 endpoint |
| 🟡 **可實跑但限 `./tmp/`**（對外網唯讀抓取）| `fetch-web-by-curl`、`fetch-web`、`fetch-rss`、`fetch-hacker-news`、`fetch-ai-news-aggregator`、`fetch-news-ai`、`fetch-aisixiang`、`fetch-guancha`、`check-tw-trading-day`、`fetch-tw-data-*`、`fetch-tw-news-cnyes`、`fetch-tw-news-statementdog`、`fetch-tw-news-moneydj` | 可實跑，但**輸出一律帶 `outputPath=./tmp/...`**（見 §3），收尾清 tmp。注意 fetch-tw-news-mops 走瀏覽器，屬 🔴 |
| 🟢 **安全**（純本地，可自由實跑）| `convert-chinese`、`shorten-url`（僅 da.gd API）、`zip-files-or-folder`、`do-loop`（純方法論文件）、`role-design-web-*`、`role-writer-report` | 可實跑 |

### 殷鑑（2026-05-31）
為了「先實證再修」`dispatch-cli`，派子代理去**實跑 `run_cli.mjs` 並實測 cmd.exe fallback**，在各技能資料夾噴出 **594 個 cmd.exe 視窗**淹沒使用者桌面。根因＝把「runnable evidence」無差別套到 process-spawner 上。事後以 `taskkill //F //IM cmd.exe //T` 清為 0。**dispatch-* 一律不實跑。**

---

## 2. 派子代理（審計／修技能）的並行紀律

- **並行子代理數設上限**（建議 ≤ 6），避免同時噴大量副作用、或累積超過能逐一收尾審查的量。
- **依檔案歸屬分組**：每個子代理只動「自己負責的技能／檔」，避免同檔並行衝突（例：dispatch-cli 的多項修正都動同一 `SKILL.md` / `run_cli.mjs` → 必須交給**同一個**子代理）。
- 子代理 prompt **明文禁止**對 §1 的 🔴 類技能實跑。
- 收尾必跑 `git status`：確認（a）改動範圍符合預期、（b）cwd 根無孤兒檔（見 §3）、（c）`.mjs` 全數 `node --check` 通過。

---

## 3. 孤兒檔守則（本庫 CLI 預設寫到 cwd 根）

本庫多支 tw-data / tw-news CLI（如 `fetch_twse_margin.mjs`、`fetch_twse_t86.mjs`、`fetch_taifex.mjs`…）**未指定 outputPath 時，預設把結果寫到「當前工作目錄根」**（檔名如 `twse_margin_<code>_<date>.json`，屬正常設計）。實跑驗證時：

- **一律顯式帶 `outputPath=./tmp/xxx`**，絕不用預設。
- 收尾**不只清 `./tmp/`，還要 `git status` 確認 cwd 根無新增孤兒檔**（不能只查 tmp）。
- 殷鑑（2026-05-31）：margin 驗證子代理用了預設輸出，在專案根目錄留下 `twse_margin_2330_20260531.json` 孤兒檔。

---

## 4. Windows 特定

- 任何 `spawn`／`exec` 啟動子進程一律帶 `windowsHide: true`。
- 殺殘留進程用 **`taskkill //F //IM <name> //T`**（在 Git Bash 直接呼叫 taskkill.exe；**不要**用 `cmd //c` 包裝，否則又會開一個 cmd 視窗）。清完以 `tasklist | grep -ci '<name>'` 唯讀確認歸零。

---

## 5. 主代理親驗紀律（收到子代理／workflow 回報後）

**鐵律：子代理或 workflow agent 的回報一律視為「待查線索」，不是結論。主代理必須親自逐項核實後，才可接受、呈報、或標為「已確認 / 已修」。**

- **審計發現**：親自 `Read` evidence 指到的 file:line，確認真有問題（非誤判）才標「確認」；未親驗者一律標「未親驗」，**不得混入「真 bug」**。
- **修正**：親自讀 diff + 讀改後完整碼，確認 (a) 原問題真實、(b) 改對且完整、(c) 無新回歸；可行則 in-process／純函式驗證（🔴 技能只讀碼＋mock，見 §1）。
- **嚴禁「大概看、大概改、未驗證」**：若多輪審計在「已修並 commit」的技能又挖到 bug，即代表上一輪沒親驗完 —— 這是被禁止的工作方式。驗證涵蓋的案例要明說（如 zip 驗了單檔/多檔/密碼，但**未驗 symlink** → 須註明，不可宣稱「已驗證＝無 bug」）。
- 殷鑑（2026-05-31）：(a) T15 子代理半套壞改（maskedText 宣告卻沒遮罩）被當「完成」接受；(b) 多項 D 級發現被轉述標「真 bug」卻未親驗；(c) zip 重構「已驗證」卻漏測 symlink，下一輪才被抓到 —— 皆因信代理自述、未親驗。
