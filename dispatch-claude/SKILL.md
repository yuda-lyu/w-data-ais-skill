---
name: dispatch-claude
description: 當任務需要委派給 Claude，或需要把 Claude 納入多代理工作流程時，透過 w-dispatch-ai 以非互動子程序方式執行 Claude Code CLI。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準：權限不足時會以 exit 0 交回看似正常卻沒做事的結果。派工逾時：審計／測試類一律 1 小時起跳，且必須背景執行，否則會被呼叫端在 10 分鐘內強制中斷。
---

# dispatch-claude

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchClaude()` 執行 Claude Code。轉接器會呼叫 `claude -p`、透過 stdin 傳入提示詞、管理逾時與程序樹清理，並一律回傳結果物件，不會因一般 CLI 失敗而 reject。

需要變更 CLI 旗標、排查版本差異或改用非預設模型時，讀取 [references/claude-flags.md](references/claude-flags.md)。

## 套件裝在哪：技能目錄的上一層，不要自己另裝

`w-dispatch-ai` 與其相依（`wsemi` 等）統一裝在**技能根目錄自己的 `node_modules`**——也就是**本技能目錄的上一層**（技能根有自己的 `package.json` 管這些相依），一般是 `~/.claude/skills/node_modules/`。

```javascript
import { createRequire } from 'module';
import path from 'path';

//技能根＝本技能目錄的上一層（本技能目錄之絕對路徑由載入本技能時取得）
const skillsRoot = path.resolve('<本技能目錄之絕對路徑>', '..');
const req = createRequire(import.meta.url);
const wda = req(path.join(skillsRoot, 'node_modules', 'w-dispatch-ai'));
//取回的就是預設匯出物件本身（不會再包一層 default）：wda.KINDS／wda.dispatchClaude／wda.budgetFor 直接可用
```

**三條鐵則**：

- **不要在專案裡 `npm install w-dispatch-ai`**。專案若另有一份，`import 'w-dispatch-ai'` 會優先解析到專案那份（通常較舊），**使用者更新技能根的版本就永遠傳不到你這裡**——他以為在測新版，你實際跑的是另一份。
- **找不到就回報使用者**（請他到技能根 `npm i`）。不要自己找地方安裝，也不要改用其他路徑硬湊。
- **查版本要指名路徑**：直接下 `npm ls w-dispatch-ai` 或 `require.resolve('w-dispatch-ai')` 都是**從當前專案解析**，看到的可能是別份。要確認真正被載入的那一份，讀 `<技能根>/node_modules/w-dispatch-ai/package.json` 的 `version`。

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
    timeoutMs: 3_600_000,   // 審計／複審／測試類 1 小時起跳，見「逾時」一節
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

### 第四層權限：提示詞前綴（走工作流時預設禁止寫檔）

權限共有四層，前三層在你手上、第四層在套件手上：①CLI 旗標（`--allowedTools`／`--permission-mode`）②轉接器選項（`skipPermissions`）③`providers.mjs` 條目自帶的鎖 ④**提示詞前綴**。

`w-dispatch-ai` 的工作流層（`dispatchAiWkf` 之 `callAi`／`runFanout`／`runRolePipeline`／`runFanoutPipeline`）**預設會在提示詞前掛上 `NO_SIDE_EFFECT`**，其內文明寫「禁止建立、修改或刪除任何檔案…任何寫入磁碟的動作都不會被採用」（唯讀查閱不在此限）。

**後果**：CLI 權限開好開滿，模型仍會照提示詞不寫檔——exit 0、回覆看似正常、報告與測試檔一個都沒有。**症狀與權限不足完全同型**，但照權限那條路排查（補 `--allowedTools`、改權限模式）永遠修不好。

**要落檔就必須顯式關閉**：傳 `promptPrefix: ''`。注意**只有空字串才算關閉**，傳 `null`／`undefined`／省略都會回退成掛上。直接呼叫 `dispatchClaude()` 不受影響——該前綴只在工作流層自動掛。

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
//--setting-sources project 不可省：不鎖設定來源，探測會繼承本機使用者層的 permissions.allow 而必過，
//換一台機器就失敗——那正是探測要擋掉的情況
const permArgs = ['--allowedTools', 'Read,Glob,Grep,Edit,Write,Bash', '--setting-sources', 'project'];

const probe = await wda.dispatchClaude(
    '讀取 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    {
        model: 'claude-fable-5-1',
        skipPermissions: false,
        extraArgs: [...permArgs, '--effort', 'low'],
        cwd,
        timeoutMs: 100_000,   //壓在呼叫端前景上限 120000 之內；再長就要背景執行
    },
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地
```

