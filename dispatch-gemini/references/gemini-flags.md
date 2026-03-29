# Gemini CLI 旗標完整參考

來源：`gemini --help`（v0.33.1 實測確認）

## 基本語法

```
gemini [options] [command]
gemini -p "prompt"   ← 非互動模式
```

## 主要選項

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--prompt` | `-p` | 非互動(headless)模式，執行完即退出 |
| `--yolo` | `-y` | 自動核准所有操作（等同 `--approval-mode=yolo`） |
| `--approval-mode` | — | `default`、`auto_edit`、`yolo`、`plan` 四種模式 |
| `--model` | `-m` | 指定模型，例如 `gemini-2.5-flash` |
| `--sandbox` | `-s` | 沙箱模式（**會封鎖網路，npm install 會失敗**） |
| `--include-directories` | — | 額外加入工作空間的目錄（逗號分隔） |
| `--output-format` | `-o` | `text`、`json`、`stream-json` |
| `--resume` | `-r` | 繼續前次 session（`latest` 或 index 編號） |
| `--list-sessions` | — | 列出所有可用 session |
| `--ephemeral` 概念 | — | 用 `--resume` 配合管理 session 持久性 |

## approval-mode 各模式說明

| 模式 | 說明 |
|------|------|
| `default` | 每次操作前詢問確認（互動模式預設） |
| `auto_edit` | 自動核准檔案編輯，其他操作仍詢問 |
| `yolo` | 自動核准所有操作（headless 推薦） |
| `plan` | 唯讀模式，只規劃不執行 |

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

## Session 管理（多階段 pipeline）

```bash
# 列出 session
gemini --list-sessions

# 繼續最近一次 session
gemini --resume latest -p "繼續上次任務"

# 繼續指定 session（index 編號）
gemini --resume 3 -p "追加指令"
```
