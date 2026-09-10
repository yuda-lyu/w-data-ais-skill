---
name: dispatch-antigravity
description: 當任務需要委派給 Antigravity，或需要使用其提供的 Gemini 模型時，透過 w-dispatch-ai 以非互動子程序方式執行 Google Antigravity CLI（agy）。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準：權限不足時會以 exit 0 交回看似正常卻沒做事的結果。派工逾時：審計／測試類一律 1 小時起跳，且必須背景執行，否則會被呼叫端在 10 分鐘內強制中斷。
---

# dispatch-antigravity

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchAntigravity()` 執行自動化 Antigravity 任務。執行檔名稱是 `agy`，且 CLI 須為 **1.1.25 以上**（見下方「CLI 版本下限」）。轉接器會設定 print 模式、權限、模型／effort、工作區目錄、互相配合的內外層逾時，並維持不 reject 的結果契約。

需要變更模型 slug、effort、print 模式旗標、逾時或工作區可視範圍時，讀取 [references/agy-flags.md](references/agy-flags.md)。

## 套件裝在哪：技能目錄的上一層，不要自己另裝

`w-dispatch-ai` 與其相依（`wsemi` 等）統一裝在**技能根目錄自己的 `node_modules`**——也就是**本技能目錄的上一層**（技能根有自己的 `package.json` 管這些相依），一般是 `~/.claude/skills/node_modules/`。

```javascript
import { createRequire } from 'module';
import path from 'path';

