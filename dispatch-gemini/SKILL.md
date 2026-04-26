---
name: dispatch-gemini
description: This skill should be used when the user asks to "run gemini as an agent", "call gemini", "use gemini cli as agent", "create gemini agent", "multi-agent with gemini", "dispatch task to gemini", "launch gemini", or needs to drive Google Gemini CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-gemini — 以 Gemini CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 Google Gemini CLI (`gemini`) 作為獨立 agent 執行，
實現調度 AI ＋ Gemini agent 混合的多 agent 工作流程。

**核心調用層：** 使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

> 📖 完整 CLI 旗標參考請見 [references/gemini-flags.md](references/gemini-flags.md)

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 Gemini agent 執行任務
- 需要利用 Gemini 進行程式碼生成、npm/pip 安裝等需要網路的工作
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 透過 dispatch-cli 調用（推薦）

### 命令列

```bash
# 基本呼叫（CLI_CWD 取代 cd，更安全；預設最強 preview 模型）
CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo -m gemini-3.1-pro-preview -p "你的任務描述"

# 完整防護：超時 + 重試 + 最強模型 + JSON 輸出
CLI_TIMEOUT_MS=300000 CLI_MAX_RETRIES=1 CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo -m gemini-3.1-pro-preview \
  -o json -p "你的任務描述"

# 指定穩定版模型（無 preview 存取權時的 fallback）
CLI_TIMEOUT_MS=180000 CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo -m gemini-2.5-pro -p "你的任務描述"
```

> 上述路徑為相對路徑範例，實際執行時請依執行環境自行調整路徑。

> **重要：** Gemini CLI 以當前工作目錄作為專案路徑，無 `--workdir` 參數。
> 使用 `CLI_CWD` 環境變數透過 dispatch-cli 設定，取代 `cd && gemini` 的 shell 串接方式。

### 模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const result = await runCli('gemini', [
    '--approval-mode=yolo',
    '-m', 'gemini-3.1-pro-preview',
    '-p', '分析此專案架構並產出報告',
], {
    timeoutMs: 180_000,
    cwd: '/path/to/project',   // 取代 cd
});