探測用低 effort 即可，它驗的是權限不是推理；正式派工沿用同一組權限選項，只把 effort 換回 `max`。探測失敗時先修權限，不要改提示詞重試。

## 逾時：審計、複審、測試類一律 1 小時起跳

**轉接器預設 300000（5 分鐘）對這類任務一定不夠**：審計要把模組讀完、複審要逐格核對、寫測試還得把測試跑起來。被逾時砍掉時 token 早就燒完卻拿不到任何結果——**逾時砍掉的不是等待時間，是整批已經付過錢的工作**。

**下限：`timeoutMs: 3_600_000`（1 小時），寧可保守。逾時是上限不是固定等待**——提早做完就提早回，給大不吃虧；給小才會兩頭空。

**五層都要放行，任一層先到就被截斷**（套件 README 之「Timeout 總覽」明訂這條階梯的數值須嚴格遞增）：

| 層 | 誰在殺 | 預設 | 這類任務要怎麼設 |
|---|---|---|---|
| ①呼叫端（Claude Code 的 Bash 工具） | harness 砍掉整個 node 行程 | 前景 120000，**上限 600000（10 分鐘）** | **一定要 `run_in_background: true`**——前景不論 `timeoutMs` 給多大，最多 10 分鐘就被砍。**但背景行程掛在 session 之下**，數小時級或不可因 session 更替而中斷者，須改走 detached ＋ `Monitor` |
| ②轉接器 `timeoutMs`（單次嘗試） | 逾時終止程序樹 | 300000 | `3_600_000` 起跳 |
| ③CLI 自身內層逾時 | — | Claude Code **沒有**此類旗標 | 不適用（只有 agy 有 `--print-timeout`） |
| ④單一名額之遞補鏈 `budgetMs` | 預算用盡即停止遞補 | `null`（不限） | 要嘛不給，要嘛 ≥ `鏈組數 K × 3_600_000`；給小了會把第②層壓下去 |
| ⑤工作流總時長 | 無獨立參數，由結構推導 | 無（刻意） | `runRolePipeline` 最壞 ≈ M×K×`timeoutMs`。K=4、M=3 配 1 小時就是 **12 小時**——先算再決定要不要拆階段 |

`--max-budget-usd` 是**花費**上限不是時間上限，達標會直接停工，不可拿來當逾時用。

**最常見的假象**：`timeoutMs` 明明給了 30 分鐘卻每次都在 2 分鐘斷——那是被第①層砍的，因為根本沒開背景。**只改 `timeoutMs` 沒用，兩層要一起改**。

**單次派工還會乘上去的**：`timeoutMs` 是**每次嘗試**的上限（`wsemi` 之 `execCli`），不是總時長——`maxRetries: N` 時總時長約 `timeoutMs × (1+N)`，再加重試間隔（`retryDelayMs` 預設 5000，實際間隔為 `retryDelayMs × 已重試次數`、單次上限 15000）。`ENOENT`（命令不存在）與 exit code 2（參數錯誤）視為不可重試，會立即中止。

**走遞補鏈或工作流時，三個值必須成套設，缺一即壞**（以下皆為 `w-dispatch-ai/src/dispatchAiFallback.mjs` 之實際行為）：

```javascript
{ timeoutMs: 3_600_000, minAttemptMs: 3_600_000, budgetMs: K * 3_600_000 }  // K＝遞補鏈之組數
```

