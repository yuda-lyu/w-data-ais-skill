---
name: dispatch-codex
description: 當任務需要委派給 Codex，或需要把 Codex 納入多代理工作流程時，透過 w-dispatch-ai 以非互動方式執行 OpenAI Codex CLI。
---

# dispatch-codex

使用 `w-dispatch-ai` 1.0.17+ 的 `dispatchCodex()` 執行自動化 Codex 任務。轉接器會呼叫 `codex exec`、透過 stdin 傳入提示詞、設定沙箱政策、略過 Git 儲存庫限制、管理逾時與程序樹清理，並以結果物件回報失敗。

需要變更模型／設定旗標、沙箱行為或非互動輸出時，讀取 [references/codex-flags.md](references/codex-flags.md)。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則每次都必須使用：

- 模型：`gpt-5.6-sol`
- 推理強度：`max`

`max` 是最深的單代理推理等級。Codex 另提供 `ultra`，其功能是最大推理加上自動任務委派；這是編排模式，不是更深的推理等級，因此不作為本技能預設值。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchCodex('分析此專案並完成指定修改', {
    model: 'gpt-5.6-sol',
    sandbox: 'workspace-write',
    extraArgs: ['--config', 'model_reasoning_effort="max"'],
    cwd: '/absolute/path/to/project',
    timeoutMs: 300_000,
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

轉接器已固定加入 `--skip-git-repo-check`，不可在 `extraArgs` 重複傳入。

## 沙箱與網路

轉接器的 `sandbox` 預設為 `workspace-write`，一般儲存庫工作應維持此設定。只分析、不修改時使用 `read-only`。只有在使用者任務確實需要，而且執行環境已妥善隔離時，才可使用 `danger-full-access`。

workspace-write 的網路權限是獨立設定。只有在任務需要安裝套件等網路操作時才啟用：

```javascript
await wda.dispatchCodex(prompt, {
    model: 'gpt-5.6-sol',
    sandbox: 'workspace-write',
    extraArgs: [
        '--config', 'model_reasoning_effort="max"',
        '--config', 'sandbox_workspace_write.network_access=true',
    ],
});
```

除非 Codex 本身在專用強化沙箱內執行，否則不可使用 `--dangerously-bypass-approvals-and-sandbox`。

## 輸出

若需取得進度事件，加入 `--json`；其輸出是 JSONL，不是單一 JSON 文件。下游自動化只需要最終回應時，使用 `--output-last-message <path>`；需限制最終回應結構時，使用 `--output-schema <path>`。

```javascript
await wda.dispatchCodex(prompt, {
    model: 'gpt-5.6-sol',
    extraArgs: [
        '--config', 'model_reasoning_effort="max"',
        '--json',
        '--output-last-message', './codex-result.txt',
    ],
});
```

使用 `--json` 時，不可搭配 `validate: 'json'`，因為 stdout 是 JSONL 事件流。

## 轉接器契約（w-dispatch-ai 1.0.17）

| 選項 | 轉接器預設值 | 行為 |
|---|---:|---|
| `exe` | `codex` | 執行檔名稱或絕對路徑 |
| `model` | 省略 | 有值時展開為 `-m <value>` |
| `sandbox` | `workspace-write` | 展開為 `--sandbox <value>` |
| `extraArgs` | `[]` | 接在 Codex 固定參數之後 |
| `timeoutMs` | `300000` | 逾時時終止程序樹 |
| `cwd` | 目前目錄 | 傳給子程序的工作目錄 |
| `validate`、`maxRetries`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli` |

提示詞透過 stdin 傳入。回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；應檢查 `ok`，不要假設失敗會造成 reject。

請使用套件的 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

## 模型驗證

OpenAI 官方文件將 `gpt-5.6-sol` 定位為 GPT-5.6 旗艦模型，並記載其支援 `max` 推理。Codex 0.149.0 的執行期模型型錄另列出 Sol 支援 `low`、`medium`、`high`、`xhigh`、`max`、`ultra`，且 CLI 預設為 `low`，所以必須明確傳入 `max`。

若模型被拒絕，應先檢查 CLI 與帳號，不可靜默切換模型：

```bash
codex --version
codex debug models
codex login status
```

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g @openai/codex@latest
codex --version
codex exec --help
```

截至 2026-08-23 審查時，npm 最新版為 `w-dispatch-ai` 1.0.17、Codex CLI 0.149.0。
