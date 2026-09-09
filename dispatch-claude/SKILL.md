---
name: dispatch-claude
description: 當任務需要委派給 Claude，或需要把 Claude 納入多代理工作流程時，透過 w-dispatch-ai 以非互動子程序方式執行 Claude Code CLI。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準：權限不足時會以 exit 0 交回看似正常卻沒做事的結果。
---

# dispatch-claude

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchClaude()` 執行 Claude Code。轉接器會呼叫 `claude -p`、透過 stdin 傳入提示詞、管理逾時與程序樹清理，並一律回傳結果物件，不會因一般 CLI 失敗而 reject。

需要變更 CLI 旗標、排查版本差異或改用非預設模型時，讀取 [references/claude-flags.md](references/claude-flags.md)。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則每次都必須傳入：

- 模型：`claude-fable-5-1`（Claude Fable 5.1，目前最強）
- 推理強度：`max`

`w-dispatch-ai` 沒有 Claude 專用的 effort 選項，因此每次都須透過 `extraArgs` 傳入 `--effort max`。

必須寫完整模型名稱，不可用別名。`fable` 別名目前解析到 Fable 5.1，但別名會隨新版滾動；派工要的是可重現的固定版本，所以固定寫 `claude-fable-5-1`。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchClaude('分析此專案並完成指定修改', {
    model: 'claude-fable-5-1',
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

不可依賴使用者帳號的 Claude 預設值；為確保派工結果固定，必須明確指定 Fable 5.1 與 `max`。

## 權限：先定能力下限，再往下收斂

派工前先回答一個問題：**這個任務少了哪一項能力就做不出來？** 那是下限。安全考量只能在下限之上收斂範圍（限目錄、限工具、限指令樣式），不能低於下限——低於下限不是比較安全，是拿不到結果，而且多半還會被判成成功（見下一節實測）。

| 任務類型 | 能力下限 | Claude Code 的給法 |
|---|---|---|
| 純生成、翻譯、改寫（素材全在提示詞內） | 無 | `--tools ""` 停用全部工具 |
| 探索、調研、讀碼回答 | 讀檔 | 預設即可讀；目標在 `cwd` 之外時加 `--add-dir` |
| 審計、複審、調查 | 讀檔 ＋ 寫檔（報告落檔）＋ 唯讀查證指令 | `--allowedTools 'Read,Glob,Grep,Write,Bash(git *)'`；產出目錄以 `--add-dir` 開放 |
| 寫測試、驗證猜想、重現問題 | 讀檔 ＋ 寫測試檔 ＋ 執行測試 | `--allowedTools 'Read,Glob,Grep,Edit,Write,Bash'`，或 `--permission-mode acceptEdits` |
| 修改、實作 | 讀 ＋ 寫 ＋ 執行 | 工作區可信時用轉接器預設的 `skipPermissions: true` |

`dispatchClaude()` 的 `skipPermissions` 預設為 `true`（加入 `--dangerously-skip-permissions`），只有在工作區與提示詞內容皆可信時才適用。要收斂時，收的是上表右欄的範圍，不是把能力砍到下限以下。

- **審計必須自己讀檔**。把檔案內容貼進提示詞不算獨立審計：被派對象只看得到你挑給它的片段，找不出你漏掉的地方，而那正是複審的唯一價值。
- **驗證猜想必須能寫檔並執行**。不能寫測試就只剩推論；「我認為可能是 X」沒有可重現的執行結果，不是結論。
- **不想放權時，換的是任務或環境，不是砍權限**。把目標複製或 `git worktree` 出一份到獨立目錄，`cwd` 指向該處並只 `--add-dir` 該目錄，讓被派對象在裡面有完整讀寫執行，事後自己審 diff。給半套權限硬派，是拿「看起來安全」換掉任務本身。
- **沿用 `w-dispatch-ai/src/providers.mjs` 的條目要先看鎖**：表內 `claude:sonnet` 帶 `--disallowedTools Write,Edit,NotebookEdit,Bash`，那是給純文字生成與遞補用的唯讀檔位；照抄去派審計或寫測試必然交白卷，要先把對應工具放開。

### 權限不足是 exit 0 的假成功，不是錯誤

2026-09-08 於 Claude Code 2.1.261 實測。同一段提示詞（讀 `probe.txt` 第一行，並於同目錄建立 `out.txt`），差別只在載不載入使用者層設定：

| 條件 | stdout | 離開碼 | `out.txt` |
|---|---|---:|---|
| 未加 `--dangerously-skip-permissions`，載入使用者設定（本機該檔的 `permissions.allow` 含 `Write`、`Bash`） | `READ=… WRITE=DONE` | 0 | 已建立 |
| 未加 `--dangerously-skip-permissions` ＋ `--setting-sources project` | `READ=… WRITE=FAILED` | 0 | **未建立** |
| 同上，再加 `--allowedTools 'Read,Glob,Grep,Edit,Write,Bash'` | `READ=… WRITE=DONE` | 0 | 已建立 |

- **離開碼與非空輸出都不是成功判準**。兩列都是 exit 0、stdout 非空，`validate: 'nonempty'` 全部放行。派工端必須自己驗產物（檔案在不在、內容對不對），並在提示詞要求被派對象逐步自報 `DONE`／`FAILED`——第二列看得出失敗，正是因為提示詞規定了這個格式。
- **被派的 Claude 會繼承使用者層 `settings.json` 的 `permissions.allow`**。兩列唯一差別就是這個。「在我機器上跑得通」不代表換台機器跑得通；要可重現，就把權限顯式寫進旗標，或用 `--setting-sources` 指定來源。
- 讀取類工具在 print 模式預設可用，寫入與執行類才需要預先核准。所以「只給讀」的派工不會報錯，只會安靜地交不出東西。第三列則證明：把能力補到任務下限，不必動用 `--dangerously-skip-permissions` 也做得成。

### 派工前的能力探測

正式派工前，以**與正式派工相同的權限選項**跑一次最小探測，確認被派對象真的具備所需能力：

```javascript
const permArgs = ['--allowedTools', 'Read,Glob,Grep,Edit,Write,Bash'];

