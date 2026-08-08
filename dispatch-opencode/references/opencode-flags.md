# OpenCode CLI 旗標完整參考

來源：`opencode --help`、`opencode run --help`、`opencode models`（**v1.18.15 實測確認，2026-08-07**；npm 套件名 `opencode-ai`）

## 基本語法

```
opencode [options] [command]
opencode run [message..]   ← 非互動模式（headless）
```

## 主要子命令

| 子命令 | 說明 |
|--------|------|
| `run [message..]` | **非互動模式**，執行任務後退出（多 agent 使用此命令） |
| `[project]` | 啟動 TUI 互動介面（預設） |
| `serve` | 啟動 headless server |
| `web` | 啟動 server 並開啟 Web 介面 |
| `attach <url>` | 連接到運行中的 server |
| `models [provider]` | 列出所有可用模型 |
| `providers`（別名 `auth`） | 管理 AI provider 與憑證（login / logout / list）。**v1.18.1x 起主名為 `providers`**，`auth` 仍為別名 |
| `agent` | 管理 agent（create / list） |
| `session` | 管理 session |
| `export [sessionID]` | 匯出 session 為 JSON |
| `import <file>` | 匯入 session JSON（支援檔案或 URL） |
| `pr <number>` | 取得 GitHub PR 分支並啟動 opencode |
| `github` | 管理 GitHub agent |
| `mcp` | 管理 MCP（Model Context Protocol）伺服器 |
| `acp` | 啟動 ACP（Agent Client Protocol）伺服器 |
| `plugin <module>`（別名 `plug`） | 安裝 plugin 並更新設定 |
| `db` | 資料庫工具 |
| `completion` | 產生 shell 補全腳本 |
| `debug` | 除錯工具（config / lsp / agent / paths 等） |
| `stats` | 顯示 token 用量與成本統計 |
| `upgrade [target]` | 升級 opencode（亦可用 `npm install -g opencode-ai@latest`） |
| `uninstall` | 移除 opencode 及所有相關檔案 |

## `opencode run` 選項

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--model` | `-m` | 指定模型：Zen 兩段 `provider/model`（例：`opencode/deepseek-v4-flash-free`）；cline / nvidia 三段 `provider/vendor/model`（例：`nvidia/deepseek-ai/deepseek-v4-pro`） |
| `--agent` | — | 指定 agent（例：`build` = 權限全開） |
| `--format` | — | 輸出格式：`default`（人類可讀）、`json`（JSONL 事件流） |
| `--file` | `-f` | 附加檔案（可多次指定） |
| `--variant` | — | 模型變體＝provider 專屬推理強度（例：`high`、`max`、`minimal`） |
| `--dir` | — | 指定執行目錄；若 `--attach` 連遠端 server 則為遠端路徑 |
| `--auto` | — | 自動核准未被明確拒絕的權限（**dangerous**；一般用 `--agent build` 即足夠） |
| `--thinking` | — | 顯示 thinking 區塊 |
| `--continue` | `-c` | 延續上次 session |
| `--session` | `-s` | 指定 session ID 延續 |
| `--fork` | — | 延續前先分叉 session（需搭配 `--continue` 或 `--session`） |
| `--title` | — | 為 session 命名（未給值則取截斷後的 prompt） |
| `--share` | — | 分享 session |
| `--command` | — | 指定要執行的 command，以 message 作為其引數 |
| `--pure` | — | 不載入外部 plugin |
| `--interactive` | `-i` | 以 split-footer 互動模式執行（**headless 派工勿用**） |
| `--attach` | — | 連接到運行中的 server（例：`http://localhost:4096`） |
| `--password` / `--username` | `-p` / `-u` | server basic auth（預設取 `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`） |
| `--port` | — | 本地 server 端口（預設隨機） |
| `--print-logs` / `--log-level` | — | 除錯：log 印至 stderr；等級 `DEBUG`/`INFO`/`WARN`/`ERROR` |

> ⚠ 舊版本文所列的 `run --prompt` 於 v1.18.15 之 `opencode run --help` **已不存在**（prompt 直接以 positional `message` 傳入）。
>
> ⚠ `-p` 在 `run` 之下是 `--password` **而非 prompt**，勿與 Claude / Copilot CLI 的 `-p` 混淆。

## 全域選項

| 選項 | 說明 |
|------|------|
| `--print-logs` | 將日誌輸出到 stderr |
| `--log-level` | 日誌等級：`DEBUG`、`INFO`、`WARN`、`ERROR` |
| `--port` | 監聽端口（預設 0 = 隨機） |
| `--hostname` | 監聽主機名（預設 `127.0.0.1`） |
| `--mdns` | 啟用 mDNS 服務發現（hostname 預設改為 `0.0.0.0`） |
| `--cors` | 額外允許的 CORS 網域 |

## Agent 管理

```bash
# 列出所有 agent
opencode agent list

# 建立新 agent
opencode agent create

# 查看 agent 詳細設定
opencode debug agent <name>
```

### `build` agent 權限設定

`build` agent 預設為全自動模式，關鍵權限：

| 權限 | 動作 | 說明 |
|------|------|------|
| `*` | allow | 所有操作預設允許 |
| `doom_loop` | ask | 防止無限迴圈時詢問 |
| `external_directory` | ask | 存取外部目錄時詢問 |
| `question` | deny | 不會停下來問問題 |
| `plan_enter` / `plan_exit` | deny | 不會進入規劃模式 |

## 認證管理

```bash
# 登入 provider
opencode auth login [url]

# 登出
opencode auth logout

# 列出已認證的 provider
opencode auth list
```

認證資料儲存於：`~/.local/share/opencode/auth.json`

## 除錯工具

```bash
# 查看完整解析後的設定
opencode debug config

# 查看 agent 設定
opencode debug agent <name>

# 查看全域路徑
opencode debug paths

# 查看可用技能
opencode debug skill
```

## Session 管理（多階段 pipeline）

```bash
# 延續上次 session
opencode run -c "繼續上次任務"

# 延續指定 session
opencode run -s <sessionID> "追加指令"

# 匯出 session
opencode export <sessionID>

# 匯入 session
opencode import <file>
```
