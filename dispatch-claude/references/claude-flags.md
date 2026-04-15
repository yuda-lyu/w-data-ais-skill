# Claude Code CLI 旗標完整參考

來源：`claude --help`（實測確認）

## 基本語法

```
claude [options] [prompt]
claude -p "task prompt"   ← 非互動模式（headless）
```

Claude CLI 不使用子命令進入 headless 模式，而是透過 `-p` / `--print` 旗標。

## 非互動模式核心旗標

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--print` | `-p` | **非互動模式**，輸出回應後退出（多 agent 使用此旗標） |
| `--dangerously-skip-permissions` | — | 跳過所有權限確認，全自動執行 |
| `--allow-dangerously-skip-permissions` | — | 啟用跳過權限的選項（搭配 `--permission-mode` 使用） |
| `--allowedTools` | `--allowed-tools` | 預先核准特定工具，不彈出確認（例：`"Bash,Read,Edit"`） |
| `--disallowedTools` | `--disallowed-tools` | 封鎖特定工具（例：`"Bash(rm *)"` 禁止刪除） |
| `--tools` | — | 限制可用工具集（`"default"` 全部、`""` 禁用全部） |

## 模型與效能

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--model` | — | 指定模型：別名（`opus`/`sonnet`/`haiku`）或完整 ID（`claude-opus-4-6`） |
| `--effort` | — | 自適應推理深度：`low`、`medium`、`high`、`max`（見下方說明） |
| `--fallback-model` | — | 主模型過載時的備援模型（僅 `-p` 模式） |

### `--effort` 推理深度說明

| 等級 | 說明 | 適用場景 |
|------|------|----------|
| `low` | 最低推理，快速便宜 | 簡單查詢、格式轉換 |
| `medium` | 中等推理（Pro/Max 訂閱預設） | 日常編碼任務 |
| `high` | 較深推理（API/Team/Enterprise 預設） | 除錯、架構分析 |
| `max` | **最深推理，無 token 花費限制，僅 Opus 4.6 支援** | 高階推理、複雜除錯、安全審計 |

> **注意**：`max` 不會跨 session 保留，每次呼叫需明確傳入。
> 也可透過環境變數 `CLAUDE_CODE_EFFORT_LEVEL=max` 設定（優先級最高）。
> 在 prompt 中加入 `ultrathink` 關鍵字可觸發 `high` 等級（但非 `max`）。

## 輸出控制

| 選項 | 說明 |
|------|------|
| `--output-format text` | 純文字輸出（預設） |
| `--output-format json` | 結構化 JSON，含 `result`、`session_id` 等 metadata |
| `--output-format stream-json` | 即時串流 JSONL 事件流 |
| `--json-schema '{...}'` | 強制回應符合 JSON Schema（需搭配 `--output-format json`） |
| `--verbose` | 顯示完整逐回合輸出 |
| `--include-partial-messages` | 含部分串流事件（需搭配 `stream-json`） |

### JSON 輸出解析

```bash
# 取得回應內容
claude -p --output-format json "查詢" | jq -r '.result'

# 取得 session ID（用於後續 resume）
claude -p --output-format json "查詢" | jq -r '.session_id'

# 結構化輸出
claude -p --output-format json \
  --json-schema '{"type":"object","properties":{"items":{"type":"array"}},"required":["items"]}' \
  "列出所有函式" | jq '.structured_output'
```

## 系統提示

| 選項 | 說明 |
|------|------|
| `--system-prompt "..."` | 完全替換預設系統提示 |
| `--system-prompt-file <path>` | 從檔案載入替換系統提示 |
| `--append-system-prompt "..."` | 追加到預設系統提示 |
| `--append-system-prompt-file <path>` | 從檔案載入追加系統提示 |

## Session 管理

| 選項 | 縮寫 | 說明 |
|------|------|------|
| `--continue` | `-c` | 延續最近一次對話 |
| `--resume <id>` | `-r` | 以 session ID 或名稱延續 |
| `--session-id <uuid>` | — | 指定特定 UUID 作為 session ID |
| `--name` | `-n` | 為 session 命名（可用名稱 resume） |
| `--fork-session` | — | resume 時建立新 session（不覆蓋原始） |
| `--no-session-persistence` | — | 不儲存 session（僅 `-p` 模式） |

