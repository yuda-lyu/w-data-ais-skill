---
name: dispatch-agents
description: This skill should be used when the user asks to "dispatch to all agents", "ask both", "run claude and codex together", "multi-agent consensus", "let all agents do it", "兩個一起跑", "全部派出去", or needs to dispatch the same task to Claude and Codex simultaneously and consolidate their results.
---

# dispatch-agents — 同時派出 Claude / Codex 兩大 Agent

## 概述

此 skill 教導調度 AI 如何將使用者的詢問、要求或任務，**同時**透過 `dispatch-cli` 派出
Claude、Codex 兩個 agent 平行執行，全部使用**最強模型 + 最強思考深度**，
再由調度 AI 彙整雙方結果後回傳給使用者。

> **需要 Gemini 後端時**：gemini CLI 已於 2026-06-18 停服，請改用 `dispatch-antigravity`（`agy`）作為第三方 agent 自行加入流程。

**核心調用層：** 使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

## 何時使用此 Skill

- 使用者要求「兩個一起跑」、「全部派出去」、「讓所有 agent 處理」
- 需要多方觀點比對、交叉驗證、共識決策
- 高重要性任務，需要多個 AI 各自獨立分析後彙整

## 兩大 Agent 最強配置

| Agent | 最強模型 | 最強思考深度 | 自動核准旗標 |
|-------|---------|-------------|-------------|
| **Claude** | `claude-fable-5`（Mythos 級最強模型，Claude 5 家族，位階高於 Opus；需 CLI v2.1.170+；API 上原生 1M context） | `--effort max`（絕對最深，無 token 上限；Fable 5 原廠預設只有 `high`，必須顯式傳入） | `--dangerously-skip-permissions` |
| **Codex** | `gpt-5.6-sol`（GPT-5.6 三階旗艦 frontier，372K context） | `--config model_reasoning_effort='"max"'`（最深單任務推理；Sol 另有 `ultra`＝max 推理＋自動子代理派工） | `--sandbox workspace-write`（v0.144.x 起取代已棄用的 `--full-auto`） |

> **各 agent 思考深度的差異**：
> - **Claude**：`max`（最深）＞ `xhigh` ＞ `high`（Fable 5 / Opus 4.8 原廠預設）＞ `medium` ＞ `low`；Fable 5 全五級支援
> - **Codex**：`ultra`（Sol 專屬執行模式：max 推理＋自動子代理）＞ `max`（最深單任務推理，本 skill 預設）＞ `xhigh` ＞ `high` ＞ `medium` ＞ `low` ＞ `minimal` ＞ `none`
>
> **Fallback 規則**：若模型不可用（429 / 無權限 / 帳戶未開通），退回：
> - Claude：`claude-fable-5` → `claude-opus-4-8` → `claude-opus-4-7`（Opus 4.6/4.7/4.8 皆支援 `--effort max`；也可掛 `--fallback-model opus` 讓 CLI 於過載時自動退）
>   - 另注意：Fable 5 對 cybersecurity / biology 類請求觸發安全分類器時，CLI 會自動改用 Opus 4.8 完成該請求（預期路由非錯誤）
> - Codex：`gpt-5.6-sol` → `gpt-5.6-terra` → `gpt-5.6-luna`（三者皆支援 `max`；v0.144.3 bundled 型錄 free～enterprise 全 plan 可用，舊 `gpt-5.5` / `gpt-5.4` 已自型錄移除）

## 執行流程

```
使用者提問 / 交辦任務
        │
        ▼
   ┌─ 調度 AI 接收 ─┐
   │                 │
   │  同時派出 2 個   │
   │  背景任務        │
   │                 │
   ├─► Claude agent  ──► result_claude.txt
   └─► Codex agent   ──► result_codex.txt
                         │
                         ▼
                  調度 AI 讀取雙方結果
                         │
                         ▼
                  彙整 → 回傳使用者
```

## Step 1: 平行派出兩個 Agent

