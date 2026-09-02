# Claude Code CLI 派工參考

以下內容於 2026-09-02 透過這些來源驗證：

- `@anthropic-ai/claude-code`／`claude` 2.1.258（npm 最新版）
- 本機 `claude --version`、`claude --help`
- 本機實跑 `claude -p --model claude-fable-5-1 --effort low --output-format json`（回應之 `modelUsage` 出現 `claude-fable-5-1`，exit 0）
- [Claude Code 官方 CLI 參考](https://code.claude.com/docs/en/cli-usage)
- [Claude Code 官方模型設定指南](https://code.claude.com/docs/en/model-config)

`claude` 沒有 `models` 子命令，因此模型清單以官方模型設定指南與實跑結果為準；旗標一律以已安裝 CLI 的 `--help` 為執行期依據。

## 非互動語法

```text
claude -p [options]
```

`dispatchClaude()` 會建立此命令，並透過 stdin 傳入提示詞。直接從 shell 使用時，也可以把提示詞作為位置參數。

## 必要模型與推理強度

```text
--model claude-fable-5-1 --effort max
```

`--model` 接受別名或完整名稱。派工一律用完整名稱 `claude-fable-5-1`，不用別名——別名會隨版本滾動，會讓同一段派工程式在不同時間跑到不同模型。

| 別名 | 目前解析對象 |
|---|---|
| `fable` | 最新 Fable（目前為 Fable 5.1） |
| `best` | 有 Fable 時取最新 Fable，否則取 `opus` |
| `opus`、`sonnet`、`haiku` | 各系列最新版 |
| `opus[1m]`、`sonnet[1m]` | 100 萬 token 脈絡窗版本 |
| `opusplan` | 規劃用 Opus，執行時切換為 Sonnet |
| `default` | 清除覆寫，回到帳號的執行期預設 |

`--effort` 可選值（2.1.258 之 `--help` 明列 `low, medium, high, xhigh, max`）：

| 等級 | 說明 |
|---|---|
| `low` | 最低延遲與推理消耗 |
| `medium` | 適合一般輕量工作 |
| `high` | 深度推理 |
| `xhigh` | 延伸推理 |
| `max` | 最大推理深度；僅作用於目前工作階段 |

本技能的必要預設值是 `max`。Fable 5.1、Fable 5、Opus 5、Sonnet 5 皆支援到 `max`。持久化的 `effortLevel` 設定**不接受** `max`（只到 `xhigh`）；要用 `max` 只能靠 `--effort` 旗標、`/effort` 命令或 `CLAUDE_CODE_EFFORT_LEVEL=max` 環境變數。派工時逐次明確傳入旗標最容易稽核。

## 派工相關旗標

| 旗標 | 用途 |
|---|---|
| `-p`、`--print` | 非互動執行，完成後離開 |
| `--model <model>` | 選擇模型別名或完整名稱 |
| `--effort <level>` | 設定本次工作階段的推理強度（`low`／`medium`／`high`／`xhigh`／`max`） |
| `--dangerously-skip-permissions` | 略過所有權限檢查；只可用於強化隔離環境 |
| `--allow-dangerously-skip-permissions` | 只「開放」略過權限之選項，但不預設啟用 |
| `--allowedTools <tools...>` | 預先核准有限的工具集合 |
| `--disallowedTools <tools...>` | 禁止指定工具 |
| `--tools <tools...>` | 選擇要暴露的內建工具集合；`""` 停用全部，`default` 取全部 |
| `--permission-mode <mode>` | `acceptEdits`、`auto`、`bypassPermissions`、`manual`、`dontAsk` 或 `plan` |
| `--restricted` | 移除會執行命令／程式碼的內建工具與 WebFetch，忽略 user／project／local 設定檔，並把檔案工具限制在工作目錄內；拒絕 `bypassPermissions` |
| `--output-format <format>` | print 模式可用 `text`、`json`、`stream-json` |
| `--input-format <format>` | print 模式可用 `text` 或 `stream-json` |
| `--json-schema <schema>` | 驗證最終結構化回應 |
| `--fallback-model <model>` | 主模型過載或不可用時的備援；接受逗號分隔清單依序嘗試，僅於 `--print` 生效 |
| `--max-budget-usd <amount>` | 達到 API 預算後停止，僅於 `--print` 生效 |
| `--no-session-persistence` | 不保存列印模式的工作階段，僅於 `--print` 生效 |
| `--add-dir <dirs...>` | 增加允許存取的工作目錄 |
| `--agents <json>` | 以 JSON 定義本次工作階段的自訂子代理 |
| `--agent <agent>` | 指定本次工作階段使用的代理 |
| `--mcp-config <configs...>` | 載入 MCP 設定；搭配 `--strict-mcp-config` 可忽略其他來源 |
| `--setting-sources <sources>` | 逗號分隔指定要載入的設定來源（`user`、`project`、`local`） |
| `--settings <file-or-json>` | 額外載入設定檔或 JSON 字串 |
| `--append-system-prompt <text>` | 在預設系統提示詞後追加內容 |
| `--system-prompt <text>` | 取代預設系統提示詞 |
| `--autocompact <auto\|tokens>` | 自動壓縮視窗大小（`auto` 或 100k–1M） |
| `--disable-slash-commands` | 停用所有技能 |
| `--safe-mode` | 停用所有自訂（CLAUDE.md、技能、plugin、hook、MCP…）以排查設定問題 |
| `--bare` | 最小模式：略過 hook、LSP、plugin 同步、attribution、auto-memory、背景預抓、keychain 讀取與 CLAUDE.md 自動探索；認證**只**接受 `ANTHROPIC_API_KEY` 或經 `--settings` 的 apiKeyHelper（不讀 OAuth 與 keychain），故訂閱制登入的機器不可用 |
| `--session-id <uuid>` | 指定工作階段 ID |

沒有 `--system-prompt-file` 這個獨立旗標（僅出現在 `--bare` 的說明文字中）。不要沿用舊版技能文件中已移除或未記載的旗標；不確定時先用 `claude --help` 確認，再放入 `extraArgs`。

## 輸出組合

```javascript
// 單一 JSON 文件
extraArgs: ['--effort', 'max', '--output-format', 'json']

// JSONL 事件流
extraArgs: [
    '--effort', 'max',
    '--output-format', 'stream-json',
    '--verbose',
]
```

只有單一文件的 `json` 格式可搭配 `validate: 'json'`。使用 `stream-json` 時，須逐行解析 stdout。

`--output-format json` 的結果物件含 `modelUsage`，其鍵即實際使用的模型 ID；要證明派工確實跑在 `claude-fable-5-1` 上，看這個欄位最直接。

## 版本與模型檢查

```bash
claude --version
claude --help
npm view @anthropic-ai/claude-code version
```

若目前版本仍拒絕 `claude-fable-5-1`，可能是帳號沒有存取權。除非使用者已明確接受備援模型，否則應回報錯誤，不可靜默替換模型。
