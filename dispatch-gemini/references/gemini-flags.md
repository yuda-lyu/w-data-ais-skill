# Gemini CLI 旗標完整參考

來源：`gemini --help`（v0.38.0 實測確認）

## 基本語法

```
gemini [options] [command]
gemini -p "prompt"   ← 非互動模式
```

## 主要選項

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--prompt` | `-p` | 非互動(headless)模式，執行完即退出 |
| `--prompt-interactive` | `-i` | 執行 prompt 後留在互動模式 |
| `--yolo` | `-y` | 自動核准所有操作（等同 `--approval-mode=yolo`） |
| `--approval-mode` | — | `default`、`auto_edit`、`yolo`、`plan` 四種模式 |
| `--model` | `-m` | 指定模型或別名，例如 `gemini-3.1-pro-preview`、`pro`、`flash` |
| `--sandbox` | `-s` | 沙箱模式（**會封鎖網路，npm install 會失敗**） |
| `--debug` | `-d` | 除錯模式，輸出詳細日誌 |
| `--extensions` | `-e` | 指定啟用的擴充功能（可多次指定） |
| `--include-directories` | — | 額外加入工作空間的目錄（逗號分隔） |
| `--output-format` | `-o` | `text`、`json`、`stream-json` |
| `--resume` | `-r` | 繼續前次 session（`latest` 或 index 編號） |
| `--list-sessions` | — | 列出所有可用 session |

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

Gemini CLI **截至撰寫時無 `--thinking-budget` CLI flag**（請以 `gemini --help` 確認最新支援）。

- API 層面支援 `thinkingBudget`（0~24576，-1 = 動態），但 CLI 尚未暴露此參數
- 相關 feature request：GitHub #15533、#5280（仍為 open）
- 模型會自行決定思考深度，無法透過命令列控制

## Session 管理（多階段 pipeline）

```bash
# 列出 session
gemini --list-sessions

# 繼續最近一次 session
gemini --resume latest -p "繼續上次任務"

# 繼續指定 session（index 編號）
gemini --resume 3 -p "追加指令"
```