if (result.ok) {
    console.log(result.stdout);
} else {
    console.error(`Gemini 呼叫失敗: ${result.error}`);
}
```

## 模型選擇

### Preview 系列（最新前沿）

| 模型 ID | 別名 | 說明 |
|---------|------|------|
| `gemini-3.1-pro-preview` | `pro` | **最強旗艦**，進階推理 + agentic/vibe coding 能力 |
| `gemini-3.1-flash-lite-preview` | — | 高效能輕量 preview 版 |

### Stable 系列（生產環境推薦）

| 模型 ID | 別名 | 說明 |
|---------|------|------|
| `gemini-2.5-pro` | — | 最強穩定版，複雜推理任務 |
| `gemini-2.5-flash` | `flash` | 最佳性價比，低延遲高吞吐 |
| `gemini-2.5-flash-lite` | `flash-lite` | 最快速、最省成本 |

> ⚠️ 注意：`gemini-3-pro-preview`（v3.0）已於 2026-03-09 關閉。
> `gemini-3.1-pro-preview`（v3.1）為不同版本，目前仍可使用。

### CLI 預設行為（Auto 模式）

不指定 `-m` 時，CLI 使用 **Auto (Gemini 3)** 路由策略：

| 任務複雜度 | 自動路由到 |
|-----------|-----------|
| 簡單任務 | Gemini 2.5 Flash |
| 複雜任務 | Gemini 3 Pro |

> Auto 模式**不會**自動選用 3.1 Pro Preview。若需最強模型，須顯式指定 `-m gemini-3.1-pro-preview`。

### 思考模式（Thinking）

Gemini 3.x / 2.5 系列模型內建推理能力，API 層面支援 `thinkingBudget` 參數（0~24576，-1 = 動態）。
**Gemini CLI 目前仍無 `--thinking-budget` / `--effort` 類 CLI flag**（已向原始碼 `packages/cli/src/config/config.ts` 確認，2026-04 最新版亦無）。思考深度由模型自行判斷，無法透過命令列控制；內部上限由 `DEFAULT_THINKING_MODE = 8192` 控管，避免 runaway thinking。

指定模型：`-m gemini-3.1-pro-preview`（不指定則使用 Auto 路由，Auto **不會**自動選用 3.1 Pro Preview）

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `CLI_CWD`（dispatch-cli） | ✅ | Gemini 以當前目錄為工作路徑，透過 dispatch-cli 的 `cwd` 設定 |
| `--approval-mode=yolo` | ✅ | 自動核准所有工具操作，不需人工確認 |
| `-y` / `--yolo` | 替代 | 穩定快速鍵，等同 `--approval-mode=yolo`（與 `--approval-mode` 互斥，兩者只能擇一） |
| `-p "prompt"` | ✅ | 非互動/headless 模式，直接執行單一任務後退出 |
| `-m <model>` | 建議 | 顯式指定模型以確保使用最強（未指定時走 Auto 路由） |
| `-o <format>` | 可選 | `text`（預設）/ `json` / `stream-json`（JSONL 事件流） |
| `--sandbox` / `-s` | ❌ 避免 | 會限制網路存取，導致 npm install 失敗 |

> **與 Codex 的差異**：Gemini 預設可連網，不需額外網路旗標；工作目錄靠 `CLI_CWD` / `cwd` 設定。

### Headless 退出碼

| 退出碼 | 意義 |
|--------|------|
| `0` | 成功 |
| `1` | 一般 / API 錯誤 |
| `42` | 輸入錯誤 |
| `53` | 超過回合上限 |

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| npm install 失敗 | 誤加了 `--sandbox` | 移除 `--sandbox` |
| 任務在錯誤目錄執行 | 未設定 `CLI_CWD` / `cwd` | 設定 `CLI_CWD` 環境變數或 `cwd` 選項 |
| 等待人工確認而卡住 | 缺少自動核准參數 | 加上 `--approval-mode=yolo` 或 `--yolo`（兩者擇一，不可同時使用） |

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `180000`～`300000` | Gemini 含工具執行時間，建議至少 3 分鐘；使用 3.1 Pro Preview 建議 300000 |
| `CLI_CWD` | 專案絕對路徑 | **必要**，Gemini 依賴工作目錄定位專案 |
| `CLI_VALIDATE` | `nonempty` | 確保有實際輸出 |
| `CLI_MAX_RETRIES` | `1` | OAuth token 過期等暫時性錯誤可重試（含初始請求最多執行 2 次） |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 Gemini agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# Gemini agent — 透過 dispatch-cli（背景執行）
command: CLI_TIMEOUT_MS=180000 CLI_CWD=/path/to/project \
         node dispatch-cli/scripts/run_cli.mjs \
         gemini --approval-mode=yolo -p "... 寫入 result_gemini.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`gemini_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/wk/gemini/result.txt`

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

```bash
gemini --version   # 確認 gemini-cli 已安裝
```

若未安裝，請依執行環境自行決定安裝方式。安裝**位置**由執行 AI 自行決定，只要最終 `gemini` 指令可被執行即可：

```bash
# 範例 A：全域安裝
npm install -g @google/gemini-cli

# 範例 B：專案內安裝（搭配 npx）
npm install @google/gemini-cli
# 之後以 npx gemini ... 呼叫
```

需通過 Google OAuth 認證（初次使用時互動登入），或設定 API Key：
```bash
export GEMINI_API_KEY=your_key_here
```

> **Headless / CI 環境**：`--approval-mode=yolo` 為非互動模式，無法進行 OAuth 互動登入。請事先在本機完成 OAuth 認證（憑證會快取），或改用 `GEMINI_API_KEY` 環境變數。
