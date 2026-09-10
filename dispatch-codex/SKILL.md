---
name: dispatch-codex
description: 當任務需要委派給 Codex，或需要把 Codex 納入多代理工作流程時，透過 w-dispatch-ai 以非互動方式執行 OpenAI Codex CLI。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準：權限不足時 Codex 會以 exit 0 交回看似正常卻沒做事的結果；另含 Windows 上讀非 ASCII（中文）檔案的 UTF-8 正解，預設讀法會拿到亂碼而外表正常。派工逾時：審計／測試類一律 1 小時起跳，且必須背景執行，否則會被呼叫端在 10 分鐘內強制中斷。
---

# dispatch-codex

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchCodex()` 執行自動化 Codex 任務。轉接器會呼叫 `codex exec`、透過 stdin 傳入提示詞、設定沙箱政策、略過 Git 儲存庫限制、管理逾時與程序樹清理，並以結果物件回報失敗。

需要變更模型／設定旗標、沙箱行為或非互動輸出時，讀取 [references/codex-flags.md](references/codex-flags.md)。

## 套件裝在哪：技能目錄的上一層，不要自己另裝

`w-dispatch-ai` 與其相依（`wsemi` 等）統一裝在**技能根目錄自己的 `node_modules`**——也就是**本技能目錄的上一層**（技能根有自己的 `package.json` 管這些相依），一般是 `~/.claude/skills/node_modules/`。

```javascript
import { createRequire } from 'module';
import path from 'path';

