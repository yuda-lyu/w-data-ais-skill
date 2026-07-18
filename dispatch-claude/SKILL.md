---
name: dispatch-claude
description: This skill should be used when the user asks to "run claude as an agent", "call claude", "use claude cli as agent", "create claude agent", "multi-agent with claude", "dispatch task to claude", "launch claude", or needs to drive Claude Code CLI as a subprocess agent within a multi-agent workflow. v2.1.154+ 的 -p 模式預設掛載 Workflow tool（Max/Team/Enterprise 零設定）。
---

# dispatch-claude — 以 Claude Code CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 Claude Code CLI (`claude -p`) 作為獨立 agent 執行，
實現調度 AI ＋ Claude agent 混合的多 agent 工作流程。

**核心調用層：** 使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

> 📖 完整 CLI 旗標參考請見 [references/claude-flags.md](references/claude-flags.md)

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 Claude agent 執行任務
- 需要利用 Claude 進行程式碼分析、重構、除錯等高階推理工作
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 透過 dispatch-cli 調用（推薦）

### 命令列

```bash
# 基本呼叫（預設 Fable 5 + max 推理深度）
node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-fable-5 --effort max \
  "你的任務描述"

# 完整防護：超時 + JSON 驗證 + 回合限制 + 重試
CLI_TIMEOUT_MS=120000 CLI_VALIDATE=json CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-fable-5 --effort max \
  --output-format json \
  "你的任務描述"

# 從檔案傳入 prompt（取代 shell pipe，避免 stdin 問題）
CLI_TIMEOUT_MS=180000 CLI_INPUT_FILE=prompt.txt \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-fable-5 --effort max \
  --output-format json

# 只核准特定工具（更安全的替代方案）
node dispatch-cli/scripts/run_cli.mjs \
  claude -p --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
  --model claude-fable-5 --effort max \
  "你的任務描述"
```

> 上述路徑為相對路徑範例，實際執行時請依執行環境自行調整路徑。
>
> ⚠ **跨 shell 環境變數寫法**：上述 `CLI_TIMEOUT_MS=120000 ... node ...`（在命令前以 `VAR=value` 設定環境變數的前綴寫法）為 **bash／zsh／Git Bash 專用**。Windows 的 PowerShell 會 parse error、cmd 不適用，須改寫：
> - **bash／zsh／Git Bash**：維持既有前綴寫法 `CLI_TIMEOUT_MS=120000 CLI_VALIDATE=json CLI_MAX_RETRIES=1 node dispatch-cli/scripts/run_cli.mjs ...`。
> - **PowerShell**：先以 `$env:` 設定再執行 —— `$env:CLI_TIMEOUT_MS='120000'; $env:CLI_VALIDATE='json'; $env:CLI_MAX_RETRIES='1'; node dispatch-cli/scripts/run_cli.mjs ...`。
> - **cmd.exe**：以 `set` 設定再以 `&&` 串接 —— `set CLI_TIMEOUT_MS=120000 && set CLI_VALIDATE=json && set CLI_MAX_RETRIES=1 && node dispatch-cli/scripts/run_cli.mjs ...`。
> - **程式化呼叫不受影響**：改用下方「模組匯入」段的 `runCli(...)` + JS options 物件（如 `{ timeoutMs: 120_000 }`）時，不經 shell、無此差異。

### 模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const result = await runCli('claude', [
    '-p', '--dangerously-skip-permissions',
    '--model', 'claude-fable-5', '--effort', 'max',
    '--output-format', 'json',
    '請分析這段程式碼的安全性問題',
], {
    timeoutMs: 120_000,
    validate: 'json',
});

