---
name: dispatch-codex
description: This skill should be used when the user asks to "run codex as an agent", "call codex", "use codex cli as agent", "create codex agent", "multi-agent with codex", "dispatch task to codex", "launch codex", or needs to drive OpenAI Codex CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-codex — 以 Codex CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 OpenAI Codex CLI (`codex exec`) 作為獨立 agent 執行，
實現調度 AI ＋ Codex agent 混合的多 agent 工作流程。

**核心調用層：** 使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

> 📖 完整 CLI 旗標參考請見 [references/codex-flags.md](references/codex-flags.md)

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 Codex agent 執行任務
- 需要利用 Codex 進行程式碼生成、npm/pip 安裝等需要網路的工作
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 透過 dispatch-cli 調用（推薦）

### 命令列

```bash
# 基本呼叫（預設最強模型 + 最強推理）
node dispatch-cli/scripts/run_cli.mjs \
  codex exec --sandbox workspace-write --skip-git-repo-check \
  -m gpt-5.6-sol \
  --config sandbox_workspace_write.network_access=true \
  --config model_reasoning_effort='"max"' \
  "你的任務描述"

# 完整防護：超時 + 重試
CLI_TIMEOUT_MS=180000 CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  codex exec --sandbox workspace-write --skip-git-repo-check \
  -m gpt-5.6-sol \
  --config sandbox_workspace_write.network_access=true \
  --config model_reasoning_effort='"max"' \
  "你的任務描述"

# 回退到均衡模型（Sol 過載 / 429 / 額度受限時）
CLI_TIMEOUT_MS=180000 \
  node dispatch-cli/scripts/run_cli.mjs \
  codex exec --sandbox workspace-write --skip-git-repo-check \
  -m gpt-5.6-terra \
  --config sandbox_workspace_write.network_access=true \
  --config model_reasoning_effort='"max"' \
  "你的任務描述"
```

> 上述路徑為相對路徑範例，實際執行時請依執行環境自行調整路徑。
>
> ⚠ 上述範例中的 `CLI_TIMEOUT_MS=180000 CLI_MAX_RETRIES=1 node ...` 環境變數前綴寫法為 **bash／zsh／Git Bash 專用**。Windows（PowerShell／cmd）請見下方「[推理等級](#推理等級model_reasoning_effort) → 跨 shell 差異提醒」的環境變數對應寫法。

### 模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const result = await runCli('codex', [
    'exec', '--sandbox', 'workspace-write', '--skip-git-repo-check',
    '-m', 'gpt-5.6-sol',
    '--config', 'sandbox_workspace_write.network_access=true',
    '--config', 'model_reasoning_effort="max"',
    '重構此模組並撰寫單元測試',
], {
    timeoutMs: 180_000,
});

