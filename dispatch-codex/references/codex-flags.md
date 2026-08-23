# Codex CLI 派工參考

以下內容於 2026-08-23 透過這些來源驗證：

- `@openai/codex`／`codex-cli` 0.149.0
- 本機 `codex exec --help` 與 `codex debug models`
- [Codex 官方開發者命令參考](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [Codex 官方設定參考](https://learn.chatgpt.com/docs/config-file/config-reference)
- [GPT-5.6 Sol 官方模型頁面](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

## 非互動語法

```text
codex exec [OPTIONS] [PROMPT]
```

省略 `PROMPT` 或傳入 `-` 時，Codex 會從 stdin 讀取提示詞。`dispatchCodex()` 會省略位置提示詞並提供 stdin。

## 必要模型與推理強度

```text
-m gpt-5.6-sol --config model_reasoning_effort="max"
```

官方模型頁面列出 GPT-5.6 Sol 支援 `none`、`low`、`medium`、`high`、`xhigh`、`max`。Codex 0.149.0 的執行期型錄列出這些派工相關等級：

| 推理強度 | 執行期說明 |
|---|---|
| `low` | 較快、較少推理；也是 Sol 的 CLI 預設值 |
| `medium` | 平衡速度與推理深度 |
| `high` | 適合複雜問題的較深推理 |
| `xhigh` | 額外高強度推理 |
| `max` | 最大推理深度；本技能預設值 |
| `ultra` | 最大推理加上自動任務委派 |

「最深思考」應使用 `max`。只有在明確需要巢狀自動委派時才使用 `ultra`。

部分設定參考頁面的表格可能落後於 GPT-5.6 即時型錄，仍只列到 `xhigh`；GPT-5.6 官方模型頁面與目前 Codex 執行期型錄都已確認支援 `max`。

## `codex exec` 旗標

| 旗標 | 用途 |
|---|---|
| `-m`、`--model <model>` | 覆寫設定中的模型 |
| `-s`、`--sandbox <mode>` | `read-only`、`workspace-write` 或 `danger-full-access` |
| `-C`、`--cd <dir>` | 設定工作區根目錄 |
| `--add-dir <dir>` | 增加可寫入目錄 |
| `--skip-git-repo-check` | 允許在 Git 儲存庫之外執行 |
| `-c`、`--config <key=value>` | 可重複使用的 TOML 設定覆寫 |
| `--json` | 輸出 JSONL 事件 |
| `-o`、`--output-last-message <file>` | 儲存最終助理訊息 |
| `--output-schema <file>` | 以 JSON Schema 檔案驗證最終輸出 |
| `--ephemeral` | 不保存工作階段檔案 |
| `--ignore-user-config` | 忽略 `$CODEX_HOME/config.toml`；仍會載入認證 |
| `--ignore-rules` | 忽略使用者／專案 execpolicy 規則 |
| `--strict-config` | 遇到未知設定欄位時直接失敗 |
| `--dangerously-bypass-approvals-and-sandbox` | 停用核准與沙箱；只可用於隔離執行器 |

`--full-auto` 在 0.149.0 是已棄用的相容旗標，應改用 `--sandbox workspace-write`。目前官方參考也支援 `--yolo` 作為危險略過旗標的別名，但若確實需要使用，應採完整名稱以清楚表達意圖。

## 常用設定覆寫

設定值會以 TOML 解析。透過 `w-dispatch-ai` 時，每個 `key=value` 都是命令列參數陣列中的獨立元素，因此不需要 shell 專屬跳脫。

```javascript
extraArgs: [
    '--config', 'model_reasoning_effort="max"',
    '--config', 'model_reasoning_summary="concise"',
    '--config', 'model_verbosity="medium"',
    '--config', 'sandbox_workspace_write.network_access=true',
]
```

只有任務確實需要網路時才可開啟網路權限。

等效的持久化設定如下：

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "max"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false
```

## 輸出與延續工作階段

```text
codex exec --json -
codex exec --output-last-message ./result.txt -
codex exec resume --last "繼續任務"
codex exec resume <SESSION_ID> "後續指令"
```

`--json` 會輸出 JSONL，須逐行解析。只需要最終自然語言結果時，`--output-last-message` 是最簡單的介面。

## 執行期驗證

```bash
codex --version
codex exec --help
codex debug models
npm view @openai/codex version
```

若 `gpt-5.6-sol` 或 `max` 失敗，應檢查 CLI 版本、認證、帳號可用性與即時型錄。不可在使用者明確指定模型時靜默退回其他模型。
