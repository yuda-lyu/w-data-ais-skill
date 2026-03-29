---
name: dispatch-claude
description: This skill should be used when the user asks to "run claude as an agent", "call claude", "use claude cli as agent", "create claude agent", "multi-agent with claude", "dispatch task to claude", "launch claude", or needs to drive Claude Code CLI as a subprocess agent within a multi-agent workflow.
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
# 基本呼叫
node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  "你的任務描述"

# 完整防護：超時 + JSON 驗證 + 回合限制 + 重試
CLI_TIMEOUT_MS=120000 CLI_VALIDATE=json CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --output-format json --max-turns 10 \
  "你的任務描述"

# 從檔案傳入 prompt（取代 shell pipe，避免 stdin 問題）
CLI_TIMEOUT_MS=180000 CLI_INPUT_FILE=prompt.txt \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions --output-format json

# 指定模型
CLI_TIMEOUT_MS=120000 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-opus-4-6 \
  "你的任務描述"

# 只核准特定工具（更安全的替代方案）
node dispatch-cli/scripts/run_cli.mjs \
  claude -p --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
  --model claude-opus-4-6 \
  "你的任務描述"
```

### 模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const result = runCli('claude', [
    '-p', '--dangerously-skip-permissions',
    '--output-format', 'json',
    '--max-turns', '10',
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
| `claude-opus-4-6` | `opus` | **預設模型**，旗艦級，最強推理能力 |
| `claude-sonnet-4-6` | `sonnet` | 平衡性能與速度 |
| `claude-haiku-4-5` | `haiku` | 最快速、最低成本 |

指定模型：`--model claude-opus-4-6` 或 `--model opus`（不指定即使用帳號預設模型）

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `-p` / `--print` | ✅ | 非互動/headless 模式，輸出回應後退出 |
| `--dangerously-skip-permissions` | ✅ | 跳過所有權限確認，自動核准全部操作（僅建議用於受控環境） |
| `--model <model>` | 建議 | 指定模型，可用別名（`opus`/`sonnet`/`haiku`）或完整 ID |
| `--output-format <format>` | 建議 | 輸出格式：`text`（預設）、`json`、`stream-json` |
| `--max-turns <n>` | 建議 | 限制工具呼叫回合數，防止無限迴圈 |
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
| `--bare` | 跳過 hooks/skills/plugins/MCP/CLAUDE.md 載入（CI/CD 推薦） |
| `--append-system-prompt "..."` | 追加額外系統提示 |
| `--system-prompt "..."` | 完全替換系統提示 |
| `--json-schema '{...}'` | 強制回應符合 JSON Schema（需搭配 `--output-format json`） |
| `--fallback-model sonnet` | 主模型過載時自動切換到備援模型 |
| `--add-dir <path>` | 允許存取額外目錄 |
| `--mcp-config ./mcp.json` | 載入外部 MCP 伺服器工具 |

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 卡住等待權限確認 | 未使用自動核准旗標 | 加上 `--dangerously-skip-permissions` 或 `--allowedTools` |
| 模型找不到 | 模型 ID 或別名拼寫錯誤 | 使用 `opus`、`sonnet`、`haiku` 別名或完整 ID |
| 認證失敗 | 未登入或 token 過期 | 執行 `claude auth` 檢查認證狀態 |
| 回應被截斷 | 超過預設回合數 | 加上 `--max-turns 30` 提高上限 |
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
         claude -p --dangerously-skip-permissions --model claude-opus-4-6 \
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

```bash
claude --version   # 確認 claude code 已安裝
claude auth        # 確認認證狀態
```

若未安裝，請執行：
```bash
npm install -g @anthropic-ai/claude-code
```

認證方式：
```bash
# 首次使用會自動引導 OAuth 登入
# 或使用 long-lived token
claude setup-token
```
