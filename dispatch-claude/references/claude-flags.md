# Claude Code CLI 派工參考

以下內容於 2026-08-23 透過這些來源驗證：

- `@anthropic-ai/claude-code`／`claude` 2.1.240
- 本機 `claude --help`
- [Claude Code 官方 CLI 參考](https://code.claude.com/docs/en/cli-usage)
- [Claude Code 官方模型設定指南](https://code.claude.com/docs/en/model-config)

若公開文件尚未納入新發布的模型別名，以已安裝 CLI 的實際 help 為執行期依據。

## 非互動語法

```text
claude -p [options]
```

`dispatchClaude()` 會建立此命令，並透過 stdin 傳入提示詞。直接從 shell 使用時，也可以把提示詞作為位置參數。

## 必要模型與推理強度

```text
--model claude-fable-5 --effort max
```

Claude Code 2.1.240 的 help 已明確支援 `fable` 別名與完整名稱 `claude-fable-5`。`--effort` 可選值如下：

| 等級 | 說明 |
|---|---|
| `low` | 最低延遲與推理消耗 |
| `medium` | 適合一般輕量工作 |
| `high` | 深度推理 |
| `xhigh` | 延伸推理 |
| `max` | 最大推理深度；僅作用於目前工作階段 |

本技能的必要預設值是 `max`。也可以設定 `CLAUDE_CODE_EFFORT_LEVEL=max`，但逐次明確傳入旗標更容易稽核。持久化的 `effortLevel` 設定不接受 `max`。

## 派工相關旗標

| 旗標 | 用途 |
|---|---|
| `-p`、`--print` | 非互動執行，完成後離開 |
| `--model <model>` | 選擇模型別名或完整名稱 |
| `--effort <level>` | 設定本次工作階段的推理強度 |
| `--dangerously-skip-permissions` | 略過權限檢查；只可用於強化隔離環境 |
| `--allowedTools <tools...>` | 預先核准有限的工具集合 |
| `--disallowedTools <tools...>` | 禁止指定工具 |
| `--tools <tools...>` | 選擇要暴露的內建工具集合 |
| `--permission-mode <mode>` | `acceptEdits`、`auto`、`bypassPermissions`、`manual`、`dontAsk` 或 `plan` |
| `--output-format <format>` | print 模式可用 `text`、`json`、`stream-json` |
| `--input-format <format>` | print 模式可用 `text` 或 `stream-json` |
| `--json-schema <schema>` | 驗證最終結構化回應 |
| `--fallback-model <models>` | 主模型不可用時依序嘗試備援模型 |
| `--max-budget-usd <amount>` | 達到 API 預算後停止 |
| `--no-session-persistence` | 不保存列印模式的工作階段 |
| `--add-dir <dirs...>` | 增加允許存取的工作目錄 |
| `--mcp-config <configs...>` | 載入 MCP 設定 |
| `--append-system-prompt <text>` | 在預設系統提示詞後追加內容 |
| `--system-prompt <text>` | 取代預設系統提示詞 |
| `--bare` | 最小化啟動模式；實際略過項目以目前版本 help 為準 |

不要沿用舊版技能文件中已移除或未記載的旗標。不確定時，先用 `claude --help` 確認，再放入 `extraArgs`。

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

## 版本與模型檢查

```bash
claude --version
claude --help
npm view @anthropic-ai/claude-code version
```

若目前版本仍拒絕 `claude-fable-5`，可能是帳號沒有存取權。除非使用者已明確接受備援模型，否則應回報錯誤，不可靜默替換模型。
