---
name: dispatch-opencode
description: 當任務需要委派給 OpenCode，或需要使用 OpenCode 支援的模型供應商時，透過 w-dispatch-ai 以非互動子程序方式執行 OpenCode CLI。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準，以及用 opencode agent list 實查有效權限的作法。
---

# dispatch-opencode

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchOpencode()` 執行自動化 OpenCode 任務。轉接器會呼叫 `opencode run`、選擇代理與模型、透過 stdin 傳入提示詞、視需要注入僅限當次程序的供應商設定與憑證，並以結果物件回報失敗。

需要變更模型、供應商、variant、認證或輸出旗標時，讀取 [references/opencode-flags.md](references/opencode-flags.md)。

## 必要預設值

除非使用者明確指定其他模型或推理強度，否則必須使用：

- 模型：`opencode/muse-spark-1.3-contributor-free`
- variant：`xhigh`

**`xhigh` 是此型錄項目最深的一檔，它沒有 `max`**——variants 只有 `minimal`、`low`、`medium`、`high`、`xhigh`。把其他模型慣用的 `max` 套過來會落空，別憑記憶填。`--variant` 沒有對應的轉接器選項，必須經 `extraArgs` 傳入；不傳就是跑供應商預設，不是 `xhigh`。

2026-09-08 之即時型錄（`opencode models opencode --verbose`）：

```text
供應商／模型：opencode/muse-spark-1.3-contributor-free
名稱：Muse Spark 1.3 Free
狀態：status: active（release_date 2026-09-02）
能力：reasoning: true、toolcall: true、attachment: true
variant：minimal、low、medium、high、xhigh
脈絡窗：1,048,576；最大輸出：131,072
費用：input／output 皆 0
```

同日以此設定實跑最小任務（讀檔並在工作目錄建檔）通過：工具呼叫正常、檔案確實建立、離開碼 0、中文內容原樣往返。

```javascript
import wda from 'w-dispatch-ai';

