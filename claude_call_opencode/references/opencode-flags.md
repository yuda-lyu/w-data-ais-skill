# OpenCode CLI 旗標完整參考

來源：`opencode --help`（v1.1.36 實測確認）

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
| `auth` | 管理認證（login / logout / list） |
| `agent` | 管理 agent（create / list） |
| `session` | 管理 session |
| `export [sessionID]` | 匯出 session 為 JSON |
| `import <file>` | 匯入 session JSON |
| `pr <number>` | 取得 GitHub PR 分支並啟動 opencode |
| `github` | 管理 GitHub agent |
| `debug` | 除錯工具（config / lsp / agent / paths 等） |
| `stats` | 顯示 token 用量與成本統計 |
| `upgrade [target]` | 升級 opencode |

## `opencode run` 選項

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--model` | `-m` | 指定模型，格式 `provider/model`（例：`opencode/gpt-5.4`） |
| `--agent` | — | 指定 agent（例：`build` = 權限全開） |
| `--format` | — | 輸出格式：`default`（人類可讀）、`json`（JSONL 事件流） |
| `--file` | `-f` | 附加檔案（可多次指定） |
| `--variant` | — | 推理強度（provider 特定，例：`high`、`max`、`minimal`） |
| `--continue` | `-c` | 延續上次 session |
| `--session` | `-s` | 指定 session ID 延續 |
| `--title` | — | 為 session 命名 |
| `--share` | — | 分享 session |
| `--attach` | — | 連接到運行中的 server（例：`http://localhost:4096`） |
| `--port` | — | 本地 server 端口（預設隨機） |
| `--prompt` | — | 指定 prompt（全域選項） |

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