//技能根＝本技能目錄的上一層（本技能目錄之絕對路徑由載入本技能時取得）
const skillsRoot = path.resolve('<本技能目錄之絕對路徑>', '..');
const req = createRequire(import.meta.url);
const wda = req(path.join(skillsRoot, 'node_modules', 'w-dispatch-ai'));
//取回的就是預設匯出物件本身（不會再包一層 default）：wda.KINDS／wda.dispatchCodex／wda.budgetFor 直接可用
```

**三條鐵則**：

- **不要在專案裡 `npm install w-dispatch-ai`**。專案若另有一份，`import 'w-dispatch-ai'` 會優先解析到專案那份（通常較舊），**使用者更新技能根的版本就永遠傳不到你這裡**——他以為在測新版，你實際跑的是另一份。
- **找不到就回報使用者**（請他到技能根 `npm i`）。不要自己找地方安裝，也不要改用其他路徑硬湊。
- **查版本要指名路徑**：直接下 `npm ls w-dispatch-ai` 或 `require.resolve('w-dispatch-ai')` 都是**從當前專案解析**，看到的可能是別份。要確認真正被載入的那一份，讀 `<技能根>/node_modules/w-dispatch-ai/package.json` 的 `version`。

## Windows 前置：必須先完成一次性 elevated 沙箱設定，否則 Codex 完全無法讀寫

**在 Windows 上派 Codex 前，先做此檢查；未完成就派任務，一定失敗，且多半是靜默失敗。**

Codex CLI 0.149 起（0.152.1 仍如此），Windows 預設走 **elevated 沙箱**（建立專用使用者 `CodexSandboxOffline`／`CodexSandboxOnline`＋WFP 網路過濾＋家目錄 read ACL），這需要**一次性管理員（UAC）設定**。設定未完成時，Codex 的 execpolicy 會在 spawn 前拒絕**所有** shell 命令——包含 `Get-Content`、`rg`、`dir` 等唯讀命令。Codex 讀檔就是執行 shell，所以不論 `sandbox` 設 `read-only` 或 `workspace-write`，**檔案讀寫全部不能用**。stderr／`--json` 事件中會出現形如：

```
CreateProcess { message: "Rejected(\"... blocked by policy\")" }
```

### 判別是否已完成設定

```bash
ls ~/.codex/.sandbox/setup_marker.json
```

- 檔案**存在** → 設定已完成，`read-only`／`workspace-write` 皆可正常執行命令（2026-08-26 於 Codex 0.149.0 實測：設定完成前全擋、完成後皆通）。
- 檔案**不存在**，且 `~/.codex/.sandbox/sandbox.<日期>.log` 只有 `START` 沒有 `SUCCESS` → 設定未完成。

### 正解：互動跑一次 `codex` 完成設定

在使用者桌面 session 以互動模式執行一次 `codex`（非 `codex exec`），依提示同意 UAC 提權，讓它建立沙箱使用者與 ACL；完成後 `setup_marker.json` 出現，之後 `dispatchCodex()` 即可正常讀寫。此步驟需要真人按 UAC，**無法由本技能自動完成**；若檢查發現未設定，應停下來告知使用者去跑一次，不要改別的參數盲試。

### 臨時繞道（隔離較弱，須告知使用者）

無法取得管理員權限時，可經 `extraArgs` 改用 unelevated 沙箱：

```javascript
await wda.dispatchCodex(prompt, {
    model: 'gpt-5.6-sol',
    sandbox: 'workspace-write',
    extraArgs: [
        '--config', 'model_reasoning_effort="max"',
        '--config', 'windows.sandbox="unelevated"',
    ],
});
```

`windows.sandbox` 於 0.152.1 仍為受支援的設定鍵（以 `codex exec --strict-config -c 'windows.sandbox="unelevated"'` 實測不報 unknown configuration field，對照組 `windows.bogus_zz=1` 則報錯）。此模式無專用使用者與網路過濾，隔離較弱。`w-dispatch-ai` **刻意不**將它設為 Windows 預設，避免在已完成設定的機器上默默降級沙箱；本技能同樣不可自行預設帶入，只在使用者知情同意下使用。

### 靜默失敗警語

被擋時 Codex 常回「請貼上檔案內容」之類的合法字串，會通過 `validate: 'nonempty'` 被當成功。凡需 Codex 讀檔的任務：

- 派長任務前先以「讀某檔並原文引用第 N 行」做最小探測，確認能讀再派正式任務。
- `validate`（或工作流的 `check`）應要求回覆引用指定內容，不要只驗非空。
- 若回覆要求你提供檔案內容、或聲稱找不到／無法讀取明明存在的檔案，第一懷疑對象就是本節的沙箱設定，而非路徑或 prompt。

## Windows 讀非 ASCII 檔案：預設會亂碼，要指定 UTF-8 讀法

**症狀**：檔案在磁碟上是 UTF-8，Codex 讀回來卻是亂碼（中文變成 `??ａ?瑼?…` 這類字元）。它會拿這份亂碼去回答、比對、當成 patch 的上下文——審計結論與編輯跟著錯，而外表完全正常。2026-09-08 實測就撞到：同一支中文檔，Codex 一次自行改用讀 byte 轉十六進位才還原出正確內容，另一次直接把亂碼當答案回傳。

**成因**：Codex 在 Windows 以 `WindowsPowerShell\v1.0\powershell.exe -Command "…"` 執行命令（實測 argv；`$PSVersionTable.PSVersion` 回 `5.1.19041.6456`），也就是 **Windows PowerShell 5.1**；5.1 的 `Get-Content` 未指定編碼時以系統 ANSI 代碼頁解碼，不是 UTF-8。失真只發生在 shell 讀檔這一段——Codex 的 stdout 與 `--output-last-message` 本身是 UTF-8 乾淨的（同日實測中文原樣往返）。

**正解（2026-09-08 於 0.153.4 實測，兩種寫法皆通過）**：

```text
Get-Content -LiteralPath <檔案> -TotalCount <行數> -Encoding utf8
[System.IO.File]::ReadAllText((Join-Path (Get-Location) '<檔案>'))
```

同一支中文檔：未指定編碼時回 `??ａ?瑼?…`，上面兩種寫法都回完全正確的原文。要不要把這條寫進派工提示詞，由執行 agent 自行判斷；本技能的要求是——**凡任務會讀到非 ASCII 內容，就要用上面的讀法，並在收回結果時驗證沒有失真**。

**驗收（canary）**：提示詞裡指定一個你已知的中文字串，要求 Codex 原文引用，收回後逐字比對。比對不過是編碼問題，不是模型理解問題，不要靠改寫提示詞繞過去。

**寫入方向同樣有坑**：PS 5.1 的 `Out-File` 預設 UTF-16LE，`Set-Content` 與 `>` 走 ANSI。要 Codex 以 shell 寫出含中文的檔案時一律明寫 `-Encoding utf8`，收回後驗檔案內容。

**不要拿這兩招當解**：

- `chcp 65001` 改的是主控台代碼頁，不是 `Get-Content` 解碼所用的系統 ANSI 代碼頁，對本症狀沒有作用。
- `[Console]::OutputEncoding = [Text.Encoding]::UTF8` 是屬性設定，在 PowerShell 受限語言模式下會被擋（上游 issue #9767 回報 Codex 自己下這行時就撞到）。本機實測 `$ExecutionContext.SessionState.LanguageMode` 為 `FullLanguage`，但那是本機沙箱設定的結果，不能假設每台機器都一樣。

**影響全機的檔位（需使用者同意，本技能未實測）**：在 `$PROFILE` 加 `$PSDefaultParameterValues['Get-Content:Encoding']='utf8'`（實測所見 argv 未帶 `-NoProfile`，profile 應會載入），或改用 Windows 區域設定的「Beta：使用 Unicode UTF-8 提供全球語言支援」把系統 ANSI 代碼頁改成 65001。兩者都會影響本機其他程式，採用前先徵得使用者同意。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則每次都必須使用：

- 模型：`gpt-5.6-sol`（GPT-5.6 Sol，型錄 priority 1 之旗艦模型）
- 推理強度：`max`

`max` 是最深的單代理推理等級。Codex 另提供 `ultra`，其功能是最大推理加上自動任務委派；這是編排模式，不是更深的推理等級，因此不作為本技能預設值。

**必須明確傳入 effort**：0.152.1 執行期型錄顯示 `gpt-5.6-sol` 的 `default_reasoning_level` 是 `low`，不傳就是最淺推理。同代另有 `gpt-5.6-terra`（均衡日常）與 `gpt-5.6-luna`（快速廉價），兩者不作為預設。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchCodex('分析此專案並完成指定修改', {
    model: 'gpt-5.6-sol',
    sandbox: 'workspace-write',
    extraArgs: ['--config', 'model_reasoning_effort="max"'],
    cwd: '/absolute/path/to/project',
    timeoutMs: 3_600_000,   // 審計／複審／測試類 1 小時起跳，見「逾時」一節
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

轉接器已固定加入 `--skip-git-repo-check`，不可在 `extraArgs` 重複傳入。

## 沙箱與網路：先定能力下限，再往下收斂

派工前先回答一個問題：**這個任務少了哪一項能力就做不出來？** 那是下限。安全考量只能在下限之上收斂範圍（工作根、可寫目錄、網路），不能低於下限——低於下限不是比較安全，是拿不到結果。`codex exec` 的 approval 恆為 `never`（實測輸出標頭），被沙箱擋住時它不會回頭要求核准，只會照常把該回合結束掉，成敗得由你從產物與 stderr 判斷。

| 任務類型 | 能力下限 | Codex 的給法 |
|---|---|---|
| 純生成、翻譯、改寫（素材全在提示詞內） | 無 | `sandbox: 'read-only'` |
| 探索、調研、讀碼回答 | 讀檔＋跑唯讀命令 | `sandbox: 'read-only'`；Codex 讀檔就是執行 shell，Windows 須先完成「Windows 前置」一節的一次性沙箱設定，否則連唯讀命令都被擋 |
| 審計、複審、調查 | 讀檔 ＋ 寫檔（報告落檔）＋ 唯讀查證指令 | 報告要落檔就得 `sandbox: 'workspace-write'`；結果只走 stdout 時才可維持 `read-only` |
| 寫測試、驗證猜想、重現問題 | 讀檔 ＋ 寫測試檔 ＋ 執行測試 | `sandbox: 'workspace-write'`；工作根用 `-C`，工作區外還要寫的目錄用 `--add-dir`（help 原文：additional directories that should be **writable**）；要裝套件才另開網路 |
| 修改、實作 | 讀 ＋ 寫 ＋ 執行 | 轉接器預設的 `workspace-write` |

- **審計必須自己讀檔**。把檔案內容貼進提示詞不算獨立審計：被派對象只看得到你挑給它的片段，找不出你漏掉的地方，而那正是複審的唯一價值。
- **驗證猜想必須能寫檔並執行**。不能寫測試就只剩推論；「我認為可能是 X」沒有可重現的執行結果，不是結論。
- **不想放權時，換的是任務或環境，不是砍權限**。把目標複製或 `git worktree` 出一份到獨立目錄，以 `-C` 指向該處並用 `workspace-write`，讓被派對象在裡面有完整讀寫執行，事後自己審 diff。給半套權限硬派，是拿「看起來安全」換掉任務本身。
- **沿用 `w-dispatch-ai/src/providers.mjs` 的條目要先看鎖**：表內 `codex:gpt-5.6-luna` 帶 `sandbox: 'read-only'`，那是給純文字生成與遞補用的唯讀檔位；照抄去派審計落檔或寫測試必然做不成，要改成 `workspace-write`。

只有在使用者任務確實需要，而且執行環境已妥善隔離時，才可使用 `danger-full-access`。

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

### 第四層權限：提示詞前綴（走工作流時預設禁止寫檔）

權限共有四層，前三層在你手上、第四層在套件手上：①CLI 沙箱檔位與旗標 ②轉接器選項（`sandbox`）③`providers.mjs` 條目自帶的鎖 ④**提示詞前綴**。

`w-dispatch-ai` 的工作流層（`dispatchAiWkf` 之 `callAi`／`runFanout`／`runRolePipeline`／`runFanoutPipeline`）**預設會在提示詞前掛上 `NO_SIDE_EFFECT`**，其內文明寫「禁止建立、修改或刪除任何檔案…任何寫入磁碟的動作都不會被採用」（唯讀查閱不在此限）。

**後果**：沙箱給到 `workspace-write`，模型仍會照提示詞不寫檔——exit 0、回覆看似正常、報告與測試檔一個都沒有。**症狀與沙箱擋寫完全同型**，但照沙箱那條路排查永遠修不好（沙箱擋寫時 stderr 會有 `blocked by read-only sandbox`，提示詞層被擋則什麼訊號都沒有——這是分辨兩者的關鍵）。

**要落檔就必須顯式關閉**：傳 `promptPrefix: ''`。注意**只有空字串才算關閉**，傳 `null`／`undefined`／省略都會回退成掛上。直接呼叫 `dispatchCodex()` 不受影響——該前綴只在工作流層自動掛。

**附帶**：該前綴的舊措辭曾寫成「禁止執行任何指令」，把 Codex 的**讀檔**也一併擋掉（Codex 讀檔就是執行 shell），使它回「請貼上檔案內容」並通過 `validate: 'nonempty'`——與「靜默失敗警語」一節是同一個坑的兩個來源。

### 沙箱擋寫的實際樣子（2026-09-08 於 0.153.4 實測）

同一段提示詞（讀 `probe.txt` 第一行，再於同目錄建立 `out.txt`），以 `--sandbox read-only` 執行：

| 觀察點 | 結果 |
|---|---|
| 讀取 | 成功（Codex 起 PowerShell 讀檔——再次印證讀檔就是執行 shell） |
| 寫入 | 被拒，stderr 出現 `error=patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings` |
| `out.txt` | **未建立** |
| stdout | 一行看似正常的回覆 |
| 離開碼 | **0** |
| `--output-last-message <FILE>` 指定的檔案 | **有**建立——該檔由 CLI 本身寫出，不經模型的沙箱 |

- **離開碼與非空輸出都不是成功判準**：exit 0 ＋ stdout 非空，`validate: 'nonempty'` 直接放行，實際什麼都沒寫成。判成功要看產物是否落地，並檢查 stderr 有無 `blocked by read-only sandbox`／`blocked by policy` 字樣。
- 症狀與「Windows 前置」一節的靜默失敗同型，只是換到寫入維度：那節談的是讀不到，這裡是寫不了。
- read-only 之下若只需把**最終一段結果**落檔，`--output-last-message` 是可行路徑；要讓被派對象自己整理出多個檔案（報告、測試、fixture），就必須給 `workspace-write`。
- **對照組**：同一段提示詞改用 `sandbox: 'workspace-write'`，`out.txt` 確實建立、離開碼 0。差別只在沙箱檔位，不在提示詞——所以探測失敗時要改的是權限，不是提示詞。

### 派工前的能力探測

「Windows 前置」一節的讀取探測只驗得到讀。凡任務要寫檔或跑測試，探測要一次涵蓋讀與寫，且**用與正式派工相同的沙箱與目錄選項**：

```javascript
const probe = await wda.dispatchCodex(
    '讀取 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    {
        model: 'gpt-5.6-luna',
        sandbox: 'workspace-write',
        extraArgs: ['--config', 'model_reasoning_effort="low"'],
        cwd,
        timeoutMs: 100_000,   //壓在呼叫端前景上限 120000 之內；再長就要背景執行
    },
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地，並看 stderr 有無 blocked 字樣
```

探測用輕量模型與低推理即可，它驗的是權限不是推理；正式派工再換回 `gpt-5.6-sol` 與 `max`。探測失敗時先修沙箱與目錄，不要改提示詞重試。

## 逾時：審計、複審、測試類一律 1 小時起跳

**轉接器預設 300000（5 分鐘）對這類任務一定不夠**：審計要把模組讀完、複審要逐格核對、寫測試還得把測試跑起來，而 `max` 推理本身就慢。被逾時砍掉時 token 早就燒完卻拿不到任何結果——**逾時砍掉的不是等待時間，是整批已經付過錢的工作**。

**下限：`timeoutMs: 3_600_000`（1 小時），寧可保守。逾時是上限不是固定等待**——提早做完就提早回，給大不吃虧；給小才會兩頭空。

**五層都要放行，任一層先到就被截斷**（套件 README 之「Timeout 總覽」明訂這條階梯的數值須嚴格遞增）：

| 層 | 誰在殺 | 預設 | 這類任務要怎麼設 |
|---|---|---|---|
| ①呼叫端（Claude Code 的 Bash 工具） | harness 砍掉整個 node 行程 | 前景 120000，**上限 600000（10 分鐘）** | **一定要 `run_in_background: true`**——前景不論 `timeoutMs` 給多大，最多 10 分鐘就被砍。**但背景行程掛在 session 之下**，數小時級或不可因 session 更替而中斷者，須改走 detached ＋ `Monitor` |
| ②轉接器 `timeoutMs`（單次嘗試） | 逾時終止程序樹 | 300000 | `3_600_000` 起跳 |
| ③CLI 自身內層逾時 | — | `codex exec` **旗標表上沒有**此類旗標 | 不適用（只有 agy 有 `--print-timeout`）；惟 Codex 支援任意 `-c <key=value>` 設定覆寫，是否存在逾時類設定鍵未查證 |
| ④單一名額之遞補鏈 `budgetMs` | 預算用盡即停止遞補 | `null`（不限） | 要嘛不給，要嘛 ≥ `鏈組數 K × 3_600_000`；給小了會把第②層壓下去 |
| ⑤工作流總時長 | 無獨立參數，由結構推導 | 無（刻意） | `runRolePipeline` 最壞 ≈ M×K×`timeoutMs`。K=4、M=3 配 1 小時就是 **12 小時**——先算再決定要不要拆階段 |

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

**哪些任務屬於這一類**：審計、複審、調查、寫測試、跑測試、多檔重構，以及任何要求逐項核對或產長報告者。**能力探測與單問一句維持短逾時**（1–3 分鐘）——探測本來就要快失敗。**逾時與假成功是兩回事**：逾時被殺時 `errorType` 為 `timeout`；沙箱擋住、權限不足、或提示詞層被禁止寫檔則是 `ok: true`／exit 0，**根本不會產生 `errorType`**。看到「沒有結果但也沒有錯誤」先分清是哪一種，別互相誤診。

**與套件內建規劃的關係**：`w-dispatch-ai/src/providers.mjs` 檔頭的 timeout 規劃以「單一 AI 工作約 15 分鐘」估出 `timeoutMs: 1_200_000`，那是一般複雜任務的估法；**審計／複審／測試類以本節的 1 小時為下限**，不要照抄 20 分鐘把它調回去。四層串起來的權威整合說明在套件 README 的「Timeout 總覽」一節。

**被砍時要保住已完成的部分**：失敗結果的 `stdout` 只會留 500 字元（`wsemi/src/execCli.mjs`），所以 1 小時派工一律掛 `onStdout` 邊跑邊落檔，否則被砍就真的什麼都不剩。read-only 之下另可用 `--output-last-message`（由 CLI 自己寫出，不經模型沙箱）。

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

## 轉接器契約（w-dispatch-ai 1.0.22）

| 選項 | 轉接器預設值 | 行為 |
|---|---:|---|
| `exe` | `codex` | 執行檔名稱或絕對路徑 |
| `model` | 省略 | 有值時展開為 `-m <value>` |
| `sandbox` | `workspace-write` | 展開為 `--sandbox <value>` |
| `extraArgs` | `[]` | 接在 Codex 固定參數之後 |
| `timeoutMs` | `300000` | 逾時時終止程序樹 |
| `cwd` | 目前目錄 | 傳給子程序的工作目錄 |
| `env` | 省略 | 額外子程序環境變數，只作用於該次呼叫、不污染 `process.env` |
| `validate`、`maxRetries`、`retryDelayMs`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli`；長任務建議掛 `onStdout` 邊跑邊落檔 |