### Session 使用範例

```bash
# 命名 session
claude -p -n "security-audit" --dangerously-skip-permissions "開始安全審計"

# 以名稱延續
claude -p --resume security-audit --dangerously-skip-permissions "繼續審計"

# 以 JSON 取得 session ID 後延續
sid=$(claude -p --output-format json "第一階段" | jq -r '.session_id')
claude -p --resume "$sid" "第二階段"

# 一次性任務（不儲存）
claude -p --no-session-persistence "一次性查詢"
```

## 控制與限制

| 選項 | 說明 |
|------|------|
| `--max-budget-usd <n>` | 最大花費上限（美元），超過自動停止 |
| `--permission-mode <mode>` | 權限模式：`default`、`plan`、`auto`、`bypassPermissions`、`dontAsk` |

## 上下文與環境

| 選項 | 說明 |
|------|------|
| `--add-dir <path>` | 允許存取額外目錄（可多次指定） |
| `--bare` | 精簡模式：跳過 hooks/skills/plugins/MCP/auto-memory/CLAUDE.md |
| `--mcp-config <path>` | 載入 MCP 伺服器設定（JSON 檔案或字串） |
| `--strict-mcp-config` | 僅使用 `--mcp-config` 指定的 MCP，忽略其他 |
| `--plugin-dir <path>` | 載入指定目錄的 plugins |
| `--settings <file-or-json>` | 載入額外設定檔 |
| `--disable-slash-commands` | 禁用所有 skills |

## 輸入處理

| 選項 | 說明 |
|------|------|
| `--input-format text` | 純文字輸入（預設） |
| `--input-format stream-json` | 即時串流 JSON 輸入 |

### Pipe 輸入

```bash
# 管道輸入檔案內容
cat logs.txt | claude -p "分析並找出錯誤"

# 管道 git diff
gh pr diff 123 | claude -p "審查安全問題"
```

## Agent 功能

| 選項 | 說明 |
|------|------|
| `--agent <name>` | 使用指定 agent |
| `--agents <json>` | 動態定義 agent（JSON 格式） |

```bash
# 使用自訂 agent
claude -p --agent my-reviewer "審查程式碼"

# 動態定義 agent
claude -p --agents '{"reviewer":{"description":"程式碼審查","prompt":"你是程式碼審查專家"}}' \
  --agent reviewer "審查 src/"
```

## 其他選項

| 選項 | 說明 |
|------|------|
| `--debug [filter]` | 除錯模式，可選分類過濾（例：`"api,hooks"`） |
| `--debug-file <path>` | 將除錯日誌寫入檔案 |
| `--chrome` | 啟用 Chrome 瀏覽器整合 |
| `--worktree [name]` | 在 git worktree 中執行（隔離環境） |
| `--ide` | 自動連接 IDE |
| `--betas <headers>` | 傳入 beta headers（API key 使用者） |

## 子命令

| 子命令 | 說明 |
|--------|------|
| `claude auth` | 管理認證 |
| `claude setup-token` | 設定 long-lived token |
| `claude mcp` | 管理 MCP 伺服器 |
| `claude agents` | 列出已設定的 agents |
| `claude doctor` | 檢查健康狀態 |
| `claude update` | 檢查並安裝更新 |
| `claude install [target]` | 安裝指定版本 |
| `claude plugin` | 管理 plugins |

## 與其他 CLI 工具的關鍵差異

| 特性 | Codex | Gemini | OpenCode | Claude CLI |
|------|-------|--------|----------|------------|
| Headless 入口 | `codex exec` | `-p` 旗標 | `run` 子命令 | **`-p` 旗標** |
| 全自動核准 | `--full-auto` | `--approval-mode=yolo` | `--agent build` | **`--dangerously-skip-permissions`** |
| 細粒度工具控制 | ❌ | ❌ | ❌ | **✅ `--allowedTools` / `--disallowedTools`** |
| 預算限制 | ❌ | ❌ | ❌ | **✅ `--max-budget-usd`** |
| 結構化輸出 | `--output-schema` | ❌ | ❌ | **✅ `--json-schema`** |
| 精簡模式 | ❌ | ❌ | ❌ | **✅ `--bare`** |
| 備援模型 | ❌ | ❌ | ❌ | **✅ `--fallback-model`** |