if (result.ok) {
    const data = JSON.parse(result.stdout);
    console.log(data.result);
} else {
    console.error(`Claude 呼叫失敗: ${result.error}`);
}
```

## 模型選擇

| 模型 ID | 別名 | 說明 |
|---------|------|------|
| `claude-fable-5` | `fable` | **預設模型**，Mythos 級最強模型（Claude 5 家族，位階高於 Opus），適合最難、最長時程任務；**任何帳號都不是原廠預設，須顯式指定**；需 CLI v2.1.170+；Anthropic API 上原生 1M context |
| — | `best` | 組織有 Fable 5 存取權時解析為 Fable 5，否則為最新 Opus（「自動取最強」別名） |
| `claude-opus-4-8` | `opus` | 旗艦級 Opus（自 CLI v2.1.154 起 `opus` 別名指向此）；也是 Fable 5 觸發安全分類器時的自動 fallback 對象 |
| `claude-opus-4-7` / `claude-opus-4-6` | — | 前代 Opus，仍可指定使用 |
| `claude-sonnet-5` | `sonnet` | Sonnet 5（`sonnet` 別名現指向此），Anthropic API 上原生 1M context |
| `claude-haiku-4-5` | `haiku` | 最快速、最低成本 |
| `opusplan` | — | 混合模式：plan 階段用 Opus、執行階段用 Sonnet |
| `opus[1m]` / `sonnet[1m]` / `claude-fable-5[1m]` | — | `[1m]` 後綴＝1M token context 變體，通用於別名與完整模型名 |

指定模型：`--model claude-fable-5` 或 `--model fable`（不指定即使用帳號預設模型；**Fable 5 不會是原廠預設，故本 skill 一律顯式傳入**）

> 也可用環境變數 `ANTHROPIC_MODEL=claude-fable-5` 全域指定，或 `ANTHROPIC_DEFAULT_FABLE_MODEL` 固定 `fable` 別名指向的版本（`ANTHROPIC_DEFAULT_OPUS_MODEL` 等其他家族別名環境變數同理）。
>
> **安全分類器 fallback**：Fable 5 對 cybersecurity / biology 類請求觸發分類器時，CLI 會自動改用 Opus 4.8 重跑該請求並顯示通知（session 隨後停留在 Opus，需重新指定才回 Fable）。派工任務屬此二領域時，請預期該部分輸出可能來自 Opus 4.8，屬預期路由非錯誤。

## 推理深度（effort）

**預設使用 `--effort max`**（最深推理，無 token 花費限制；Fable 5 與 Opus 4.6 / 4.7 / 4.8 皆支援）。

| 等級 | 說明 |
|------|------|
| `low` | 簡單查詢，快速便宜 |
| `medium` | 中等推理 |
| `high` | 較深推理（**Fable 5 / Opus 4.8 的原廠預設**） |
| `xhigh` | **延伸推理**，適合長時程 agentic / 編碼任務；Fable 5 / Opus 4.7 / 4.8 支援（v2.1.111+；Opus 4.7 原廠預設） |
| **`max`** | **絕對最深推理，無任何限制（本 skill 預設）**；Fable 5 / Opus 4.6 / 4.7 / 4.8 支援 |

> **Fable 5 支援完整五級（`low`～`max`），但原廠預設只有 `high`——要最深推理必須顯式傳 `--effort max`。**
> `max` 不會跨 session 保留，每次呼叫需明確傳入 `--effort max`；也可透過環境變數 `CLAUDE_CODE_EFFORT_LEVEL=max` 設定（優先級最高；settings 檔的 `effortLevel` 不接受 `max`）。
> 傳入模型不支援的等級時，CLI 自動退到該模型支援的最高等級（如 Opus 4.6 收到 `xhigh` 會以 `high` 執行）。
> prompt 內加 `ultrathink` 關鍵字＝要求該回合多想的 in-context 指示，不改變送 API 的 effort 等級。
> 若需降低推理深度以節省成本，可改為 `--effort xhigh` 或 `--effort high`。

## 啟用 Workflow Tool

Claude Code v2.1.154+ 的 `claude -p` headless 模式**預設掛載 Workflow tool**：

| 帳號 tier | 需要設定 |
|----------|---------|
| Max / Team / Enterprise | 零設定；prompt 內直接要求 Claude 用 Workflow 即可 |
| Pro | 須先在互動模式跑 `/config` 啟用 Dynamic Workflows，或 `--settings '{"enableWorkflows":true}'` |

明確收斂 allowlist 時加：`--allowedTools "Bash,Read,Edit,Write,Workflow"`

> ⚠ 「Ultracode」是 Claude Code 設定而非模型 effort 等級：送給模型的 effort 是 `xhigh`，並額外讓 Claude 對實質任務自動編排 dynamic workflows。**v2.1.203 起** `--effort ultracode` 為合法值（＝以 `xhigh` 啟動 session 並開啟 ultracode），也可 `--settings '{"ultracode":true}'`；**更舊版本**會拒絕 `--effort ultracode`（印 `Unknown --effort value`），且 `--settings` 之 ultracode 在 `-p` 模式被 silent ignore（v2.1.15x 實測）。注意兩點：①自動編排啟發式主要作用於互動 / IDE 模式，`-p` headless 建議仍在 prompt 內顯式要求 Claude 使用 Workflow；②論推理深度 `max` 深於 ultracode 的 `xhigh`，故本 skill 預設仍是 `--effort max`。

診斷「Workflow 沒被調用」優先檢查：
- `~/.claude/settings.json` 是否有 `disableWorkflows: true`
- 環境變數 `CLAUDE_CODE_DISABLE_WORKFLOWS` 是否設為 `1`
- Claude Code 版本是否 ≥ v2.1.154
- 帳號是否為 Pro tier（需先啟用，否則預設關閉）

> `--betas workflows-...` header 在訂閱模式（OAuth）會被靜默丟棄，**不要當開關用**；只在 `ANTHROPIC_API_KEY` 模式才會送出。

## 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `-p` / `--print` | ✅ | 非互動/headless 模式，輸出回應後退出 |
| `--dangerously-skip-permissions` | ✅ | 跳過所有權限確認，自動核准全部操作（僅建議用於受控環境） |
| `--model <model>` | 建議 | 指定模型，可用別名（`fable`/`best`/`opus`/`sonnet`/`haiku`）或完整 ID（本 skill 預設 `claude-fable-5`） |
| `--effort <level>` | 建議 | 推理深度：`low`/`medium`/`high`/`xhigh`/`max`（本 skill 預設 `max`；Fable 5 全五級支援；v2.1.203+ 另接受 `ultracode`） |
| `--output-format <format>` | 建議 | 輸出格式：`text`（預設）、`json`、`stream-json` |
| `--max-budget-usd <n>` | ❌ 可選 | 設定最大花費上限（美元），超過自動停止 |
| `--verbose` | ❌ 可選 | 顯示完整的逐回合輸出 |

> **與 Codex / Gemini / OpenCode 的差異**：Claude CLI 使用 `-p` 進入 headless 模式（非子命令），
> 使用 `--dangerously-skip-permissions` 全自動核准（或 `--allowedTools` 細粒度控制）。
> 不需要 `--skip-git-repo-check` 或 `--config` 旗標。

## 進階選項

| 參數 | 說明 |
|------|------|
| `--allowedTools "Bash,Read,Edit"` | 只核准特定工具（比 `--dangerously-skip-permissions` 更安全） |
| `--disallowedTools "Bash(rm *)"` | 封鎖特定危險操作 |
| `--bare` | 跳過 hooks/skills/plugins/MCP/auto-memory/CLAUDE.md 載入（CI/CD 推薦；v2.1.81+） |
| `--append-system-prompt "..."` | 追加額外系統提示 |
| `--system-prompt "..."` | 完全替換系統提示 |
| `--exclude-dynamic-system-prompt-sections` | 將每台機器動態系統提示移到首個 user message，提升 prompt cache 命中率（v2.1.98+） |
| `--json-schema '{...}'` | 強制回應符合 JSON Schema（需搭配 `--output-format json`） |
| `--fallback-model opus,sonnet` | 主模型過載/不可用時自動切換備援，可逗號分隔多個依序嘗試（派 Fable 5 時建議帶 `--fallback-model opus`） |
| `--max-turns <n>` | 限制 agentic 回合數上限（`-p` 模式） |
| `--permission-mode <mode>` | 權限模式：`default`/`plan`/`auto`/`bypassPermissions`/`dontAsk`（取代已移除的 `--enable-auto-mode`） |
| `--add-dir <path>` | 允許存取額外目錄 |
| `--mcp-config ./mcp.json` | 載入外部 MCP 伺服器工具 |

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 卡住等待權限確認 | 未使用自動核准旗標 | 加上 `--dangerously-skip-permissions` 或 `--allowedTools` |
| 模型找不到 | 模型 ID 或別名拼寫錯誤；或 CLI 過舊 | 使用 `fable`、`opus`、`sonnet`、`haiku` 別名或完整 ID；`fable`/`claude-fable-5` 需 CLI ≥ v2.1.170，過舊先 `claude update` |
| 輸出來自 Opus 而非 Fable 5 | 請求觸發 Fable 5 安全分類器（多為 cybersecurity / biology 領域），CLI 自動 fallback 至 Opus 4.8 | 屬預期路由非帳號問題，任務仍會完成；需 Fable 級能力處理此類領域請洽 Anthropic trusted access |
| 認證失敗 | 未登入或 token 過期 | 執行 `claude auth` 檢查認證狀態 |
| 回應被截斷 | 任務過於複雜導致中途停止；或先前設了 `--max-budget-usd` 花費上限被打到而中止 | 拆小／簡化任務分次執行；改用 `--output-format stream-json` 邊產生邊收集，避免一次性長輸出被截；若曾設花費上限，提高 `--max-budget-usd` 數值或移除該旗標（注意：`--max-budget-usd` 只會「導致」截斷，不會「解決」一般複雜度造成的截斷） |
| 花費超預期 | 任務過於複雜 | 加上 `--max-budget-usd 5.00` 設定上限 |
| WebFetch hang | pipe 模式下 WebFetch 約 30-50% crash | 調度層自行抓取網頁，不依賴 Claude 的 WebFetch |

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `120000`～`300000` | Claude 推理較慢，建議至少 2 分鐘 |
| `CLI_VALIDATE` | `json`（搭配 `--output-format json`） | 確保回傳可解析的 JSON |
| `CLI_MAX_RETRIES` | `1` | API 暫時性錯誤可重試一次（含初始請求最多執行 2 次） |
| `CLI_INPUT_FILE` | prompt 檔案路徑 | 大量輸入用檔案傳入，避免 stdin pipe 問題 |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 Claude agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# Claude agent — 透過 dispatch-cli（背景執行）
command: CLI_TIMEOUT_MS=180000 node dispatch-cli/scripts/run_cli.mjs \
         claude -p --dangerously-skip-permissions \
         --model claude-fable-5 --effort max \
         "... 寫入 result_claude.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`claude_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/claude_result.txt`

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

> 本技能透過 dispatch-cli 執行，請先依 dispatch-cli 技能的安裝指引安裝其 npm 依賴（wsemi、lodash-es）。

```bash
claude --version   # 確認 claude code 已安裝；Fable 5 需 ≥ v2.1.170（實測 2.1.214＝npm 最新），過舊先 claude update
claude auth        # 確認認證狀態
```

若未安裝，請依執行環境自行決定安裝方式（範例：全域 / 專案內 / 其他套件管理器）。安裝**位置**由執行 AI 自行決定，只要最終 `claude` 指令可被執行即可：

```bash
# 範例 A：全域安裝（傳統做法）
npm install -g @anthropic-ai/claude-code

# 範例 B：專案內安裝（搭配 npx）
npm install @anthropic-ai/claude-code
# 之後以 npx claude ... 呼叫，或將 ./node_modules/.bin 加入 PATH
```

認證方式：
```bash
# 首次使用會自動引導 OAuth 登入
# 或使用 long-lived token
claude setup-token
```
