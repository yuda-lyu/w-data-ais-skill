---
name: dispatch-cli
description: Generic CLI subprocess runner with timeout, process-tree cleanup, output validation, and structured error handling. Core invocation layer for dispatch-claude, dispatch-codex, dispatch-gemini, dispatch-opencode and any external CLI.
---

# dispatch-cli — 通用 CLI 子進程調用技能

## 概述

此技能提供一個**通用的 CLI 子進程調用腳本** `run_cli.mjs`，封裝了超時控制、進程樹清理、輸出驗證、結構化錯誤回報、自動重試等所有穩定性防護。對外僅匯出單一函式 `runCli()`（async），任何需要調用外部 CLI 的場景都應透過此技能執行。

> **設計原則：** 把外部 CLI 視為不可信的外部服務——它可能成功、可能失敗、可能 hang 住、可能回傳垃圾、可能產生殭屍進程。本腳本對所有情況都有明確的偵測與處理路徑。

## 何時使用此 Skill

- 需要從 Node.js 調用任何外部 CLI（claude、codex、gemini、opencode、curl、node 子腳本...）
- 需要可靠的超時控制與殭屍進程防治
- 需要統一的成功/失敗回報格式
- 作為 `dispatch-claude`、`dispatch-codex`、`dispatch-gemini`、`dispatch-opencode` 的核心調用層

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

```bash
# 無額外依賴，僅使用 Node.js 內建模組
node --version   # 需要 Node.js >= 18
```

## 使用方式

### 方式一：命令列直接調用

```bash
node dispatch-cli/scripts/run_cli.mjs <exe> [args...]
```

> 上述路徑為相對路徑範例，實際執行時請依執行環境自行調整路徑。

所有參數**原樣傳遞**給目標 CLI，支援中文：

```bash
# 調用 Claude CLI
node dispatch-cli/scripts/run_cli.mjs claude -p "請分析這段程式碼"

# 調用 node 子腳本
node dispatch-cli/scripts/run_cli.mjs node fetch-cnyes/scripts/fetch.mjs 20260328

# 調用 curl
node dispatch-cli/scripts/run_cli.mjs curl -s -L "https://example.com"

# 調用 codex
node dispatch-cli/scripts/run_cli.mjs codex exec --full-auto "重構此模組"
```

環境變數控制行為：

| 環境變數 | 預設值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `120000` | 超時毫秒數 |
| `CLI_MAX_BUFFER` | `10485760` | stdout/stderr 最大位元組（10MB） |
| `CLI_CWD` | 當前目錄 | 子進程工作目錄 |
| `CLI_INPUT` | （無） | 傳入 stdin 的內容（取代 shell pipe） |
| `CLI_INPUT_FILE` | （無） | 從檔案讀取 stdin 內容（優先於 `CLI_INPUT`） |
| `CLI_VALIDATE` | （無） | 驗證規則：`nonempty`、`json`、`min:<n>`（可用 `,` 組合） |
| `CLI_MAX_RETRIES` | `0` | 最大重試次數（含初始請求最多執行 n+1 次） |
| `CLI_RETRY_DELAY_MS` | `5000` | 重試間隔毫秒數 |
| `CLI_LOG_FILE` | （無） | 結果 log 追加至此 JSONL 檔案 |

```bash
# 帶超時 + 驗證 + 重試
CLI_TIMEOUT_MS=60000 CLI_VALIDATE=json CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs claude -p --output-format json "任務"

# 從檔案傳入 stdin
CLI_INPUT_FILE=prompt.txt CLI_TIMEOUT_MS=180000 \
  node dispatch-cli/scripts/run_cli.mjs claude -p
```

### 方式二：作為模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

// 基本呼叫
const result = await runCli('claude', ['-p', '--output-format', 'json', '請分析程式碼'], {
    timeoutMs: 120_000,
    input: '要分析的程式碼內容...',
    validate: 'json,nonempty',
});

if (result.ok) {
    const data = JSON.parse(result.stdout);
} else {
    console.error(`失敗: ${result.error}`);
    // result.stderr, result.code 可用於診斷
}

