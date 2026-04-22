# Gemini CLI 旗標完整參考

來源（原始碼確認，2026-04-22）：
- Stable `v0.38.2`（2026-04-17）；Preview `v0.39.0-preview.2`（2026-04-22）
- yargs 定義：[packages/cli/src/config/config.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/config.ts)
- 模型型錄：[packages/core/src/config/models.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/models.ts)
- Headless 指南：[docs/cli/headless.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)

## 基本語法

```
gemini [options] [command]
gemini -p "prompt"   ← 非互動模式
```

## 主要選項

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--prompt` | `-p` | 非互動(headless)模式，執行完即退出 |
| `--prompt-interactive` | `-i` | 執行 prompt 後留在互動模式（與 `-p` 互斥） |
| `--yolo` | `-y` | 穩定快速鍵，等同 `--approval-mode=yolo`（與 `--approval-mode` 互斥） |
| `--approval-mode` | — | `default`、`auto_edit`、`yolo`、`plan` 四種模式 |
| `--model` | `-m` | 指定模型或別名，例如 `gemini-3.1-pro-preview`、`pro`、`flash` |
| `--sandbox` | `-s` | 沙箱模式（設定 `GEMINI_SANDBOX=true`；**會封鎖網路**） |
| `--debug` | `-d` | 除錯模式，輸出詳細日誌 |
| `--extensions` | `-e` | 指定啟用的擴充功能（可多次指定） |
| `--list-extensions` | `-l` | 列出可用擴充 |
| `--include-directories` | — | 額外加入工作空間的目錄（逗號分隔或可重複） |
| `--output-format` | `-o` | `text`（預設）、`json`、`stream-json`（JSONL 事件流：`init`/`message`/`tool_use`/`tool_result`/`error`/`result`） |
| `--resume` | `-r` | 繼續前次 session（`latest` 或 index 編號） |
| `--list-sessions` | — | 列出所有可用 session |
| `--delete-session` | — | 刪除指定 session |
| `--policy` | — | Policy Engine 規則檔案 / 目錄（可重複） |
| `--admin-policy` | — | 管理員層級 policy（優先級最高） |
| `--allowed-mcp-server-names` | — | 限定可用 MCP server 名稱 |
| `--acp` | — | 進入 Agent Communication Protocol 模式 |
| `--worktree` | `-w` | 在 git worktree 中執行（experimental，需開啟 `experimental.worktrees`） |
| `--screen-reader` | — | 螢幕閱讀器輔助輸出 |
| `--raw-output` | — | 不做 ANSI 清理（須搭配 `--accept-raw-output-risk`） |
| `--accept-raw-output-risk` | — | 承認 raw output 風險 |
| `--version` | `-v` | 版本 |
| `--help` | `-h` | 說明 |

## approval-mode 各模式說明

| 模式 | 說明 |
|------|------|
| `default` | 每次操作前詢問確認（互動模式預設） |
| `auto_edit` | 自動核准檔案編輯，其他操作仍詢問 |
| `yolo` | 自動核准所有操作（headless 推薦） |
| `plan` | 唯讀模式，只規劃不執行（v0.37 起為穩定功能） |

## 模型別名

| 別名 | 對應模型 |
|------|---------|
| `auto` | 預設，系統依任務複雜度自動路由（Gemini 3） |
| `pro` | 當前最強 Pro 版（gemini-3.1-pro-preview） |
| `flash` | 當前 Flash 版（gemini-2.5-flash） |
| `flash-lite` | 當前 Flash Lite 版 |

> 使用具體模型 ID 以避免別名指向隨版本變動。

## 工作目錄指定方式

Gemini CLI **沒有** `--workdir` 參數，工作目錄由 shell 的當前目錄決定。

透過 `dispatch-cli` 調用時，建議使用 `CLI_CWD` 環境變數指定工作目錄，取代 `cd` 的 shell 串接方式（更安全）：

```bash
# 推薦：透過 dispatch-cli 的 CLI_CWD 指定
CLI_CWD="D:/work/my-app" \
  node dispatch-cli/scripts/run_cli.mjs \
  gemini --approval-mode=yolo -p "任務"
```

若未使用 dispatch-cli，可直接透過 shell 切換目錄：

```bash
# 備選：shell 串接
cd "D:/work/my-app" && gemini --approval-mode=yolo -p "任務"
```

## 思考模式（Thinking）

Gemini CLI **目前仍無** `--thinking-budget` / `--effort` / `--reasoning` CLI flag（2026-04-22 確認，`config.ts` 中對 `thinking`/`reasoning`/`effort` 關鍵字 grep 為 0 命中）。

- API 層面支援 `thinkingBudget`（0~24576，-1 = 動態），但 CLI 尚未暴露
- 相關 feature request：GitHub #15533、#5280（仍為 open）
- 模型會自行決定思考深度，無法透過命令列控制
- 內部僅有 `DEFAULT_THINKING_MODE = 8192` 常數作為 runaway 防護，非使用者可調

## Headless 退出碼

| 退出碼 | 意義 |
|--------|------|
| `0` | 成功 |
| `1` | 一般 / API 錯誤 |
| `42` | 輸入錯誤 |
| `53` | 超過回合上限 |

## 設定優先序

CLI flag ＞ 環境變數（如 `GEMINI_SANDBOX`、`DEBUG`）＞ `settings.json`（專案＋使用者合併）＞ 預設值。

## 已棄用／更名

| 舊旗標 | 現況 | 建議 |
|--------|------|------|
| `--allowed-tools` | 仍可用但標記 DEPRECATED | 改用 `--policy` / `--admin-policy`（Policy Engine） |
| `--experimental-acp` | 已棄用 | 改用 `--acp` |
| CLI `--memory-import-format` 參數 | 已移除 | 僅能由 `settings.memoryImportFormat` 設定 |
| Positional prompt auto-headless | 行為改變 | TTY 下位置參數進互動模式，headless 須顯式 `-p` |

## Session 管理（多階段 pipeline）

```bash
# 列出 session
gemini --list-sessions

# 繼續最近一次 session
gemini --resume latest -p "繼續上次任務"

# 繼續指定 session（index 編號）
gemini --resume 3 -p "追加指令"
```
