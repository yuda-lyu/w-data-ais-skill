---
name: dispatch-agents
description: This skill should be used when the user asks to "dispatch to all agents", "ask all three", "run claude codex gemini together", "multi-agent consensus", "let all agents do it", "三個一起跑", "全部派出去", or needs to dispatch the same task to Claude, Codex, and Gemini simultaneously and consolidate their results.
---

# dispatch-agents — 同時派出 Claude / Codex / Gemini 三大 Agent

## 概述

此 skill 教導調度 AI 如何將使用者的詢問、要求或任務，**同時**透過 `dispatch-cli` 派出
Claude、Codex、Gemini 三個 agent 平行執行，全部使用**最強模型 + 最強思考深度**，
再由調度 AI 彙整三方結果後回傳給使用者。

**核心調用層：** 使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

## 何時使用此 Skill

- 使用者要求「三個一起跑」、「全部派出去」、「讓所有 agent 處理」
- 需要多方觀點比對、交叉驗證、共識決策
- 高重要性任務，需要多個 AI 各自獨立分析後彙整

## 三大 Agent 最強配置

| Agent | 最強模型 | 最強思考深度 | 自動核准旗標 |
|-------|---------|-------------|-------------|
| **Claude** | `claude-opus-4-7`（2026-04 新旗艦，1M context） | `--effort max`（絕對最深，無 token 上限） | `--dangerously-skip-permissions` |
| **Codex** | `gpt-5.5`（2026-04-23 OpenAI 最新旗艦，Codex 官方推薦首選） | `--config model_reasoning_effort='"xhigh"'`（**Codex 無 `max` 等級，`xhigh` 即最深**） | `--full-auto` |
| **Gemini** | `gemini-3.1-pro-preview` | **CLI 目前無 thinking flag**（內部由 `DEFAULT_THINKING_MODE=8192` 控管，模型自行決定） | `--approval-mode=yolo` |

> **各 agent 思考深度的差異**：
> - **Claude**：`max`（最深）＞ `xhigh`（Opus 4.7 專屬中間級，v2.1.111+）＞ `high` ＞ `medium` ＞ `low`
> - **Codex**：`xhigh`（最深）＞ `high` ＞ `medium` ＞ `low` ＞ `minimal` ＞ `none`（無 `max` 等級）
> - **Gemini**：無公開的深度控制選項
>
> **Fallback 規則**：若模型不可用（429 / 無權限 / 帳戶未開通），退回：
> - Claude：`claude-opus-4-7` → `claude-opus-4-6`（Opus 4.6 仍支援 `--effort max`）
> - Codex：`gpt-5.5` → `gpt-5.4` → `gpt-5.3-codex` / `gpt-5.2`（皆支援 `xhigh`）
>   - ⚠️ `gpt-5.5` 目前**僅 ChatGPT 登入**可用，API key 認證環境請改用 `gpt-5.4`
> - Gemini：`gemini-3.1-pro-preview` → `gemini-2.5-pro`

## 執行流程

```
使用者提問 / 交辦任務
        │
        ▼
   ┌─ 調度 AI 接收 ─┐
   │                 │
   │  同時派出 3 個   │
   │  背景任務        │
   │                 │
   ├─► Claude agent  ──► result_claude.txt
   ├─► Codex agent   ──► result_codex.txt
   └─► Gemini agent  ──► result_gemini.txt
                         │
                         ▼
                  調度 AI 讀取三方結果
                         │
                         ▼
                  彙整 → 回傳使用者
```

## Step 1: 平行派出三個 Agent

調度 AI 需同時啟動三個背景任務。每個任務的 prompt 須包含：
1. 使用者的原始問題/任務（完整轉述）
2. 明確的輸出路徑指示

### Claude Agent

```bash
CLI_TIMEOUT_MS=3600000 CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --dangerously-skip-permissions \
  --model claude-opus-4-7 --effort max \
  "【任務】{使用者的任務描述}

請將完整結果寫入檔案: {輸出目錄}/result_claude.txt"
```

### Codex Agent

```bash
CLI_TIMEOUT_MS=3600000 CLI_CWD="{工作目錄}" CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  codex exec --full-auto --skip-git-repo-check \
  --config sandbox_workspace_write.network_access=true \
  --config model_reasoning_effort='"xhigh"' \
  -m gpt-5.5 \
  "【任務】{使用者的任務描述}

請將完整結果寫入檔案: {輸出目錄}/result_codex.txt"
```

### Gemini Agent

```bash
CLI_TIMEOUT_MS=3600000 CLI_CWD="{工作目錄}" CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo \
  -m gemini-3.1-pro-preview \
  -p "【任務】{使用者的任務描述}

請將完整結果寫入檔案: {輸出目錄}/result_gemini.txt"
```