//技能根＝本技能目錄的上一層（本技能目錄之絕對路徑由載入本技能時取得）
const skillsRoot = path.resolve('<本技能目錄之絕對路徑>', '..');
const req = createRequire(import.meta.url);
const wda = req(path.join(skillsRoot, 'node_modules', 'w-dispatch-ai'));
//取回的就是預設匯出物件本身（不會再包一層 default）：wda.KINDS／wda.dispatchAntigravity／wda.budgetFor 直接可用
```

**三條鐵則**：

- **不要在專案裡 `npm install w-dispatch-ai`**。專案若另有一份，`import 'w-dispatch-ai'` 會優先解析到專案那份（通常較舊），**使用者更新技能根的版本就永遠傳不到你這裡**——他以為在測新版，你實際跑的是另一份。
- **找不到就回報使用者**（請他到技能根 `npm i`）。不要自己找地方安裝，也不要改用其他路徑硬湊。
- **查版本要指名路徑**：直接下 `npm ls w-dispatch-ai` 或 `require.resolve('w-dispatch-ai')` 都是**從當前專案解析**，看到的可能是別份。要確認真正被載入的那一份，讀 `<技能根>/node_modules/w-dispatch-ai/package.json` 的 `version`。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則必須使用：

- 模型：`gemini-3.8-flash-high`
- 推理強度：模型 slug 已內嵌的 `high`

`high` 是 Antigravity 目前提供的最深等級（`--effort` 只有 `low|medium|high`，沒有 xhigh／max）。預設時不要再傳入 `effort: 'high'`；模型 slug 已包含等級，重複設定沒有必要，而且維持單一設定來源可避免日後發生 slug／effort 衝突。

**為何是 3.8**：Gemini 3.8 Flash 於 agy **1.1.25** 進入型錄（changelog 記為「Added Gemini 3.8 Flash to the model catalog when connecting with a `GEMINI_API_KEY`」），2026-09-03 本機 `agy models` 已實際列出三檔 slug，並以 `agy -p ... --model gemini-3.8-flash-high` 實跑通過（8.8 秒、exit 0）。`w-dispatch-ai` 1.0.22 之 providers 表同日自 3.7 升為 3.8，附實測：**回應 12.5s（3.7 為 62.2s）、讀檔 14.6s（3.7 為 57.6s）**。

型錄由伺服器供給，會獨立於 CLI 版本變動。固定模型前一律先跑 `agy models` 對照，不可憑推測寫入新 slug——2026-09-02 查核時 3.8 尚不存在，隔日即上架，就是這個道理。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchAntigravity('分析此專案並完成指定修改', {
    model: 'gemini-3.8-flash-high',
    cwd: '/absolute/path/to/project',
    timeoutMs: 3_600_000,   // 審計／複審／測試類 1 小時起跳，見「逾時」一節
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

未提供 `addDirs` 時，`w-dispatch-ai` 1.0.22 會自動把實際 `cwd` 加入 agy 工作區。需要更多目錄時明確傳入 `addDirs`；若傳入 `[]`，則不公開任何目錄——那等於被派對象什麼都讀不到，見「權限」一節。

## CLI 版本下限：派工須 agy ≥ 1.1.25

下限訂在 1.1.25 有三個理由，前兩個是**只會在非互動派工情境出現**的卡死（會讓子程序永不結束，只能等 `timeoutMs` 到期被殺）：

- 1.1.24：headless 呼叫在 stdout／stderr 被導管接走時，離開階段會卡住（未對保留的串流設 `FD_CLOEXEC`，子程序抓著呼叫端的 pipe 不放）。`dispatchAntigravity()` 正是以 pipe 收 stdout／stderr。
- 1.1.23：`models`、`agents` 這類子命令在繼承到未關閉的 stdin pipe 時會卡住而不執行。
- 1.1.25：Gemini 3.8 Flash 才進入型錄；舊版沒有本技能的預設模型。

因此本技能之型錄查核與派工都要求 agy 1.1.25 以上；版本較舊時先 `agy update`，不要把逾時當成模型或提示詞的問題來調。

## 模型與 effort 規則

`agy models` 會輸出 `<slug> <顯示名稱>`。必須傳入第一欄 slug。目前型錄包含：

```text
gemini-3.8-flash-high    Gemini 3.8 Flash (High)
gemini-3.8-flash-medium  Gemini 3.8 Flash (Medium)
gemini-3.8-flash-low     Gemini 3.8 Flash (Low)
gemini-3.7-flash-high    Gemini 3.7 Flash (High)
```

Antigravity 也接受 `--effort low|medium|high`。若使用轉接器的 `effort` 選項，應搭配相容的基礎模型 slug。帶有等級的 slug 若再搭配不一致的 effort，agy 會拒絕執行。本技能預設固定使用 `gemini-3.8-flash-high`，並省略 `effort`。

## 提示詞傳輸

與另外三個轉接器不同，agy 要求提示詞作為 `--print` 的值，單次任務不會從 stdin 讀取提示詞。因此 `dispatchAntigravity()` 會將提示詞限制為 30,000 個字元，以保留 Windows 命令列長度的安全空間。

輸入更長時，應先把內容寫入允許存取目錄內的檔案，再派送一段引用該路徑的短提示詞。

## 逾時：審計、複審、測試類一律 1 小時起跳

**轉接器預設 300000（5 分鐘）對這類任務一定不夠**：審計要把模組讀完、複審要逐格核對、寫測試還得把測試跑起來，而 agy 光是啟動就常吃掉數秒到二十幾秒。被逾時砍掉時 token 早就燒完卻拿不到任何結果——**逾時砍掉的不是等待時間，是整批已經付過錢的工作**。

**下限：`timeoutMs: 3_600_000`（1 小時），寧可保守。逾時是上限不是固定等待**——提早做完就提早回，給大不吃虧；給小才會兩頭空。

**五層都要放行，任一層先到就被截斷**（套件 README 之「Timeout 總覽」明訂這條階梯的數值須嚴格遞增）：

| 層 | 誰在殺 | 預設 | 這類任務要怎麼設 |
|---|---|---|---|
| ①呼叫端（Claude Code 的 Bash 工具） | harness 砍掉整個 node 行程 | 前景 120000，**上限 600000（10 分鐘）** | **一定要 `run_in_background: true`**——前景不論 `timeoutMs` 給多大，最多 10 分鐘就被砍。**但背景行程掛在 session 之下**，數小時級或不可因 session 更替而中斷者，須改走 detached ＋ `Monitor` |
| ②轉接器 `timeoutMs`（單次嘗試） | 逾時終止程序樹 | 300000 | `3_600_000` 起跳 |
| ③agy 自身 `--print-timeout` | agy 自己結束並回報逾時 | `5m0s` | 由 `timeoutMs` 推導為 `timeoutMs − 30 秒`（給 1 小時即 3570 秒）；**不要另外傳一個小的 `printTimeout` 把它蓋掉** |
| ④單一名額之遞補鏈 `budgetMs` | 預算用盡即停止遞補 | `null`（不限） | 要嘛不給，要嘛 ≥ `鏈組數 K × 3_600_000`；給小了會把第②③層一起壓下去 |
| ⑤工作流總時長 | 無獨立參數，由結構推導 | 無（刻意） | `runRolePipeline` 最壞 ≈ M×K×`timeoutMs`。K=4、M=3 配 1 小時就是 **12 小時**——先算再決定要不要拆階段 |

第③層設計上比第②層早 30 秒到期，為的是讓 agy 回自己的逾時錯誤而不是被外層砍掉程序樹。**但此順序只在 `timeoutMs ≥ 60 秒`時成立**：`printTimeout` 有 30 秒下限，`timeoutMs` 低於 60 秒時會被鉗成 30 秒，反而可能晚於外層——走遞補鏈被 `budgetMs` 壓到 60 秒以下時就會出現這種反轉。

**agy 的內層逾時同樣是「假成功」**（2026-09-10 實測）：`--print-timeout` 到期時 agy 回 **exit 0、`ok: true`、stdout 空**，stderr 只有 `[agy] print timeout after <t> with turn in progress; returning partial output`，**`errorType` 是空的**。也就是說第③層到期不會讓轉接器回失敗——一定要靠 `validate: 'nonempty'` 或自行驗產物才抓得到。

**最常見的假象**：`timeoutMs` 明明給了 30 分鐘卻每次都在 2 分鐘斷——那是被第①層砍的，因為根本沒開背景。**只改 `timeoutMs` 沒用，三層要一起對齊**。

**單次派工還會乘上去的**：`timeoutMs` 是**每次嘗試**的上限（`wsemi` 之 `execCli`），不是總時長——`maxRetries: N` 時總時長約 `timeoutMs × (1+N)`，再加重試間隔（`retryDelayMs` 預設 5000，實際間隔為 `retryDelayMs × 已重試次數`、單次上限 15000）。`ENOENT`（命令不存在）與 exit code 2（參數錯誤）視為不可重試，會立即中止。**`printTimeout` 於呼叫前依 `timeoutMs` 推導一次，重試沿用同一組旗標，故不會累加、也不會逐次重算**。

**走遞補鏈或工作流時，三個值必須成套設，缺一即壞**（以下皆為 `w-dispatch-ai/src/dispatchAiFallback.mjs` 之實際行為）：

```javascript
{ timeoutMs: 3_600_000, minAttemptMs: 3_600_000, budgetMs: K * 3_600_000 }  // K＝遞補鏈之組數
```

| 選項 | 預設 | 實際行為與陷阱 |
|---|---|---|
| `budgetMs` | `null`（不限） | 有給時**每次嘗試的逾時被壓成 `min(timeoutMs, 剩餘預算)`**（agy 的 `printTimeout` 也會跟著縮）；給得比 `timeoutMs` 小，1 小時等於白設 |
| `minAttemptMs` | 20000 | **只有給了 `budgetMs` 才作用**。與 `timeoutMs` 同值時，第一家跑完剩餘必然不足 → 第二家永遠不開工；若 `budgetMs` 又給小了，**連第一次嘗試都不會發生**，直接回 `budget exhausted`（`errorType: 'budget'`），極易被誤讀成「額度用完」 |
| `cooldownMs` | `0`（關閉） | 內建觸發只有 HTTP 429 與逾時，而 **429 僅 REST 類偵測得到**；CLI 類的限流埋在 stderr 文字裡，內建規則抓不到 |
| `coolDetect` | 無 | CLI 類限流的唯一入口（依賴注入），例：`(r) => /quota/i.test(r.stderr || '')` |
| `shouldStop` | 無 | 1 小時派工中途要止損的唯一手段：於每次嘗試之間檢查，回 `ABORTED`／`errorType: 'aborted'`。它不會中斷進行中的那一次嘗試 |

**`budgetFor()` 有陷阱，不要照抄**：它**只累加條目自己的 `timeoutMs`**，讀不到你寫在 opt／`defaults` 的那一個；而套件內建的 providers 條目**刻意不帶 `timeoutMs`**，所以 `budgetFor(內建條目)` 恆為「條目數 × 300000」（9 條就是 45 分鐘）——比你的 1 小時還小，反而把它壓下去。要用它就得先把 `timeoutMs: 3_600_000` 逐條寫進每個條目，否則直接寫 `K × 3_600_000`。

**工作流層的覆寫順序**（細者覆蓋粗者）：`dispatchAiWkf` 的 `defaults` → 各工作流 `callOpt` → 階段／名額規格 → provider 條目。把 1 小時寫在 `defaults`、而某條目自帶較小的 `timeoutMs` 時，**條目會贏**。

**哪些任務屬於這一類**：審計、複審、調查、寫測試、跑測試、多檔重構，以及任何要求逐項核對或產長報告者。**能力探測與單問一句維持短逾時**（1–3 分鐘）——探測本來就要快失敗。

**與套件內建規劃的關係**：`w-dispatch-ai/src/providers.mjs` 檔頭的 timeout 規劃以「單一 AI 工作約 15 分鐘」估出 `timeoutMs: 1_200_000`，那是一般複雜任務的估法；**審計／複審／測試類以本節的 1 小時為下限**，不要照抄 20 分鐘把它調回去。四層串起來的權威整合說明在套件 README 的「Timeout 總覽」一節。

**被砍時要保住已完成的部分**：失敗結果的 `stdout` 只會留 500 字元（`wsemi/src/execCli.mjs`），所以 1 小時派工一律掛 `onStdout` 邊跑邊落檔，否則被砍就真的什麼都不剩。

**逾時與假成功是兩回事**：外層逾時被殺時 `errorType` 為 `timeout`；而**內層 print-timeout、權限不足、提示詞層被禁止寫檔三者都是 `ok: true`／exit 0，不會產生 `errorType`**。看到「沒有結果但也沒有錯誤」先分清是哪一種，別互相誤診。

## 權限：先定能力下限，再往下收斂

派工前先回答一個問題：**這個任務少了哪一項能力就做不出來？** 那是下限。安全考量只能在下限之上收斂範圍（工作區目錄），不能低於下限——低於下限不是比較安全，是拿不到結果，而且會以 exit 0 回報（見下一節實測）。

| 任務類型 | 能力下限 | agy 的給法 |
|---|---|---|
| 純生成、翻譯、改寫（素材全在提示詞內） | 無 | `addDirs: []`，不公開任何目錄 |
| 探索、調研、讀碼回答 | 讀檔 | `addDirs` 須含全部待查目錄；純讀取任務**不需**跳過權限（2026-09-08 實測通過） |
| 審計、複審、調查 | 讀檔 ＋ 寫檔（報告落檔）＋ 唯讀查證指令 | `skipPermissions: true`；`addDirs` 同時含被審目錄與產出目錄 |
| 寫測試、驗證猜想、重現問題 | 讀檔 ＋ 寫測試檔 ＋ 執行測試 | 同上；agy 建檔與跑指令走的都是需要 `command` 權限的工具 |
| 修改、實作 | 讀 ＋ 寫 ＋ 執行 | 轉接器預設的 `skipPermissions: true` |

轉接器的 `skipPermissions` 預設為 `true`（加入 `--dangerously-skip-permissions`），只有在輸入與工作區可信時才適用。要收斂時 agy 有三個維度：**①工作區目錄**（`addDirs`，最實際——把目標複製或 `git worktree` 出一份到獨立目錄，只把該目錄加進工作區）、**②執行模式**（`extraArgs` 傳 `--mode plan` 為唯讀規劃檔位、`--mode accept-edits` 為可寫執行）、**③終端限制**（`--sandbox`）。後兩者本技能尚未實測，用前先照「派工前的能力探測」驗一次。

- **審計必須自己讀檔**。把檔案內容貼進提示詞不算獨立審計：被派對象只看得到你挑給它的片段，找不出你漏掉的地方，而那正是複審的唯一價值。
- **驗證猜想必須能寫檔並執行**。不能寫測試就只剩推論；「我認為可能是 X」沒有可重現的執行結果，不是結論。
- **`addDirs: []` 等於它什麼都讀不到**，探索與審計類任務必然交白卷。
- **沿用 `w-dispatch-ai/src/providers.mjs` 的條目要先看鎖**：表內 `agy:gemini-3.8-flash-high` 帶 `skipPermissions: false` 與 `addDirs: ['.']`，那是給純文字生成與遞補用的唯讀檔位。該條目註解記載的 2026-08-15 canary 實測與本節結論一致：無此鎖時要求建檔會真的落地，`false` 之下寫入被擋、唯讀工具照常，而且**被擋時 agy 回 `ok: true`、stdout 為空**。要寫入就得把它覆寫為 `true`。

### 第四層權限：提示詞前綴（走工作流時預設禁止寫檔）

權限共有四層，前三層在你手上、第四層在套件手上：①CLI 旗標（`--dangerously-skip-permissions`／`--mode`）②轉接器選項（`skipPermissions`／`addDirs`）③`providers.mjs` 條目自帶的鎖 ④**提示詞前綴**。

`w-dispatch-ai` 的工作流層（`dispatchAiWkf` 之 `callAi`／`runFanout`／`runRolePipeline`／`runFanoutPipeline`）**預設會在提示詞前掛上 `NO_SIDE_EFFECT`**，其內文明寫「禁止建立、修改或刪除任何檔案…任何寫入磁碟的動作都不會被採用」（唯讀查閱不在此限）。

**後果**：`skipPermissions: true` 給了、工作區也開了，模型仍會照提示詞不寫檔——exit 0、`ok: true`、報告與測試檔一個都沒有。**症狀與權限被自動拒絕完全同型**（agy 兩者都是 exit 0），差別只在 stdout：權限被拒時 stdout 會有 `jetski: … auto-denied` 那段訊息，提示詞層被擋則是模型正常回話但沒建檔。

**要落檔就必須顯式關閉**：傳 `promptPrefix: ''`。注意**只有空字串才算關閉**，傳 `null`／`undefined`／省略都會回退成掛上。直接呼叫 `dispatchAntigravity()` 不受影響——該前綴只在工作流層自動掛。

### 權限不足是 exit 0 的假成功，不是錯誤

2026-09-08 於 agy 1.1.27 實測，兩次都未加 `--dangerously-skip-permissions`，工作區皆以 `--add-dir` 開放：

| 任務 | stdout | 離開碼 | 檔案真的建立？ |
|---|---|---:|---|
| 只讀 `probe.txt` 第一行 | `READ=ZZPROBE-7F3A 這是探針檔的第一行` | 0 | 不適用（讀取成功） |
| 讀第一行 ＋ 建立 `out.txt` | `jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. command(<target>)). Alternatively, re-run with --dangerously-skip-permissions to auto-approve all tools.` | **0** | **否** |

- **離開碼與非空輸出都不是成功判準**。第二列是 exit 0、stdout 非空，`validate: 'nonempty'` 直接放行，但整輪沒有任何模型輸出、也沒有建立任何檔案。
- 無介面模式沒有人可以回答權限詢問，未預先核准者一律**自動拒絕**，不是等待、不是報錯。
- 訊息本身指出另一個檔位：在 agy 設定檔的 `permissions.allow` 加規則。用它之前先確認該設定檔路徑與規則語法（以最小探測驗證），否則就用 `skipPermissions: true` 搭配收斂過的 `addDirs`。

### 派工前的能力探測

正式派工前，以**與正式派工相同的權限與工作區選項**跑一次最小探測：

```javascript
const probe = await wda.dispatchAntigravity(
    '讀取工作區內 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    //timeoutMs 壓在呼叫端前景上限 120000 之內；再長就要背景執行
    //注意 100_000 推導出的 printTimeout 只有 70 秒，agy 啟動就要數秒到二十幾秒，探測任務要夠小
    { model: 'gemini-3.8-flash-low', addDirs, cwd, timeoutMs: 100_000, validate: 'nonempty' },
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地
```

探測可用低階模型，它驗的是權限不是推理；正式派工再換回預設模型。探測失敗時先修權限與 `addDirs`，不要改提示詞重試。

## 結構化輸出

print 模式的輸出格式以 `extraArgs` 指定：

```javascript
await wda.dispatchAntigravity(prompt, {
    model: 'gemini-3.8-flash-high',
    extraArgs: ['--output-format', 'json'],
    timeoutMs: 3_600_000,
    validate: 'json',
});
```

使用 `stream-json` 時，應將 stdout 當成 JSONL 解析，且不可使用單一文件的 JSON 驗證器。`--json-schema` 可接受行內 schema 字串或 schema 檔案路徑。

## 轉接器契約（w-dispatch-ai 1.0.22）

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
| `cwd` | 目前目錄 | 子程序工作目錄。**它本身不會讓 agy 看得到檔案**——agy 以自身 scratch 目錄為工作區，可視範圍只由 `--add-dir` 決定；未給 `addDirs` 時轉接器自動把有效 `cwd` 加進去，就是為了補這個落差 |
| `env` | 省略 | 額外子程序環境變數，只作用於該次呼叫、不污染 `process.env` |
| `validate`、`maxRetries`、`retryDelayMs`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli`；長任務建議掛 `onStdout` 邊跑邊落檔 |

回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；必須檢查 `ok`。轉接器會捕捉提示詞過長與 spawn 失敗，維持不 reject 的契約。

請使用 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

### 表以外的細節一律查原始碼（當前安裝版）

上表只列常用鍵。**細部設定、權限與工作區、實際可用的模型、錯誤分類等只要不確定，就去讀當前安裝版的原始碼，不要憑記憶或猜測**——技能寫的是查核當日的狀態，套件與 CLI 都會滾動。

原始碼就在**技能根的 `node_modules/w-dispatch-ai/src/`**（見「套件裝在哪」一節）。**不要用 `npm ls` 或 `require.resolve` 查**——那兩者從當前專案解析，可能指到另一份。

| 想知道 | 讀哪個檔 |
|---|---|
| 完整選項、預設值、固定旗標與其順序、哪些鍵不轉傳給 `execCli` | `src/dispatchAntigravity.mjs`（旗標順序為 `--dangerously-skip-permissions` → `--print-timeout` → `--model` → `--effort` → 各 `--add-dir` → `extraArgs` → `--print <prompt>`；自用鍵八個：`exe`／`model`／`effort`／`skipPermissions`／`printTimeout`／`addDirs`／`extraArgs`／`input`，其餘鍵原樣轉給 `execCli`；提示詞上限 30000 字元、`printTimeout` 推導公式與下限 30 秒亦在此） |
| 有哪些 kind、何時用 CLI 類何時用 REST 類 | `src/adapters.mjs` 檔頭（判準只有一條：這次呼叫需不需要工具） |
| 實際可用且已被實測過的模型條目（含權限鎖、`addDirs`、實測耗時） | `src/providers.mjs` |
| `validate` 規則語法 | **CLI 類實際走的是 `wsemi/src/execCli.mjs` 內建的驗證器**（`w-dispatch-ai/src/buildValidator.mjs` 是 REST 類的平行實作，語法目前一致但各自維護）。`nonempty`／`json`／`min:N`，逗號串接須全部通過；但**規則名稱打錯（如 `nonemtpy`）會被靜默忽略、等於完全沒驗**——判斷式沒有 `else` 分支，只有 `min:` 的參數打錯（如 `min:abc`）才算失敗。agy 的內層逾時只靠 `nonempty` 擋得住，這個字更不能打錯 |
| `errorType` 值域與判準 | `src/getErrorType.mjs` 檔頭一覽（提示詞過長之 `ENAMETOOLONG` 歸 `spawn`） |
| 逾時的完整機制 | **`README.md` 之「Timeout 總覽」是唯一把四層串起來的權威說明**（階梯結構、各參數預設、工作流總時長公式）；細節另見 `src/dfTimeoutMs.mjs`（統一預設 300000，其註解說明此值正是為對齊 agy 的 `print-timeout` 預設 5m0s）、`src/budgetFor.mjs`（只累加條目層 `timeoutMs`）、`src/dispatchAiFallback.mjs`（`budgetMs`／`minAttemptMs`／`cooldownMs`／`coolDetect`／`shouldStop` 之實際行為）、`src/dispatchAiWkf.mjs` 檔頭 |
| 提示詞層之防寫前綴 | `src/wkf/noSideEffectPrefix.mjs`（前綴原文）、`src/wkf/callAiWithFallback.mjs`（預設掛上、`promptPrefix: ''` 才關閉） |
| 多供應商遞補、金鑰輪替、條目 id 命名規則 | `src/dispatchAiFallback.mjs` 檔頭 |

**檔頭註解是實測紀錄，不是設計說明**：`src/dispatchAntigravity.mjs` 檔頭記著一組最容易誤判的實測（2026-08-13，以隨機 token 驗證）——**只給 `cwd` 而沒有 `--add-dir` 時，弱模型直接回「找不到檔案」、強模型自行摸索（116 秒，對照帶 `--add-dir` 的 6 秒），而且兩者都是 `ok: true`**；這種情況極易被誤判成「模型能力不足」，實際是可視範圍沒開。同檔另記載 `--print` 為帶值旗標（塞 stdin 會進互動模式卡住）、以及 model 與 effort 的衝突規則（帶檔位 slug 與 `--effort` **檔位不一致才拒絕**，一致則放行）。與本技能所述不一致時，以原始碼與其實測註記為準，並回頭修技能。

## 執行期驗證

```bash
agy --version     # 須 >= 1.1.25
agy --help
agy models        # 伺服器即時型錄, 唯一可信的 slug 來源
agy changelog     # 確認新版是否影響 headless 派工
```

截至 2026-09-03 審查時，本機 agy 1.1.25 之即時 `agy models` 列出 `gemini-3.8-flash-high` 為最新且最深的 Gemini 選項，並已實跑驗證。無介面模式遇到不存在的指定模型時會以非零狀態結束，不會靜默退回其他模型。

## 派什麼、怎麼驗收：依全域規範

本技能只管「怎麼呼叫 agy」與「給到任務所需的能力」。審計／複審／規劃審核類派工之內容要求（先審表再審方案、逐格核對後採納）一律依全域規範 §9.1，對所有被派對象一體適用，不在此重複。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest

# Windows PowerShell
irm https://antigravity.google/cli/install.ps1 | iex

# macOS / Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash

agy --version
agy update       # 版本低於 1.1.25 時升級
```

無人值守／無介面執行前，須先以互動方式完成 Google 認證。截至 2026-09-03 審查日，npm 最新版 `w-dispatch-ai` 為 1.0.22，本機 agy 為 1.1.25；1.0.22 的 `dispatchAntigravity()` 固定旗標（`--dangerously-skip-permissions`、`--print-timeout`、`--model`、`--effort`、`--add-dir`、`--print`）與選項預設值和 1.0.17 相同，本技能的呼叫方式不變，變的只有預設模型 slug。
