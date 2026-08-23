# Antigravity（`agy`）CLI 派工參考

以下內容於 2026-08-23 透過這些來源驗證：

- 本機 `agy` 1.1.18
- 本機 `agy --help` 與即時 `agy models`
- [Antigravity 官方無介面模式文件](https://antigravity.google/docs/cli/headless/)
- [Antigravity CLI 官方儲存庫](https://github.com/google-antigravity/antigravity-cli)

模型型錄由伺服器提供，可能獨立於本文件變更。修改固定模型前，須重新執行 `agy models`。

## 非互動語法

```text
agy --print "prompt" [flags]
agy -p "prompt" [flags]
```

提示詞是 `--print` 的必要參數值；單次執行不會從 stdin 讀取提示詞。因此 `dispatchAntigravity()` 會把提示詞當成命令列參數，並套用 30,000 字元上限。

## 必要模型與最深推理

```text
--model gemini-3.7-flash-high
```

審查日的即時型錄如下：

```text
gemini-3.7-flash-high     Gemini 3.7 Flash (High)
gemini-3.7-flash-medium   Gemini 3.7 Flash (Medium)
gemini-3.7-flash-low      Gemini 3.7 Flash (Low)
gemini-3.6-flash-high     Gemini 3.6 Flash (High)
gemini-3.6-flash-medium   Gemini 3.6 Flash (Medium)
gemini-3.6-flash-low      Gemini 3.6 Flash (Low)
gemini-3.5-flash-high     Gemini 3.5 Flash (High)
gemini-3.5-flash-medium   Gemini 3.5 Flash (Medium)
gemini-3.5-flash-low      Gemini 3.5 Flash (Low)
gemini-3.1-pro-high       Gemini 3.1 Pro (High)
gemini-3.1-pro-low        Gemini 3.1 Pro (Low)
claude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking  Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium       GPT-OSS 120B (Medium)
```

必須使用第一欄 slug，不可傳入顯示名稱。`high` 是 agy 的最深推理強度。模型 slug 已內嵌等級時，不需要再傳相同的 `--effort`；若傳入不一致的 effort，agy 會拒絕執行。

## 主要旗標

| 旗標 | 用途 |
|---|---|
| `-p`、`--print <text>` | 非互動執行一次提示詞，完成後離開 |
| `--prompt <text>` | `--print` 的別名 |
| `-i`、`--prompt-interactive <text>` | 帶初始提示詞進入互動模式；派工不可使用 |
| `--model <slug>` | 固定使用 `agy models` 中的模型 |
| `--effort low|medium|high` | 設定推理強度 |
| `--dangerously-skip-permissions` | 自動核准所有工具權限請求 |
| `--print-timeout <duration>` | 限制 print 模式等待時間；預設 `5m0s` |
| `--add-dir <path>` | 增加工作區目錄；可重複使用 |
| `--output-format text|json|stream-json` | 選擇 print 模式輸出格式 |
| `--input-format text|stream-json` | 選擇 print 模式輸入格式；stream 輸入必須搭配 stream 輸出 |
| `--json-schema <schema-or-path>` | 限制最終結果結構 |
| `-c`、`--continue` | 延續最近一次對話 |
| `--conversation <id>` | 以 ID 恢復對話 |
| `--mode accept-edits|plan` | 選擇執行模式 |
| `--agent <name>` | 選擇自訂代理 |
| `--project <id-or-name>` | 選擇專案 |
| `--new-project` | 為本次執行建立專案 |
| `--disable-slash-commands` | 停用 print 模式的 slash command 與技能展開 |
| `--sandbox` | 啟用 Antigravity 終端限制 |

模型沒有 `-m` 短旗標，必須使用 `--model`。

## 子命令

| 命令 | 用途 |
|---|---|
| `agy models` | 列出即時模型 slug |
| `agy agent`、`agy agents` | 列出代理 |
| `agy mcp` | 管理 MCP server |
| `agy plugin`、`agy plugins` | 管理 plugin |
| `agy changelog` | 顯示版本說明 |
| `agy update` | 更新 CLI |

## 輸出與離開狀態

```text
agy -p "task" --model gemini-3.7-flash-high --output-format json
agy -p "task" --model gemini-3.7-flash-high --output-format stream-json
```

`json` 是單一結果物件；`stream-json` 是 NDJSON。無介面模式遇到不存在的指定模型時，會回傳非零離開狀態與錯誤，不會靜默退回其他模型。

## 工作區與認證

agy 透過明確指定的工作區目錄決定檔案可視範圍。未提供 `addDirs` 時，`w-dispatch-ai` 1.0.17 會自動加入實際 `cwd`。

無人值守執行前，須先在互動式 `agy` 工作階段完成 Google 認證。`--dangerously-skip-permissions` 不會執行 OAuth。

## 執行期驗證

```bash
agy --version
agy --help
agy models
agy changelog
```

若型錄已不包含 `gemini-3.7-flash-high`，應明確回報失敗並要求重新選擇模型，不可依賴隱含備援。