| 選項 | 預設 | 實際行為與陷阱 |
|---|---|---|
| `budgetMs` | `null`（不限） | 有給時**每次嘗試的逾時被壓成 `min(timeoutMs, 剩餘預算)`**；給得比 `timeoutMs` 小，1 小時等於白設 |
| `minAttemptMs` | 20000 | **只有給了 `budgetMs` 才作用**。與 `timeoutMs` 同值時，第一家跑完剩餘必然不足 → 第二家永遠不開工；若 `budgetMs` 又給小了，**連第一次嘗試都不會發生**，直接回 `budget exhausted`（`errorType: 'budget'`），極易被誤讀成「額度用完」 |
| `cooldownMs` | `0`（關閉） | 內建觸發只有 HTTP 429 與逾時，而 **429 僅 REST 類偵測得到**；CLI 類的限流埋在 stderr 文字裡，內建規則抓不到 |
| `coolDetect` | 無 | CLI 類限流的唯一入口（依賴注入），例：`(r) => /FreeUsageLimitError/i.test(r.stderr || '')` |
| `shouldStop` | 無 | 1 小時派工中途要止損的唯一手段：於每次嘗試之間檢查，回 `ABORTED`／`errorType: 'aborted'`。它不會中斷進行中的那一次嘗試 |

**`budgetFor()` 有陷阱，不要照抄**：它**只累加條目自己的 `timeoutMs`**，讀不到你寫在 opt／`defaults` 的那一個；而套件內建的 providers 條目**刻意不帶 `timeoutMs`**，所以 `budgetFor(內建條目)` 恆為「條目數 × 300000」（9 條就是 45 分鐘）——比你的 1 小時還小，反而把它壓下去。要用它就得先把 `timeoutMs: 3_600_000` 逐條寫進每個條目，否則直接寫 `K × 3_600_000`。

**工作流層的覆寫順序**（細者覆蓋粗者）：`dispatchAiWkf` 的 `defaults` → 各工作流 `callOpt` → 階段／名額規格 → provider 條目。把 1 小時寫在 `defaults`、而某條目自帶較小的 `timeoutMs` 時，**條目會贏**。

**哪些任務屬於這一類**：審計、複審、調查、寫測試、跑測試、多檔重構，以及任何要求逐項核對或產長報告者。**能力探測與單問一句維持短逾時**（1–3 分鐘）——探測本來就要快失敗。

**與套件內建規劃的關係**：`w-dispatch-ai/src/providers.mjs` 檔頭的 timeout 規劃以「單一 AI 工作約 15 分鐘」估出 `timeoutMs: 1_200_000`，那是一般複雜任務的估法；**審計／複審／測試類以本節的 1 小時為下限**，不要照抄 20 分鐘把它調回去。四層串起來的權威整合說明在套件 README 的「Timeout 總覽」一節。

**被砍時要保住已完成的部分**：失敗結果的 `stdout` 只會留 500 字元（`wsemi/src/execCli.mjs`），所以 1 小時派工一律掛 `onStdout` 邊跑邊落檔，否則被砍就真的什麼都不剩。

**逾時與假成功是兩回事**：逾時被殺時 `errorType` 為 `timeout`；權限不足（或提示詞層被禁止寫檔）則是 `ok: true`／exit 0，**根本不會產生 `errorType`**。看到「沒有結果但也沒有錯誤」先分清是哪一種，別互相誤診。

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
| `env` | 省略 | 額外子程序環境變數，只作用於該次呼叫、不污染 `process.env`（如需以 `CLAUDE_CODE_EFFORT_LEVEL` 傳 effort 時用得到） |
| `validate`、`maxRetries`、`retryDelayMs`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli`；長任務建議掛 `onStdout` 邊跑邊落檔 |

提示詞透過 stdin 傳入，因此多行文字與 shell 特殊字元不需做命令列跳脫。不要再使用舊版的 `CLI_INPUT_FILE` 手法。

回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`。必須檢查 `ok`；一般 CLI 失敗不會造成函式 reject。

`w-dispatch-ai` 提供 UMD 預設匯出。請使用 `import wda from 'w-dispatch-ai'`，不要使用具名匯入。

### 表以外的細節一律查原始碼（當前安裝版）

上表只列常用鍵。**細部設定、權限、實際可用的模型、錯誤分類等只要不確定，就去讀當前安裝版的原始碼，不要憑記憶或猜測**——技能寫的是查核當日的狀態，套件與 CLI 都會滾動。

原始碼就在**技能根的 `node_modules/w-dispatch-ai/src/`**（見「套件裝在哪」一節）。**不要用 `npm ls` 或 `require.resolve` 查**——那兩者從當前專案解析，可能指到另一份。