const result = await wda.dispatchOpencode('分析此專案並完成指定修改', {
    model: 'opencode/muse-spark-1.3-contributor-free',
    extraArgs: ['--variant', 'xhigh'],
    cwd: '/absolute/path/to/project',
    timeoutMs: 300_000,
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

此設定使用 OpenCode 自家供應商（`opencode`），完成一次 `opencode auth login` 即可，不需要第三方金鑰。若認證或型錄出問題，應明確回報，不可靜默切換成其他模型。

需要換模型時，同供應商內**已實測可用**的備選是 `opencode/nemotron-3.5-lightning-free`（2026-09-08 以預設 variant 跑同一最小任務通過）。其餘型錄項目未實跑，改用前先照「型錄驗證」查 `status`／`toolcall`／`variants`，再實跑一次；清單見 [references/opencode-flags.md](references/opencode-flags.md)。

### 不可再用的舊預設值

`nvidia/deepseek-ai/deepseek-v4-flash` 曾是本技能的必要預設值，**現已不可用**：2026-09-08 實跑回 HTTP 410 `Gone`，`detail` 為 has reached its end of life on 2026-08-07；同供應商的 `deepseek-v4-pro` 相同，dated 快照 `deepseek-v4-flash-0731`、`deepseek-v4-pro-0813` 則回 403 `Authorization failed`。

**但同一天 `opencode models nvidia --refresh` 仍照常列出這四個 ID**。型錄查得到不等於供應商還在服務——這是本技能換掉預設值的直接原因，也是「型錄驗證」一節要求實跑的原因。

## 認證與單次程序注入

預設模型走 OpenCode 自家供應商，`opencode auth login` 完成一次即可；`opencode auth list` 可查已存的憑證。

**可用模型＝已認證／已設定之供應商的模型，其餘等於不存在。** 2026-09-08 實測本機（已認證 `cline`、`nvidia`，加上內建 `opencode`）：`opencode models` 共 111 項、只涵蓋這三家；查一個沒設定的供應商回 `Error: Provider not found: <名稱>`，硬用 `-m <該供應商>/<模型>` 派工則回 `UnknownError`（伺服器錯誤）而不是清楚的「未認證」。看到這兩種錯誤，先查供應商有沒有設定，別懷疑模型名稱拼錯。

要用第三方供應商時，可沿用已儲存的憑證，或只為這次子程序注入金鑰：

```javascript
await wda.dispatchOpencode(prompt, {
    model: 'nvidia/<以 opencode models nvidia --verbose 查到的模型>',
    provider: 'nvidia',
    key: process.env.NVIDIA_API_KEY,
});
```

`key` 與 `provider` 都必須是非空字串。轉接器不會把兩者寫入磁碟，而是為子程序建立 `OPENCODE_AUTH_CONTENT`。不可印出金鑰，也不可把金鑰放進提示詞。

若使用 OpenCode 未內建的供應商（`opencode models <名稱>` 回 `Provider not found` 者），還須透過 `config` 傳入物件或 JSON 字串，內含該供應商的 base URL、模型與憑證來源；轉接器會將其序列化為該子程序的 `OPENCODE_CONFIG_CONTENT`。供應商、模型、base URL 與憑證必須互相對應，缺一就會以上述 `UnknownError` 收場。

## 輸出與附件

```javascript
// JSONL 事件流
await wda.dispatchOpencode(prompt, {
    model: 'opencode/muse-spark-1.3-contributor-free',
    extraArgs: ['--variant', 'xhigh', '--format', 'json'],
});

// 附加檔案
await wda.dispatchOpencode('分析附件', {
    model: 'opencode/muse-spark-1.3-contributor-free',
    extraArgs: ['--variant', 'xhigh', '--file', './input.txt'],
});
```

`--format json` 會輸出 JSONL 事件，因此不可使用只接受單一 JSON 文件的 `validate: 'json'`。

## 權限：先定能力下限，再往下收斂

派工前先回答一個問題：**這個任務少了哪一項能力就做不出來？** 那是下限。安全考量只能在下限之上收斂範圍（專案目錄），不能低於下限——低於下限不是比較安全，是拿不到結果。

| 任務類型 | 能力下限 | OpenCode 的給法 |
|---|---|---|
| 純生成、翻譯、改寫（素材全在提示詞內） | 無 | 提示詞自帶素材，`cwd` 不指向專案 |
| 探索、調研、讀碼回答 | 讀檔 | `cwd`（或 `--dir`）指向待查專案；跨專案要查的目錄也得在裡面 |
| 審計、複審、調查 | 讀檔 ＋ 寫檔（報告落檔）＋ 唯讀查證指令 | 同上，且**報告產出路徑必須落在同一個專案目錄內** |
| 寫測試、驗證猜想、重現問題 | 讀檔 ＋ 寫測試檔 ＋ 執行測試 | 同上；維持轉接器預設的 `build` 代理 |
| 修改、實作 | 讀 ＋ 寫 ＋ 執行 | 同上 |

- **審計必須自己讀檔**。把檔案內容貼進提示詞不算獨立審計：被派對象只看得到你挑給它的片段，找不出你漏掉的地方，而那正是複審的唯一價值。
- **驗證猜想必須能寫檔並執行**。不能寫測試就只剩推論；「我認為可能是 X」沒有可重現的執行結果，不是結論。
- **不想放權時，換的是任務或環境，不是砍權限**。把目標複製或 `git worktree` 出一份到獨立目錄，`cwd` 指向該處，讓被派對象在裡面有完整讀寫執行，事後自己審 diff。

### 有效權限來自代理的規則，不是旗標——用 `opencode agent list` 實查

`opencode agent list` 會印出每個代理的**實際生效規則**。2026-09-08 於 OpenCode 1.18.29 本機查得（節錄，`build` 代理）：

```text
*                   | allow | *
doom_loop           | ask   | *
external_directory  | ask   | *
external_directory  | allow | <過去互動時核准過的目錄，逐條累積>
```

由此得出三件事：

- **專案目錄內的讀寫執行，在 `build` 代理下不需要 `--auto`**。2026-09-08 實測：`opencode run --agent build`（未加 `--auto`）讀到檔並成功建立檔案，離開碼 0。
- **跨出專案目錄的存取屬 `external_directory`，預設是 `ask`**；無介面模式沒有人可以回答，就會被擋住。所以派工的關鍵不是加不加 `--auto`，而是 `--dir`／`cwd` 是否涵蓋任務要讀寫的**全部**路徑——包含報告與測試產物的落點。
- **這些規則含本機累積的核准紀錄，會隨機器不同**。同一段派工在別台機器上可能被擋，因此判斷權限一律以 `opencode agent list` 實查，不要用代理名稱或旗標推測（本機查得 `plan` 代理同樣是 `*: allow`，所以「換 plan 代理就等於唯讀」並不成立）。

需要跨出專案目錄時，優先把目錄範圍調對（改 `cwd`／`--dir`，或把待讀資料複製進來）。只有在使用者已授權無人值守修改、且執行環境可信時，才加 `--auto`；依 help 原文它會自動核准「未被明確拒絕」的權限，也就是連上表的 `ask` 檔位一併放行，用前先以最小探測確認實際行為。

**判成敗一律看產物是否落地**：本機規則為全允許，因此沒有取得 OpenCode 被擋時的實測樣本；但同型 CLI（Claude Code、agy、Codex）實測被擋時都是 exit 0 ＋ 非空輸出，`validate: 'nonempty'` 會直接放行，不能拿「有回話」當成功。

### 派工前的能力探測

正式派工前，以**與正式派工相同的目錄與代理選項**跑一次最小探測：

```javascript
const probe = await wda.dispatchOpencode(
    '讀取 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    { model, cwd, timeoutMs: 180_000 },
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地
```

探測失敗時先修目錄範圍與代理權限，不要改提示詞重試。

## 轉接器契約（w-dispatch-ai 1.0.22）

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

## 型錄驗證：查型錄之外還要實跑

OpenCode 型錄會動態變更，而且**型錄狀態與供應商實際服務狀態不同步**——已下線的模型照樣列在型錄裡（見「不可再用的舊預設值」）。所以固定任何 ID 或 variant 前，兩步都要做：

```bash
opencode --version
opencode auth list                          # 有哪些供應商可用
opencode models opencode --refresh          # 重抓型錄
opencode models opencode --verbose          # status / capabilities / variants / limit
```

查型錄要看四個欄位，缺一就可能派了做不了事的模型：

| 欄位 | 為什麼要看 |
|---|---|
| `status` | 非 `active` 者不要用 |
| `capabilities.toolcall` | **`false` 就不能讀寫檔案**，只能當純文字生成，審計與測試類任務一律不合格 |
| `capabilities.reasoning` 與 `variants` | 決定有沒有推理檔位、最深的一檔叫什麼（不是每個模型都有 `max`） |
| `limit.context` / `limit.output` | 長脈絡審計與長篇產出是否放得下 |

第二步是**實跑一次最小任務**（見「派工前的能力探測」），確認該 ID 真的回得了話、且真的能用工具。只查型錄不算驗證。

截至 2026-09-08，本機 OpenCode 1.18.29 重新整理後之型錄顯示 `opencode/muse-spark-1.3-contributor-free` 為 `status: active`、`reasoning: true`、`toolcall: true`、variant `minimal`／`low`／`medium`／`high`／`xhigh`、脈絡窗 1,048,576、最大輸出 131,072、費用 0，並以 `--variant xhigh` 實跑通過，故訂為必要預設值。

## 派什麼、怎麼驗收：依全域規範

本技能只管「怎麼呼叫 OpenCode」與「給到任務所需的能力」。審計／複審／規劃審核類派工之內容要求（先審表再審方案、逐格核對後採納）一律依全域規範 §9.1，對所有被派對象一體適用，不在此重複。

## 安裝檢查

```bash
npm install w-dispatch-ai@latest
npm install -g opencode-ai@latest
opencode --version
opencode run --help
```

2026-09-08 於本機 `opencode-ai` 1.18.29 查核：`opencode run` 之旗標（`--agent`、`-m`、`--variant`、`--dir`、`--auto`、`--format`、`--file`）皆與本技能所載一致；`w-dispatch-ai` 1.0.22 之 `dispatchOpencode()` 固定參數（`run`、`--agent`、`-m`）與選項預設值和 1.0.17 相同，本技能的呼叫方式不變，變的只有必要預設模型與 variant。