調度 AI 需同時啟動兩個背景任務。每個任務的 prompt 須包含：
1. 使用者的原始問題/任務（完整轉述）
2. 明確的輸出路徑指示

> ⚠ **跨 shell 環境變數寫法**：下方兩個 agent 範例皆以「在命令前 `VAR=value` 設定環境變數」的前綴寫法書寫（皆含 `CLI_TIMEOUT_MS`、`CLI_MAX_RETRIES`；Codex 範例另含 `CLI_CWD`，Claude 範例則無），為 **bash／zsh／Git Bash 專用**。Windows 的 PowerShell 會 parse error、cmd 不適用，須改寫（下列一併示範含 `CLI_CWD` 的情形）：
> - **bash／zsh／Git Bash**：維持既有前綴寫法 `CLI_TIMEOUT_MS=3600000 CLI_CWD="..." CLI_MAX_RETRIES=1 node dispatch-cli/scripts/run_cli.mjs ...`。
> - **PowerShell**：先以 `$env:` 設定再執行 —— `$env:CLI_TIMEOUT_MS='3600000'; $env:CLI_CWD='C:\path\to\project'; $env:CLI_MAX_RETRIES='1'; node dispatch-cli/scripts/run_cli.mjs ...`。
> - **cmd.exe**：以 `set` 設定再以 `&&` 串接 —— `set CLI_TIMEOUT_MS=3600000 && set CLI_CWD=C:\path\to\project && set CLI_MAX_RETRIES=1 && node dispatch-cli/scripts/run_cli.mjs ...`。
> - **程式化呼叫不受影響**：改用下方「模組匯入（程式化調用）」段的 `runCli(...)` + JS options 物件（如 `{ timeoutMs: 3_600_000, maxRetries: 1, cwd: '...' }`）時，不經 shell、無此差異。

### Claude Agent

```bash
CLI_TIMEOUT_MS=3600000 CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-fable-5 --effort max \
  "【任務】{使用者的任務描述}

請將完整結果寫入檔案: {輸出目錄}/result_claude.txt"
```

### Codex Agent

```bash
CLI_TIMEOUT_MS=3600000 CLI_CWD="{工作目錄}" CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  codex exec --sandbox workspace-write --skip-git-repo-check \
  --config sandbox_workspace_write.network_access=true \
  --config model_reasoning_effort='"max"' \
  -m gpt-5.6-sol \
  "【任務】{使用者的任務描述}

請將完整結果寫入檔案: {輸出目錄}/result_codex.txt"
```

> **兩個任務必須以背景方式同時啟動**（使用 `run_in_background: true` 或平台對應的並行機制），
> 不可依序等待，否則會浪費大量時間。
>
> **超時必須給足：** 兩個 agent 都使用最強模型與最深思考模式，複雜任務耗時難以預估。
> 統一設定 `CLI_TIMEOUT_MS=3600000`（1 小時），確保不會中途被強制中斷、前功盡棄。

## Step 2: 等待全部完成

兩個背景任務都完成通知後，調度 AI 讀取兩個結果檔案：

- `{輸出目錄}/result_claude.txt`
- `{輸出目錄}/result_codex.txt`

> 若某個 agent 失敗（超時或錯誤），直接從 dispatch-cli 的回傳值取得 stdout/stderr，
> 在彙整時標記該 agent 失敗原因，不阻塞其他 agent 的結果。

## Step 3: 彙整回傳

調度 AI 讀取雙方結果後，進行彙整：

### 彙整原則

1. **共識優先**：雙方一致的結論直接採用
2. **分歧標示**：若觀點不同，列出各方觀點並說明差異
3. **互補整合**：各 agent 可能從不同角度切入，取長補短
4. **來源標註**：重要結論標注來自哪個 agent

### 彙整格式範例

