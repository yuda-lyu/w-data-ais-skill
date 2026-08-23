---
name: dispatch-claude
description: 當任務需要委派給 Claude，或需要把 Claude 納入多代理工作流程時，透過 w-dispatch-ai 以非互動子程序方式執行 Claude Code CLI。
---

# dispatch-claude

使用 `w-dispatch-ai` 1.0.17+ 的 `dispatchClaude()` 執行 Claude Code。轉接器會呼叫 `claude -p`、透過 stdin 傳入提示詞、管理逾時與程序樹清理，並一律回傳結果物件，不會因一般 CLI 失敗而 reject。

需要變更 CLI 旗標、排查版本差異或改用非預設模型時，讀取 [references/claude-flags.md](references/claude-flags.md)。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則每次都必須傳入：

- 模型：`claude-fable-5`
- 推理強度：`max`

`w-dispatch-ai` 沒有 Claude 專用的 effort 選項，因此每次都須透過 `extraArgs` 傳入 `--effort max`。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchClaude('分析此專案並完成指定修改', {
    model: 'claude-fable-5',
    extraArgs: ['--effort', 'max'],
    cwd: '/absolute/path/to/project',
    timeoutMs: 300_000,
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

不可依賴使用者帳號的 Claude 預設值；為確保派工結果固定，必須明確指定 Fable 5 與 `max`。

## 權限

`dispatchClaude()` 的 `skipPermissions` 預設為 `true`，因此會加入 `--dangerously-skip-permissions`。只有在工作區與提示詞內容皆可信時才可使用。若輸入不可信或任務只需少數工具，應保留權限閘門並僅預先核准必要工具：

```javascript
await wda.dispatchClaude(prompt, {
    model: 'claude-fable-5',
    skipPermissions: false,
    extraArgs: [
        '--effort', 'max',
        '--allowedTools', 'Read,Glob,Grep',
    ],
});
```

## 結構化輸出

Claude 的 JSON 輸出應與轉接器的驗證器搭配使用：

```javascript
await wda.dispatchClaude(prompt, {
    model: 'claude-fable-5',
    extraArgs: ['--effort', 'max', '--output-format', 'json'],
    validate: 'json',
    maxRetries: 1,
});
```

若需限制結構，再透過 `--json-schema` 傳入 JSON Schema 字串。`stream-json` 會產生 JSONL 事件，不能使用只接受單一 JSON 文件的 `validate: 'json'`。

## 轉接器契約（w-dispatch-ai 1.0.17）

| 選項 | 轉接器預設值 | 行為 |
|---|---:|---|
| `exe` | `claude` | 執行檔名稱或絕對路徑 |
| `model` | 省略 | 有值時展開為 `--model <value>` |
| `skipPermissions` | `true` | 加入 `--dangerously-skip-permissions` |
| `extraArgs` | `[]` | 接在 Claude 固定旗標之後 |
| `timeoutMs` | `300000` | 逾時時終止程序樹 |
| `cwd` | 目前目錄 | 傳給子程序的工作目錄 |
| `validate`、`maxRetries`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli` |

提示詞透過 stdin 傳入，因此多行文字與 shell 特殊字元不需做命令列跳脫。不要再使用舊版的 `CLI_INPUT_FILE` 手法。

回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`。必須檢查 `ok`；一般 CLI 失敗不會造成函式 reject。

`w-dispatch-ai` 提供 UMD 預設匯出。請使用 `import wda from 'w-dispatch-ai'`，不要使用具名匯入。

## 失敗處理

- 模型或 effort 不存在：檢查 `claude --version` 與 `claude --help`；Claude Code 2.1.240 已確認支援 Fable 5 與 `max`。
- 認證失敗：執行 `claude auth`，或先完成互動式登入。
- 權限卡住或被拒：在可信隔離環境使用 `skipPermissions: true`，或明確設定 `--allowedTools`／`--permission-mode`。
- 回應截斷或耗時過長：提高逾時、拆分任務，或設定 `--max-budget-usd`；預算上限只會停止工作，不會提高完整度。
- 服務過載：只有在使用者接受替代模型時，才可加入 `--fallback-model opus` 備援設定。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g @anthropic-ai/claude-code@latest
claude --version
claude --help
```

截至 2026-08-23 審查時，npm 最新版為 `w-dispatch-ai` 1.0.17、Claude Code 2.1.240。