提示詞透過 stdin 傳入。回傳結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；應檢查 `ok`，不要假設失敗會造成 reject。

請使用套件的 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

### 表以外的細節一律查原始碼（當前安裝版）

上表只列常用鍵。**細部設定、沙箱與權限、實際可用的模型、錯誤分類等只要不確定，就去讀當前安裝版的原始碼，不要憑記憶或猜測**——技能寫的是查核當日的狀態，套件與 CLI 都會滾動。

原始碼就在**技能根的 `node_modules/w-dispatch-ai/src/`**（見「套件裝在哪」一節）。**不要用 `npm ls` 或 `require.resolve` 查**——那兩者從當前專案解析，可能指到另一份。

| 想知道 | 讀哪個檔 |
|---|---|
| 完整選項、預設值、固定旗標與其順序、哪些鍵不轉傳給 `execCli` | `src/dispatchCodex.mjs`（固定旗標順序為 `exec` → `--sandbox <值>` → `--skip-git-repo-check` → `-m` → `extraArgs`；`exe`／`model`／`sandbox`／`extraArgs`／`input` 為自用鍵，其餘鍵原樣轉給 `execCli`） |
| 有哪些 kind、何時用 CLI 類何時用 REST 類 | `src/adapters.mjs` 檔頭（判準只有一條：這次呼叫需不需要工具） |
| 實際可用且已被實測過的模型條目（含沙箱檔位、實測耗時） | `src/providers.mjs` |
| `validate` 規則語法 | **CLI 類實際走的是 `wsemi/src/execCli.mjs` 內建的驗證器**（`w-dispatch-ai/src/buildValidator.mjs` 是 REST 類的平行實作，語法目前一致但各自維護）。`nonempty`／`json`／`min:N`，逗號串接須全部通過；但**規則名稱打錯（如 `nonemtpy`）會被靜默忽略、等於完全沒驗**——判斷式沒有 `else` 分支，只有 `min:` 的參數打錯（如 `min:abc`）才算失敗。validate 字串要逐字核對，或直接傳自訂函數 |
| `errorType` 值域與判準 | `src/getErrorType.mjs` 檔頭一覽（`params`／`timeout`／`spawn`／`validation`／`exec`／`http`／`fetch`…） |
| 逾時的完整機制 | **`README.md` 之「Timeout 總覽」是唯一把四層串起來的權威說明**（階梯結構、各參數預設、工作流總時長公式）；細節另見 `src/dfTimeoutMs.mjs`（統一預設 300000）、`src/budgetFor.mjs`（只累加條目層 `timeoutMs`）、`src/dispatchAiFallback.mjs`（`budgetMs`／`minAttemptMs`／`cooldownMs`／`coolDetect`／`shouldStop` 之實際行為）、`src/dispatchAiWkf.mjs` 檔頭 |
| 提示詞層之防寫前綴 | `src/wkf/noSideEffectPrefix.mjs`（前綴原文）、`src/wkf/callAiWithFallback.mjs`（預設掛上、`promptPrefix: ''` 才關閉） |
| 多供應商遞補、金鑰輪替、條目 id 命名規則 | `src/dispatchAiFallback.mjs` 檔頭 |