```
## 彙整結果

### 雙方共識
- [共識結論 1]
- [共識結論 2]

### 各 Agent 獨特觀點
- **Claude**: [Claude 獨有的分析]
- **Codex**: [Codex 獨有的分析]

### 分歧之處（如有）
- [議題]: Claude 認為 X，Codex 認為 Y

### 綜合建議
[調度 AI 基於雙方結果的最終建議]
```

## 模組匯入（程式化調用）

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const task = '分析此專案的效能瓶頸並提出優化方案';
const outDir = 'd:/tmp/agents';

// 同時啟動兩個 agent
const [claude, codex] = await Promise.all([
    runCli('claude', [
        '-p', '--dangerously-skip-permissions',
        '--model', 'claude-fable-5', '--effort', 'max',
        `【任務】${task}\n\n請將完整結果寫入檔案: ${outDir}/result_claude.txt`,
    ], { timeoutMs: 3_600_000, maxRetries: 1 }),

    runCli('codex', [
        'exec', '--sandbox', 'workspace-write', '--skip-git-repo-check',
        '--config', 'sandbox_workspace_write.network_access=true',
        '--config', 'model_reasoning_effort="max"',
        '-m', 'gpt-5.6-sol',
        `【任務】${task}\n\n請將完整結果寫入檔案: ${outDir}/result_codex.txt`,
    ], { timeoutMs: 3_600_000, maxRetries: 1, cwd: process.cwd() }),
]);

// 彙整結果
const results = { claude, codex };
for (const [name, r] of Object.entries(results)) {
    if (r.ok) {
        console.log(`✓ ${name}: 成功 (${r.durationMs}ms)`);
    } else {
        console.error(`✗ ${name}: ${r.error}`);
    }
}
```

## 輸出結構建議

- 輸出目錄建議使用臨時路徑，例如 `d:/tmp/wk/agents/` 或專案內的暫存目錄
- 命名慣例：`result_claude.txt`、`result_codex.txt`
- 若 agent 未成功寫入檔案，則從 dispatch-cli 回傳的 `stdout` 取得輸出

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 某個 agent 超時 | 任務極端複雜超過 1 小時 | 已預設 1 小時（3600000ms），若仍不足可先彙整已完成的結果 |
| 兩個 agent 依序執行 | 未使用平行/背景執行 | 確保兩個任務同時啟動（`run_in_background` / `Promise.all`） |
| 結果檔案不存在 | agent 未遵從寫檔指示 | 改從 dispatch-cli 回傳的 `stdout` 讀取結果 |
| Codex 工作目錄錯誤 | 未設定 `CLI_CWD` | Codex 依賴工作目錄，必須透過 `CLI_CWD` 指定 |

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `3600000` | 最強模型 + 最深思考，統一給 1 小時，確保複雜任務不會中斷 |
| `CLI_MAX_RETRIES` | `1` | 暫時性錯誤可重試一次（含初始請求最多執行 2 次） |
| `CLI_VALIDATE` | （不設） | 結果寫入 `result_*.txt`，不要用 `CLI_VALIDATE=nonempty` 驗 stdout（stdout 可能為空）；如需驗證請由技能層自行確認 `result_*.txt` 是否存在/非空 |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

> 本技能透過 dispatch-cli 執行，請先依 dispatch-cli 技能的安裝指引安裝其 npm 依賴（wsemi、lodash-es）。

兩個 CLI 皆須已安裝：

```bash
claude --version   # Claude Code CLI（Fable 5 需 ≥ v2.1.170，過舊先 claude update）
codex --version    # OpenAI Codex CLI（gpt-5.6 型錄 + max 推理需 v0.144.x+）
```

若未安裝，請依執行環境自行決定安裝方式。安裝**位置**由執行 AI 自行決定（全域、專案內、或其他套件管理器），只要最終兩條指令可被執行即可：

```bash
# 範例 A：全域安裝（傳統做法）
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex

# 範例 B：專案內安裝（搭配 npx）
npm install @anthropic-ai/claude-code @openai/codex
# 之後以 npx claude / npx codex 呼叫
```