const probe = await wda.dispatchClaude(
    '讀取 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    {
        model: 'claude-fable-5-1',
        skipPermissions: false,
        extraArgs: [...permArgs, '--effort', 'low'],
        cwd,
        timeoutMs: 120_000,
    },
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地
```

探測用低 effort 即可，它驗的是權限不是推理；正式派工沿用同一組權限選項，只把 effort 換回 `max`。探測失敗時先修權限，不要改提示詞重試。

## 結構化輸出

Claude 的 JSON 輸出應與轉接器的驗證器搭配使用：

```javascript
await wda.dispatchClaude(prompt, {
    model: 'claude-fable-5-1',
    extraArgs: ['--effort', 'max', '--output-format', 'json'],
    validate: 'json',
    maxRetries: 1,
});
```

若需限制結構，再透過 `--json-schema` 傳入 JSON Schema 字串。`stream-json` 會產生 JSONL 事件，不能使用只接受單一 JSON 文件的 `validate: 'json'`。

## 轉接器契約（w-dispatch-ai 1.0.22）

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

### 表以外的細節一律查原始碼（當前安裝版）

上表只列常用鍵。**細部設定、權限、實際可用的模型、錯誤分類等只要不確定，就去讀當前安裝版的原始碼，不要憑記憶或猜測**——技能寫的是查核當日的狀態，套件與 CLI 都會滾動。

```bash
npm ls w-dispatch-ai                                     # 當前安裝版本
node -e "console.log(require.resolve('w-dispatch-ai'))"  # 安裝位置；其 ../src 即原始碼
```

| 想知道 | 讀哪個檔 |
|---|---|
| 完整選項、預設值、固定旗標與其順序、哪些鍵不轉傳給 `execCli` | `src/dispatchClaude.mjs`（固定旗標順序為 `-p` → `--dangerously-skip-permissions` → `--model` → `extraArgs`；`exe`／`model`／`skipPermissions`／`extraArgs`／`input` 為自用鍵，其餘鍵原樣轉給 `execCli`） |
| 有哪些 kind、何時用 CLI 類何時用 REST 類 | `src/adapters.mjs` 檔頭（判準只有一條：這次呼叫需不需要工具） |
| 實際可用且已被實測過的模型條目（含權限鎖、金鑰環境變數、實測耗時） | `src/providers.mjs` |
| `validate` 規則語法 | `src/buildValidator.mjs`：`nonempty`／`json`／`min:N`，逗號串接須全部通過；規則本身打錯（如 `min:abc`）算驗證失敗，不會靜默跳過 |
| `errorType` 值域與判準 | `src/getErrorType.mjs` 檔頭一覽（`params`／`timeout`／`spawn`／`validation`／`exec`／`http`／`fetch`…） |
| 逾時預設值 | `src/dfTimeoutMs.mjs` |
| 多供應商遞補、金鑰輪替、條目 id 命名規則 | `src/dispatchAiFallback.mjs` 檔頭 |

**檔頭註解是實測紀錄，不是設計說明**：踩過什麼坑、為什麼刻意不做某件事，都寫在那裡，而且通常比技能新。本轉接器檔頭另記載一條容易誤解的事——Claude Code 沿用帳號層級登入態，**沒有逐次注入金鑰的概念，故無 `key` 參數**；做供應商輪替時它是「另一個供應商」，不是「另一把金鑰」。與本技能所述不一致時，以原始碼與其實測註記為準，並回頭修技能。

## 失敗處理

- 模型或 effort 不存在：檢查 `claude --version` 與 `claude --help`；Claude Code 2.1.258 已實測支援 `claude-fable-5-1` 與 `--effort max`（`--print --output-format json` 之 `modelUsage` 回報實際使用 `claude-fable-5-1`）。`claude` 沒有 `models` 子命令，模型可用性只能以實跑或 `--help` 的別名說明確認。
- 認證失敗：執行 `claude auth`，或先完成互動式登入。
- 權限不足：症狀不是卡住也不是報錯，而是 exit 0 卻沒做事（見「權限」一節）。依任務所需的能力下限補 `--allowedTools`／`--permission-mode`，或在可信隔離環境使用 `skipPermissions: true`；補完再跑一次能力探測確認。
- 回應截斷或耗時過長：提高逾時、拆分任務，或設定 `--max-budget-usd`；預算上限只會停止工作，不會提高完整度。
- 服務過載：只有在使用者接受替代模型時，才可加入 `--fallback-model opus` 備援設定。

## 派什麼、怎麼驗收：依全域規範

本技能只管「怎麼呼叫 Claude Code」與「給到任務所需的能力」。審計／複審／規劃審核類派工之內容要求（先審表再審方案、逐格核對後採納）一律依全域規範 §9.1，對所有被派對象一體適用，不在此重複。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g @anthropic-ai/claude-code@latest
claude --version
claude --help
```

截至 2026-09-03 審查時，npm 最新版為 `w-dispatch-ai` 1.0.22、Claude Code 2.1.258。1.0.22 的 `dispatchClaude()` 固定旗標（`-p`、`--dangerously-skip-permissions`、`--model`）與選項預設值和 1.0.17 相同，本技能的呼叫方式不變。