> **三個任務必須以背景方式同時啟動**（使用 `run_in_background: true` 或平台對應的並行機制），
> 不可依序等待，否則會浪費大量時間。
>
> **超時必須給足：** 三個 agent 都使用最強模型與最深思考模式，複雜任務耗時難以預估。
> 統一設定 `CLI_TIMEOUT_MS=3600000`（1 小時），確保不會中途被強制中斷、前功盡棄。

## Step 2: 等待全部完成

三個背景任務都完成通知後，調度 AI 讀取三個結果檔案：

- `{輸出目錄}/result_claude.txt`
- `{輸出目錄}/result_codex.txt`
- `{輸出目錄}/result_gemini.txt`

> 若某個 agent 失敗（超時或錯誤），直接從 dispatch-cli 的回傳值取得 stdout/stderr，
> 在彙整時標記該 agent 失敗原因，不阻塞其他 agent 的結果。

## Step 3: 彙整回傳

調度 AI 讀取三方結果後，進行彙整：

### 彙整原則

1. **共識優先**：三方一致的結論直接採用
2. **分歧標示**：若觀點不同，列出各方觀點並說明差異
3. **互補整合**：各 agent 可能從不同角度切入，取長補短
4. **來源標註**：重要結論標注來自哪個 agent

### 彙整格式範例

```
## 彙整結果

### 三方共識
- [共識結論 1]
- [共識結論 2]

### 各 Agent 獨特觀點
- **Claude**: [Claude 獨有的分析]
- **Codex**: [Codex 獨有的分析]
- **Gemini**: [Gemini 獨有的分析]

### 分歧之處（如有）
- [議題]: Claude 認為 X，Codex 認為 Y，Gemini 認為 Z

### 綜合建議
[調度 AI 基於三方結果的最終建議]
```

## 模組匯入（程式化調用）

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const task = '分析此專案的效能瓶頸並提出優化方案';
const outDir = 'd:/tmp/agents';

// 同時啟動三個 agent
const [claude, codex, gemini] = await Promise.all([
    runCli('claude', [
        '-p', '--dangerously-skip-permissions',
        '--model', 'claude-opus-4-7', '--effort', 'max',
        `【任務】${task}\n\n請將完整結果寫入檔案: ${outDir}/result_claude.txt`,
    ], { timeoutMs: 3_600_000, maxRetries: 1 }),

    runCli('codex', [
        'exec', '--full-auto', '--skip-git-repo-check',
        '--config', 'sandbox_workspace_write.network_access=true',
        '--config', 'model_reasoning_effort="xhigh"',
        '-m', 'gpt-5.5',
        `【任務】${task}\n\n請將完整結果寫入檔案: ${outDir}/result_codex.txt`,
    ], { timeoutMs: 3_600_000, maxRetries: 1 }),

    runCli('gemini', [
        '--approval-mode=yolo',
        '-m', 'gemini-3.1-pro-preview',
        '-p', `【任務】${task}\n\n請將完整結果寫入檔案: ${outDir}/result_gemini.txt`,
    ], { timeoutMs: 3_600_000, maxRetries: 1, cwd: process.cwd() }),
]);

// 彙整結果
const results = { claude, codex, gemini };
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
- 命名慣例：`result_claude.txt`、`result_codex.txt`、`result_gemini.txt`
- 若 agent 未成功寫入檔案，則從 dispatch-cli 回傳的 `stdout` 取得輸出

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 某個 agent 超時 | 任務極端複雜超過 1 小時 | 已預設 1 小時（3600000ms），若仍不足可先彙整已完成的結果 |
| 三個 agent 依序執行 | 未使用平行/背景執行 | 確保三個任務同時啟動（`run_in_background` / `Promise.all`） |
| 結果檔案不存在 | agent 未遵從寫檔指示 | 改從 dispatch-cli 回傳的 `stdout` 讀取結果 |
| Gemini 工作目錄錯誤 | 未設定 `CLI_CWD` | Gemini 依賴工作目錄，必須透過 `CLI_CWD` 指定 |

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `3600000` | 最強模型 + 最深思考，統一給 1 小時，確保複雜任務不會中斷 |
| `CLI_MAX_RETRIES` | `1` | 暫時性錯誤可重試一次（含初始請求最多執行 2 次） |
| `CLI_VALIDATE` | `nonempty` | 確保有實際輸出 |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

三個 CLI 皆須已安裝：

```bash
claude --version   # Claude Code CLI
codex --version    # OpenAI Codex CLI
gemini --version   # Google Gemini CLI
```

若未安裝：
```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
```