**檔頭註解是實測紀錄，不是設計說明**：`src/dispatchCodex.mjs` 檔頭就完整記著 Windows 沙箱未設定時「所有命令 blocked by policy」的成因、實測日期，以及**為什麼刻意不把 `windows.sandbox="unelevated"` 設成 Windows 預設**（那會在已完成設定的機器上默默降級沙箱）。與本技能所述不一致時，以原始碼與其實測註記為準，並回頭修技能。

## 模型驗證

OpenAI 官方文件將 `gpt-5.6-sol` 定位為 GPT-5.6 旗艦模型（最強的 coding／computer use／research／cybersecurity 能力）。Codex 0.152.1 的執行期模型型錄（`codex debug models`）列出 Sol 支援 `low`、`medium`、`high`、`xhigh`、`max`、`ultra`，`default_reasoning_level` 為 `low`，所以必須明確傳入 `max`。

若模型被拒絕，應先檢查 CLI 與帳號，不可靜默切換模型：

```bash
codex --version
codex debug models
codex login status
```

## 派什麼、怎麼驗收：依全域規範

本技能只管「怎麼呼叫 Codex」。審計／複審／規劃審核類派工之內容要求（先審表再審方案、讀檔探測、逐格核對後採納）一律依全域規範 §9.1，對所有被派對象一體適用，不在此重複。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g @openai/codex@latest
codex --version
codex exec --help
ls ~/.codex/.sandbox/setup_marker.json   # Windows：存在才代表 elevated 沙箱設定已完成
```

截至 2026-09-03 審查時，npm 最新版為 `w-dispatch-ai` 1.0.22、Codex CLI 0.152.1。1.0.22 的 `dispatchCodex()` 固定參數（`exec`、`--sandbox`、`--skip-git-repo-check`、`-m`）與選項預設值和 1.0.17／1.0.19 相同，本技能的呼叫方式不變。Codex 0.152.1 相對 0.149.0 之派工相關差異：`--full-auto` 已移除（實測回 `unexpected argument`），新增 `--enable`／`--disable`／`--approve-for-me`／`--dangerously-bypass-hook-trust`／`--thread-source`／`--color`；詳見 references。