// 帶重試 + 串流輸出
const result2 = await runCli('claude', ['-p', '長程任務'], {
    timeoutMs: 300_000,
    maxRetries: 2,
    retryDelayMs: 5000,
    onStdout: (chunk) => process.stdout.write(chunk),  // 即時串流輸出
});
```

## 回傳格式

不論成功或失敗，**永遠回傳統一結構**：

```jsonc
{
    "ok": true,           // boolean — 唯一需要檢查的欄位
    "stdout": "...",      // 完整 stdout（成功時）或截斷前 500 字（失敗時）
    "stderr": "...",      // stderr 內容
    "code": 0,            // exit code（null 表示進程未正常退出）
    "error": "",          // 錯誤描述（空字串表示無錯誤）
    "durationMs": 1234    // 實際執行毫秒數
}
```

> 模組方式呼叫時，回傳物件額外包含 `pid`（子進程 PID）與 `attempts`（實際嘗試次數）。命令列模式不輸出 `pid`。

命令列模式下，此 JSON 輸出至 stdout，並以 `result.ok ? 0 : 1` 作為 exit code。

## CLI 呼叫的 6 種結局

| # | 結局 | 偵測方式 | 腳本行為 |
|---|------|----------|----------|
| 1 | 正常成功 | `exit 0` + validate 通過 | `ok: true` |
| 2 | 正常失敗 | `exit !== 0` | `ok: false`, `error: "Exit code N"` |
| 3 | 超時無回應 | timeout 觸發 | 強殺進程樹, `error: "TIMEOUT"` |
| 4 | 回傳非預期格式 | validate 失敗 | `ok: false`, `error: "OUTPUT_VALIDATION_FAILED"` |
| 5 | 進程異常 crash | `result.error`（ENOENT 等） | `ok: false`, `error: "ENOENT: ..."` |
| 6 | 殭屍進程殘留 | 進程樹追蹤 | 超時或異常時自動遞迴清理子孫進程 |

## 搭配各 AI CLI 的範例

### dispatch-claude

```bash
CLI_TIMEOUT_MS=120000 CLI_VALIDATE=json CLI_MAX_RETRIES=1 \
  node dispatch-cli/scripts/run_cli.mjs \
  claude -p --output-format json --max-turns 10 --dangerously-skip-permissions \
  "從以下新聞中選出 AI 相關的文章"
```

### dispatch-codex

```bash
CLI_TIMEOUT_MS=180000 \
  node dispatch-cli/scripts/run_cli.mjs \
  codex exec --full-auto --skip-git-repo-check \
  "重構 utils/ 目錄下的所有函式"
```

### dispatch-gemini

```bash
CLI_TIMEOUT_MS=180000 CLI_CWD=/path/to/project \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo -p "分析此專案架構"
```

### dispatch-opencode

```bash
CLI_TIMEOUT_MS=180000 \
  node dispatch-cli/scripts/run_cli.mjs \
  opencode run --agent build -m "opencode/nemotron-3-super-free" \
  "撰寫單元測試"
```

## Checklist：每次新增 CLI 呼叫時檢查

| # | 檢查項目 |
|---|----------|
| 1 | timeout 有設嗎？（不留預設 Infinity） |
| 2 | stdin 怎麼傳？（用 input，不用 shell pipe） |
| 3 | stdout 有驗證嗎？（至少 nonempty） |
| 4 | 6 種結局都有處理嗎？ |
| 5 | 失敗時走什麼 fallback？ |
| 6 | 有 log 嗎？（設 CLI_LOG_FILE） |
| 7 | 進程樹會清乾淨嗎？（本腳本自動處理） |
| 8 | 並行時有互斥嗎？ |

## 相關技能

| 技能 | 關係 |
|------|------|
| `dispatch-claude` | 使用本技能調用 `claude -p` |
| `dispatch-codex` | 使用本技能調用 `codex exec` |
| `dispatch-gemini` | 使用本技能調用 `gemini -p` |
| `dispatch-opencode` | 使用本技能調用 `opencode run` |
