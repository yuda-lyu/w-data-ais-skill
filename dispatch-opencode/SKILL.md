---
name: dispatch-opencode
description: 當任務需要委派給 OpenCode，或需要使用 OpenCode 支援的模型供應商時，透過 w-dispatch-ai 以非互動子程序方式執行 OpenCode CLI。
---

# dispatch-opencode

使用 `w-dispatch-ai` 1.0.17+ 的 `dispatchOpencode()` 執行自動化 OpenCode 任務。轉接器會呼叫 `opencode run`、選擇代理與模型、透過 stdin 傳入提示詞、視需要注入僅限當次程序的供應商設定與憑證，並以結果物件回報失敗。

需要變更模型、供應商、variant、認證或輸出旗標時，讀取 [references/opencode-flags.md](references/opencode-flags.md)。

## 必要預設值

將使用者所稱的「deepflash 4 flash」解讀為 **DeepSeek V4 Flash**，其目前型錄名稱為 `deepseek-v4-flash`。除非使用者明確指定其他模型或推理強度，否則必須使用：

- 模型：`nvidia/deepseek-ai/deepseek-v4-flash`
- variant：`max`

NVIDIA 型錄項目支援推理，並提供 `none`、`high`、`max` 三種 variant。相同模型的 Cline 項目目前標示為不支援推理；舊 Zen ID `opencode/deepseek-v4-flash-free` 也已不在即時 OpenCode 供應商型錄中。因此兩者都無法滿足「最深推理」的預設要求。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchOpencode('分析此專案並完成指定修改', {
    model: 'nvidia/deepseek-ai/deepseek-v4-flash',
    extraArgs: ['--variant', 'max'],
    cwd: '/absolute/path/to/project',
    timeoutMs: 300_000,
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

此設定需要已完成 NVIDIA 供應商認證。若缺少憑證或存取權，不可靜默切換成其他模型。

## 認證與單次程序注入

可以沿用 `opencode auth login` 儲存的憑證，或只為這次子程序注入 NVIDIA 金鑰：

```javascript
await wda.dispatchOpencode(prompt, {
    model: 'nvidia/deepseek-ai/deepseek-v4-flash',
    provider: 'nvidia',
    key: process.env.NVIDIA_API_KEY,
    extraArgs: ['--variant', 'max'],
});
```

`key` 與 `provider` 都必須是非空字串。轉接器不會把兩者寫入磁碟，而是為子程序建立 `OPENCODE_AUTH_CONTENT`。不可印出金鑰，也不可把金鑰放進提示詞。

若使用 OpenCode 未內建的供應商，還須透過 `config` 傳入物件或 JSON 字串。轉接器會將其序列化為該子程序的 `OPENCODE_CONFIG_CONTENT`。

## 輸出與附件

```javascript
// JSONL 事件流
await wda.dispatchOpencode(prompt, {
    model: 'nvidia/deepseek-ai/deepseek-v4-flash',
    extraArgs: ['--variant', 'max', '--format', 'json'],
});

// 附加檔案
await wda.dispatchOpencode('分析附件', {
    model: 'nvidia/deepseek-ai/deepseek-v4-flash',
    extraArgs: ['--variant', 'max', '--file', './input.txt'],
});
```

`--format json` 會輸出 JSONL 事件，因此不可使用只接受單一 JSON 文件的 `validate: 'json'`。

## 權限

`dispatchOpencode()` 預設使用 `build` 代理。工作內容應限制在選定的專案目錄內。只有在使用者已授權無人值守修改，且執行環境可信時，才可加入 `--auto`；它會自動核准未被明確拒絕的權限。

## 轉接器契約（w-dispatch-ai 1.0.17）

| 選項 | 轉接器預設值 | 行為 |
|---|---:|---|
| `exe` | `opencode` | 執行檔名稱或絕對路徑 |
| `model` | 省略 | 展開為 `-m <provider/model>` |
| `agent` | `build` | 展開為 `--agent build` |
| `key`、`provider` | 省略 | 兩者同時存在時建立單次程序用的 `OPENCODE_AUTH_CONTENT` |
| `config` | 省略 | 將物件／字串注入為 `OPENCODE_CONFIG_CONTENT` |
| `env` | 省略 | 額外子程序環境變數 |
| `extraArgs` | `[]` | 接在 OpenCode 固定參數之後 |
| `timeoutMs` | `300000` | 逾時時終止程序樹 |
| `cwd` | 目前目錄 | 傳給子程序的工作目錄 |
| `validate`、`maxRetries`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli` |

提示詞透過 stdin 傳入。結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；必須檢查 `ok`。

請使用 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

## 型錄驗證

OpenCode 型錄會動態變更。使用已保存的 ID 或 variant 前，先重新整理並檢查：

```bash
opencode --version
opencode models nvidia --refresh
opencode models nvidia --verbose
opencode auth list
```

截至 2026-08-23 審查時，OpenCode 1.18.21 的型錄顯示 `nvidia/deepseek-ai/deepseek-v4-flash` 支援推理，variant 為 `none`、`high`、`max`。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g opencode-ai@latest
opencode --version
opencode run --help
```

同次審查時，npm 最新版為 `w-dispatch-ai` 1.0.17、`opencode-ai` 1.18.21。