if (result.ok) {
    console.log(result.stdout);
} else {
    console.error(`Codex 呼叫失敗: ${result.error}`);
}
```

## 模型選擇

| 模型 ID | 說明 |
|---------|------|
| `gpt-5.6-sol` | **預設模型**，GPT-5.6 三階中的旗艦（frontier，priority 1），官方定位 complex coding / computer use / research / cybersecurity 等高難度開放式任務；372K context；唯一支援 `ultra` 推理檔 |
| `gpt-5.6-terra` | 均衡日常主力（priority 2），372K context；Sol 過載時的第一備援 |
| `gpt-5.6-luna` | 快速低成本（priority 3），372K context；明確、可重複的量產型工作 |

指定模型：`-m gpt-5.6-sol`（本 skill 預設；備援依序 `-m gpt-5.6-terra` → `-m gpt-5.6-luna`）

> 模型型錄來源：[codex-rs/models-manager/models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)（CLI v0.144.3 bundled 型錄實證：僅含 gpt-5.6 三階，free～enterprise 全 plan 可用；舊 `gpt-5.5` / `gpt-5.4` / `gpt-5.3-codex` / `gpt-5.2` 已自型錄移除，不再是建議選項）。

## 推理等級（model_reasoning_effort）

| 等級 | 說明 |
|------|------|
| `ultra` | **GPT-5.6-Sol 專屬最高檔**：max 級推理＋自動子代理派工（automatic task delegation），適合可平行拆解的巨型任務；消耗與時長顯著上升 |
| **`max`** | **本 skill 預設，最深單任務推理**，GPT-5.6 全系（sol / terra / luna）皆支援 |
| `xhigh` | 延伸推理（0.12x 時代的最深檔，現已非最深） |
| `high` | 複雜除錯、架構決策、程式碼審查 |
| `medium` | Codex 原廠預設，平衡速度與品質 |
| `low` | 簡單任務，速度優先 |
| `minimal` | 最快，適合提取、路由、簡單轉換 |
| `none` | 完全不進行推理 |

指定推理等級：`--config model_reasoning_effort='"max"'`

> 本 skill 預設使用 `max` 最深單任務推理。Codex CLI v0.144.3 的 `ReasoningEffort` enum 為八階＋自訂（`None`/`Minimal`/`Low`/`Medium`/`High`/`XHigh`/`Max`/`Ultra`/`Custom(String)`，原始碼 `codex-rs/protocol/src/openai_models.rs` @ rust-v0.144.3 確認）；bundled 型錄 `models.json` 標注 gpt-5.6 全系支援至 `max`、`ultra` 為 Sol 專屬。若需加速可降級為 `xhigh` / `high`。
> `ultra` 屬「執行模式」而非單純更深思考——會自動展開子代理平行派工；官方文件另註記 Max/Ultra 在部分入口需於 app 設定啟用。headless `codex exec` 下若 `ultra` 不生效，退回 `max` 即可（此點未實跑驗證，僅依官方文件與原始碼標注，需實測確認）。
>
> **跨 shell 差異提醒**：本節命令列範例（含上方各 `node dispatch-cli/...` 範例）皆以 bash／zsh／Git Bash 語法書寫，含兩處需依 shell 調整的寫法：「引號跳脫」與「環境變數前綴」。Windows 使用者照抄會失敗，請改用對應寫法。
>
> **(1) 引號跳脫**：上述 `'"max"'`（外層單引號包雙引號）為 bash／zsh 寫法，需讓 codex CLI 收到帶雙引號的 TOML 字面值。
> - **PowerShell**：使用 `--config model_reasoning_effort='\"max\"'`（外層單引號內以反斜線跳脫雙引號），或改用程式化呼叫（推薦）：`spawn('codex', ['--config', 'model_reasoning_effort="max"'])`，以陣列直傳參數可繞過 shell escaping 問題。
> - **cmd.exe**：使用 `--config "model_reasoning_effort=\"max\""`。
>
> **(2) 環境變數前綴**：上述 `CLI_TIMEOUT_MS=180000 CLI_MAX_RETRIES=1 node ...`（在命令前以 `VAR=value` 設定環境變數）為 bash／zsh／Git Bash 專用語法。PowerShell 會 parse error、cmd 不適用，須改寫：
> - **bash／zsh／Git Bash**：維持既有前綴寫法 `CLI_TIMEOUT_MS=180000 CLI_MAX_RETRIES=1 node dispatch-cli/scripts/run_cli.mjs ...`。
> - **PowerShell**：先以 `$env:` 設定再執行 —— `$env:CLI_TIMEOUT_MS='180000'; $env:CLI_MAX_RETRIES='1'; node dispatch-cli/scripts/run_cli.mjs ...`。
> - **cmd.exe**：以 `set` 設定再以 `&&` 串接 —— `set CLI_TIMEOUT_MS=180000 && set CLI_MAX_RETRIES=1 && node dispatch-cli/scripts/run_cli.mjs ...`。
> - **程式化呼叫不受影響**：改用「模組匯入」段的 `runCli(...)` + JS options 物件（如 `{ timeoutMs: 180_000 }`）時，不經 shell、無此差異。

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `exec` | ✅ | 非互動/headless 模式（少了這個會出現 "stdin is not a terminal" 錯誤） |
| `--sandbox workspace-write` | ✅ | 允許在 workspace 內自動寫檔執行（**v0.144.x 起取代已棄用的 `--full-auto`**；舊旗標仍可解析但列 hidden 並印棄用警告） |
| `--skip-git-repo-check` | ✅ | 允許在非 git repo 目錄下執行（否則報錯 "Not inside a trusted directory"） |
| `--config sandbox_workspace_write.network_access=true` | ✅ | 啟用沙箱網路，讓 npm install / pip install 等可以正常使用 |
| `--config model_reasoning_effort='"max"'` | ✅ | 啟用最深推理（本 skill 預設 `max`） |

### 進階選項（近期新增旗標）

| 參數 | 說明 |
|------|------|
| `--dangerously-bypass-approvals-and-sandbox` | 跳過所有核准且停用沙箱（危險；`--yolo` 別名已不在 v0.144.x help 列出，勿再依賴） |
| `--full-auto` | **已棄用**（v0.144.x 轉為 hidden 相容旗標，執行時印警告）；一律改用 `--sandbox workspace-write` |
| `--ephemeral` | 不落地 session，用於暫時性一次性任務 |
| `--ignore-user-config` | 不載入 `$CODEX_HOME/config.toml`（認證仍會讀取） |
| `--ignore-rules` | 跳過 user/project 的 execpolicy 規則 |
| `--enable <FEATURE>` / `--disable <FEATURE>` | v0.124.0+：啟/停特定功能（可重複），等同 `-c features.<name>=true/false` |
| `--output-last-message <FILE>` / `-o` | 將最終訊息寫入檔案 |
| `--output-schema <FILE>` | 強制回應符合 JSON Schema |
| `--profile <NAME>` / `-p` | v0.144.x 起為 v2 profile 檔案制：疊加 `$CODEX_HOME/<name>.config.toml` 於基礎設定之上（舊 config.toml 內 `[profiles.x]` 段落制已改） |
| `--strict-config` | config.toml 含本版不認得的欄位時直接報錯（防設定拼錯靜默失效） |
| `--dangerously-bypass-hook-trust` | 免 hook 信任確認直接執行 hooks（危險，僅限已自行審核 hook 來源的自動化） |
| `--add-dir <DIR>` | 額外可寫入目錄（可重複） |
| `--json`（推薦）/ `--experimental-json`（舊別名） | 輸出 JSONL 事件流 |
| `codex exec resume --last` | 延續最近一次 session |
| `codex exec review` | 程式碼審查子命令（搭配 `--base`、`--commit`、`--uncommitted`） |

## 常見錯誤與處理

| 錯誤訊息 | 原因 | 解法 |
|----------|------|------|
| `stdin is not a terminal` | 用了 `codex` 而非 `codex exec` | 改用 `codex exec` |
| `Not inside a trusted directory` | 未在 git repo 內且缺少旗標 | 加上 `--skip-git-repo-check` |
| npm install 網路失敗 | 沙箱預設封鎖網路 | 加上 `--config sandbox_workspace_write.network_access=true` |
| `--full-auto is deprecated` 警告 | v0.144.x 起 `--full-auto` 轉為隱藏相容旗標 | 改用 `--sandbox workspace-write`（本 skill 範例已更新） |
| 模型找不到 / 拒收 `-m` 值 | 用了已自型錄移除的 `gpt-5.5`/`gpt-5.4` 等舊 ID，或 CLI 過舊 | 改用 `gpt-5.6-sol`（備援 terra / luna）；CLI 過舊先升級至 v0.144.x+ |

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `180000`～`300000` | Codex 含沙箱啟動時間，建議至少 3 分鐘 |
| `CLI_VALIDATE` | `nonempty` | 確保有實際輸出 |
| `CLI_MAX_RETRIES` | `1` | 沙箱啟動偶爾失敗可重試（含初始請求最多執行 2 次） |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 Codex agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# Codex agent — 透過 dispatch-cli（背景執行）
# 註：以下 CLI_TIMEOUT_MS=180000 前綴為 bash／zsh／Git Bash 專用；
#     Windows（PowerShell／cmd）的環境變數寫法請見「推理等級 → 跨 shell 差異提醒」章節。
command: CLI_TIMEOUT_MS=180000 node dispatch-cli/scripts/run_cli.mjs \
         codex exec --sandbox workspace-write --skip-git-repo-check \
         -m gpt-5.6-sol \
         --config sandbox_workspace_write.network_access=true \
         --config model_reasoning_effort='"max"' \
         "... 寫入 result_codex.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`codex_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/codex_result.txt`

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

> 本技能透過 dispatch-cli 執行，請先依 dispatch-cli 技能的安裝指引安裝其 npm 依賴（wsemi、lodash-es）。

```bash
codex --version   # 確認 codex-cli 已安裝（建議 v0.144.x+ 以使用 gpt-5.6 型錄與 max/ultra 推理；實測 0.144.6＝npm 最新）
```

若未安裝或版本過舊，請依執行環境自行決定安裝方式。安裝**位置**由執行 AI 自行決定，只要最終 `codex` 指令可被執行即可：

```bash
# 範例 A：全域安裝
npm install -g @openai/codex@latest

# 範例 B：專案內安裝（搭配 npx）
npm install @openai/codex@latest
# 之後以 npx codex ... 呼叫
```

認證方式二擇一：
- **ChatGPT 登入（推薦）**：執行 `codex login` 依引導完成 OAuth；gpt-5.6 三階（sol/terra/luna）free～enterprise 全 plan 可用
- **API Key**：
  ```bash
  export OPENAI_API_KEY=your_key_here
  ```