| 想知道 | 讀哪個檔 |
|---|---|
| 完整選項、預設值、固定旗標與其順序、哪些鍵不轉傳給 `execCli` | `src/dispatchClaude.mjs`（固定旗標順序為 `-p` → `--dangerously-skip-permissions` → `--model` → `extraArgs`；`exe`／`model`／`skipPermissions`／`extraArgs`／`input` 為自用鍵，其餘鍵原樣轉給 `execCli`） |
| 有哪些 kind、何時用 CLI 類何時用 REST 類 | `src/adapters.mjs` 檔頭（判準只有一條：這次呼叫需不需要工具） |
| 實際可用且已被實測過的模型條目（含權限鎖、金鑰環境變數、實測耗時） | `src/providers.mjs` |
| `validate` 規則語法 | **CLI 類實際走的是 `wsemi/src/execCli.mjs` 內建的驗證器**（`w-dispatch-ai/src/buildValidator.mjs` 是 REST 類的平行實作，語法目前一致但各自維護）。`nonempty`／`json`／`min:N`，逗號串接須全部通過；但**規則名稱打錯（如 `nonemtpy`）會被靜默忽略、等於完全沒驗**——判斷式沒有 `else` 分支，只有 `min:` 的參數打錯（如 `min:abc`）才算失敗。validate 字串要逐字核對，或直接傳自訂函數 |
| `errorType` 值域與判準 | `src/getErrorType.mjs` 檔頭一覽（`params`／`timeout`／`spawn`／`validation`／`exec`／`http`／`fetch`…） |
| 逾時的完整機制 | **`README.md` 之「Timeout 總覽」是唯一把四層串起來的權威說明**（階梯結構、各參數預設、工作流總時長公式）；細節另見 `src/dfTimeoutMs.mjs`（統一預設 300000）、`src/budgetFor.mjs`（只累加條目層 `timeoutMs`）、`src/dispatchAiFallback.mjs`（`budgetMs`／`minAttemptMs`／`cooldownMs`／`coolDetect`／`shouldStop` 之實際行為）、`src/dispatchAiWkf.mjs` 檔頭 |
| 提示詞層之防寫前綴 | `src/wkf/noSideEffectPrefix.mjs`（前綴原文）、`src/wkf/callAiWithFallback.mjs`（預設掛上、`promptPrefix: ''` 才關閉） |
| 多供應商遞補、金鑰輪替、條目 id 命名規則 | `src/dispatchAiFallback.mjs` 檔頭 |

**檔頭註解是實測紀錄，不是設計說明**：踩過什麼坑、為什麼刻意不做某件事，都寫在那裡，而且通常比技能新。本轉接器檔頭另記載一條容易誤解的事——Claude Code 沿用帳號層級登入態，**沒有逐次注入金鑰的概念，故無 `key` 參數**；做供應商輪替時它是「另一個供應商」，不是「另一把金鑰」。與本技能所述不一致時，以原始碼與其實測註記為準，並回頭修技能。

## 失敗處理

- 模型或 effort 不存在：檢查 `claude --version` 與 `claude --help`；Claude Code 2.1.258 已實測支援 `claude-fable-5-1` 與 `--effort max`（`--print --output-format json` 之 `modelUsage` 回報實際使用 `claude-fable-5-1`）。`claude` 沒有 `models` 子命令，模型可用性只能以實跑或 `--help` 的別名說明確認。
- 認證失敗：執行 `claude auth`，或先完成互動式登入。
- 權限不足：症狀不是卡住也不是報錯，而是 exit 0 卻沒做事（見「權限」一節）。依任務所需的能力下限補 `--allowedTools`／`--permission-mode`，或在可信隔離環境使用 `skipPermissions: true`；補完再跑一次能力探測確認。
- 被中途砍斷（`errorType: 'timeout'`，或根本沒有結果物件）：先看是哪一層砍的——沒開 `run_in_background` 就是呼叫端砍的，開了才輪到 `timeoutMs`（見「逾時」一節）。審計／複審／測試類一律 1 小時起跳，不要靠拆任務去遷就過短的逾時。
- 回應截斷（有結果但內容不完整）：拆分任務或改用結構化輸出；`--max-budget-usd` 是花費上限，達標只會停工，不會提高完整度。
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
