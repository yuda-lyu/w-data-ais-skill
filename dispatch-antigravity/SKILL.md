---
name: dispatch-antigravity
description: 當任務需要委派給 Antigravity，或需要使用其提供的 Gemini 模型時，透過 w-dispatch-ai 以非互動子程序方式執行 Google Antigravity CLI（agy）。
---

# dispatch-antigravity

使用 `w-dispatch-ai` 1.0.17+ 的 `dispatchAntigravity()` 執行自動化 Antigravity 任務。執行檔名稱是 `agy`。轉接器會設定 print 模式、權限、模型／effort、工作區目錄、互相配合的內外層逾時，並維持不 reject 的結果契約。

需要變更模型 slug、effort、print 模式旗標、逾時或工作區可視範圍時，讀取 [references/agy-flags.md](references/agy-flags.md)。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則必須使用：

- 模型：`gemini-3.7-flash-high`
- 推理強度：模型 slug 已內嵌的 `high`

`high` 是 Antigravity 目前提供的最深等級。預設時不要再傳入 `effort: 'high'`；模型 slug 已包含等級，重複設定沒有必要，而且維持單一設定來源可避免日後發生 slug／effort 衝突。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchAntigravity('分析此專案並完成指定修改', {
    model: 'gemini-3.7-flash-high',
    cwd: '/absolute/path/to/project',
    timeoutMs: 600_000,
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

未提供 `addDirs` 時，`w-dispatch-ai` 1.0.17 會自動把實際 `cwd` 加入 agy 工作區。需要更多目錄時明確傳入 `addDirs`；若傳入 `[]`，則不公開任何目錄。

## 模型與 effort 規則

`agy models` 會輸出 `<slug> <顯示名稱>`。必須傳入第一欄 slug。目前型錄包含：

```text
gemini-3.7-flash-high    Gemini 3.7 Flash (High)
gemini-3.7-flash-medium  Gemini 3.7 Flash (Medium)
gemini-3.7-flash-low     Gemini 3.7 Flash (Low)
```

Antigravity 也接受 `--effort low|medium|high`。若使用轉接器的 `effort` 選項，應搭配相容的基礎模型 slug。帶有等級的 slug 若再搭配不一致的 effort，agy 會拒絕執行。本技能預設固定使用 `gemini-3.7-flash-high`，並省略 `effort`。

## 提示詞傳輸與逾時

與另外三個轉接器不同，agy 要求提示詞作為 `--print` 的值，單次任務不會從 stdin 讀取提示詞。因此 `dispatchAntigravity()` 會將提示詞限制為 30,000 個字元，以保留 Windows 命令列長度的安全空間。

輸入更長時，應先把內容寫入允許存取目錄內的檔案，再派送一段引用該路徑的短提示詞。

逾時分為兩層：

- `timeoutMs`：外層 `execCli` 程序逾時，預設 300,000 毫秒。
- `printTimeout`：agy 自身的 `--print-timeout`；未提供時，轉接器會用 `timeoutMs - 30 秒` 推導，最低為 30 秒。

外層逾時設為 10 分鐘時，推導出的 agy 逾時為 570 秒。這能讓 agy 先回傳自身的逾時錯誤，再由外層終止程序樹。

## 權限與結構化輸出

轉接器的 `skipPermissions` 預設為 `true`，因此會加入 `--dangerously-skip-permissions`。只有在輸入與工作區可信時才可使用；需要保留權限閘門時應設為 `false`。

```javascript
await wda.dispatchAntigravity(prompt, {
    model: 'gemini-3.7-flash-high',
    extraArgs: ['--output-format', 'json'],
    timeoutMs: 600_000,
    validate: 'json',
});
```

使用 `stream-json` 時，應將 stdout 當成 JSONL 解析，且不可使用單一文件的 JSON 驗證器。`--json-schema` 可接受行內 schema 字串或 schema 檔案路徑。

## 轉接器契約（w-dispatch-ai 1.0.17）

| 選項 | 轉接器預設值 | 行為 |
|---|---:|---|
| `exe` | `agy` | 執行檔名稱或絕對路徑 |
| `model` | 省略 | 展開為 `--model <slug>` |
| `effort` | 省略 | 展開為 `--effort <level>` |
| `skipPermissions` | `true` | 加入 `--dangerously-skip-permissions` |
| `printTimeout` | 自動推導 | agy 內層逾時 |
| `addDirs` | 實際 `cwd` | 重複展開為 `--add-dir`；明確傳入 `[]` 可停用自動加入 |
| `extraArgs` | `[]` | 插入在 `--print <prompt>` 之前 |
| `timeoutMs` | `300000` | 外層程序樹逾時 |
| `cwd` | 目前目錄 | 子程序工作目錄，也是預設自動加入的工作區目錄 |
| `validate`、`maxRetries`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli` |

回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；必須檢查 `ok`。轉接器會捕捉提示詞過長與 spawn 失敗，維持不 reject 的契約。

請使用 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

## 執行期驗證

```bash
agy --version
agy --help
agy models
```

截至 2026-08-23 審查時，agy 1.1.18 與官方無介面模式文件都列出 `gemini-3.7-flash-high`。無介面模式遇到不存在的指定模型時會以非零狀態結束，不會靜默退回其他模型。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest

# Windows PowerShell
irm https://antigravity.google/cli/install.ps1 | iex

# macOS / Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash

agy --version
```

無人值守／無介面執行前，須先以互動方式完成 Google 認證。截至審查日，npm 最新版 `w-dispatch-ai` 為 1.0.17。
