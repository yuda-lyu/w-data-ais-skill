---
name: dispatch-opencode
description: 當任務需要委派給 OpenCode，或需要使用 OpenCode 支援的模型供應商時，透過 w-dispatch-ai 以非互動子程序方式執行 OpenCode CLI。內含依任務性質（審計／複審／調查／寫測試）決定權限下限的判準，以及用 opencode agent list 實查有效權限的作法。派工逾時：審計／測試類一律 1 小時起跳，且必須背景執行，否則會被呼叫端在 10 分鐘內強制中斷。
---

# dispatch-opencode

使用 `w-dispatch-ai` 的 `dispatchOpencode()` 執行自動化 OpenCode 任務。轉接器會呼叫 `opencode run`、選擇代理與模型、透過 stdin 傳入提示詞、視需要注入僅限當次程序的供應商設定與憑證，並以結果物件回報失敗。

**本技能對照的是 1.0.26**（`dispatchOpencode()` 之固定參數與選項自 1.0.17 起未變動，呼叫方式不受版本影響）。但**條目會隨版本增刪改名，改動頻率遠高於轉接器本身**——近兩版即有兩起：1.0.25 把 `oc:agnes-ai/agnes-2.5-flash` 改名為 `oc:agnes-ai/agnes-3.0-flash`（官方 2026-09-11 發布 3.0，探測五題 3.0 答對推理題而 2.5 答錯、總耗時 41s 對 281s，故兩條目同步換掉，舊 id 不再收錄），1.0.26 又新增 `oc:opencode/union-alpha`。**寫死 id 前先對安裝版核一次**，不要照抄本技能或別處的字面值；`pick` 打錯或用到已改名的 id 會靜默少一條（接法見「展開條目」）。實際安裝版一律讀 `<技能根>/node_modules/w-dispatch-ai/package.json` 的 `version`。

需要變更模型、供應商、variant、認證或輸出旗標時，讀取 [references/opencode-flags.md](references/opencode-flags.md)。

## 套件裝在哪：技能目錄的上一層，不要自己另裝

`w-dispatch-ai` 與其相依（`wsemi` 等）統一裝在**技能根目錄自己的 `node_modules`**——也就是**本技能目錄的上一層**（技能根有自己的 `package.json` 管這些相依），一般是 `~/.claude/skills/node_modules/`。

```javascript
import { createRequire } from 'module';
import path from 'path';

//技能根＝本技能目錄的上一層（本技能目錄之絕對路徑由載入本技能時取得）
const skillsRoot = path.resolve('<本技能目錄之絕對路徑>', '..');
const req = createRequire(import.meta.url);
const wda = req(path.join(skillsRoot, 'node_modules', 'w-dispatch-ai'));
//取回的就是預設匯出物件本身（不會再包一層 default）：wda.KINDS／wda.dispatchOpencode／wda.providers 直接可用
```

**三條鐵則**：

- **不要在專案裡 `npm install w-dispatch-ai`**。專案若另有一份，`import 'w-dispatch-ai'` 會優先解析到專案那份（通常較舊），**使用者更新技能根的版本就永遠傳不到你這裡**——他以為在測新版，你實際跑的是另一份。
- **找不到就回報使用者**（請他到技能根 `npm i`）。不要自己找地方安裝，也不要改用其他路徑硬湊。
- **查版本要指名路徑**：直接下 `npm ls w-dispatch-ai` 或 `require.resolve('w-dispatch-ai')` 都是**從當前專案解析**，看到的可能是別份。要確認真正被載入的那一份，讀 `<技能根>/node_modules/w-dispatch-ai/package.json` 的 `version`。**深層引用 `w-dispatch-ai/src/providers.mjs` 時同理**——請以技能根的絕對路徑引用，不要靠套件名解析。

深層引用是套件的既定路線：`package.json` **刻意不設 `exports` 欄位**，就是為了讓 `w-dispatch-ai/src/<檔名>.mjs` 這條路徑永遠可用（套件 README 之 Known design notes 明載，勿建議補上 `exports`）。頂層匯出物件則涵蓋全部常用項：`KINDS`、`NO_SIDE_EFFECT`、`dispatchAi`／`dispatchAiFallback`／`dispatchAiWkf`、各家 `dispatchXxx`、`providers`／`resolveProviders`／`readEnvFile`／`budgetFor`、`createFileStore`／`createUsageCounter`／`salvageTruncatedArray`，以及三支額度查詢函數（見「額度查詢沒有 opencode 版」）。

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
    timeoutMs: 3_600_000,   // 審計／複審／測試類 1 小時起跳，見「逾時」一節
    validate: 'nonempty',
});

if (!result.ok) {
    throw new Error(result.error);
}
console.log(result.stdout);
```

此設定使用 OpenCode 自家供應商（`opencode`），完成一次 `opencode auth login` 即可，不需要第三方金鑰。若認證或型錄出問題，應明確回報，不可靜默切換成其他模型。

需要換模型時，同供應商內**已實測可用**的備選是 `opencode/nemotron-3.5-lightning-free`（2026-09-08 以預設 variant 跑同一最小任務通過）。其餘型錄項目未實跑，改用前先照「型錄驗證」查 `status`／`toolcall`／`variants`，再實跑一次；清單見 [references/opencode-flags.md](references/opencode-flags.md)。

**走遞補鏈時，這個預設模型在條目表內已有現成條目**：`oc:opencode/muse-spark-1.3-contributor-free`（見「條目表」一節）。但該條目**自帶唯讀鎖**且**不帶 `--variant`**——要 `xhigh` 得自己補 `extraArgs`，要寫檔得放開 `config.permission`，兩者都不會自動跟著本節的必要預設值走。

### 不可再用的舊預設值

`nvidia/deepseek-ai/deepseek-v4-flash` 曾是本技能的必要預設值，**現已不可用**：2026-09-08 實跑回 HTTP 410 `Gone`，`detail` 為 has reached its end of life on 2026-08-07；同供應商的 `deepseek-v4-pro` 相同，dated 快照 `deepseek-v4-flash-0731`、`deepseek-v4-pro-0813` 則回 403 `Authorization failed`。

**但同一天 `opencode models nvidia --refresh` 仍照常列出這四個 ID**。型錄查得到不等於供應商還在服務——這是本技能換掉預設值的直接原因，也是「型錄驗證」一節要求實跑的原因。

## 認證與單次程序注入

預設模型走 OpenCode 自家供應商，`opencode auth login` 完成一次即可；`opencode auth list` 可查已存的憑證。

**可用模型＝已認證／已設定之供應商的模型，其餘等於不存在。** 2026-09-08 實測本機（已認證 `cline`、`nvidia`，加上內建 `opencode`）：`opencode models` 共 111 項、只涵蓋這三家；查一個沒設定的供應商回 `Error: Provider not found: <名稱>`，硬用 `-m <該供應商>/<模型>` 派工則回 `UnknownError`（伺服器錯誤）而不是清楚的「未認證」。看到這兩種錯誤，先查供應商有沒有設定，別懷疑模型名稱拼錯。

**還有第三種錯誤長相：`Model is disabled`（401）**——那是**金鑰所屬工作區沒開這個模型**，不是模型不存在、也不是金鑰無效。同一批金鑰換一把就可能通（不同工作區設定不同），正解是到該工作區把模型開起來。注意有些模型在「不登入」時反而可用（見「不帶金鑰的條目」），所以注入金鑰不一定比較保險。

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

## 第三方供應商：型錄查不到 ≠ 不能用

`opencode models` 只列得出 CLI 已認證或已設定的供應商，但 `config` 注入是**當次程序**生效的，所以型錄查不到的供應商照樣派得動。**`Provider not found` 只代表沒註冊在 CLI 端，不是「這個模型不能用」的結論**——要判斷能不能用，看的是有沒有 provider 定義與金鑰。

## 條目表：`providers.mjs` 的 6 個 opencode 條目

`w-dispatch-ai` 自帶一份實測可用的條目表 `w-dispatch-ai/src/providers.mjs`，直接引用即可，不必自己重試一遍。**它是本技能所有模型資訊的上游**，與本技能不一致時以它為準。截至 1.0.26 全表 20 條，其中 `kind: 'opencode'` 者 6 條：

| 條目 id | `model` | `provider` | 金鑰環境變數 | 備註（條目註解之實測紀錄） |
|---|---|---|---|---|
| `oc:opencode/muse-spark-1.3-contributor-free` | `opencode/muse-spark-1.3-contributor-free` | `opencode` | `OPENCODE_KEYS` | **即本技能必要預設模型**；2026-09-03 實測 6.1s。同模型走 zen REST 回 HTTP 500，只有 CLI 路徑可用 |
| `oc:opencode/muse-spark-1.2-contributor-free` | `opencode/muse-spark-1.2-contributor-free` | `opencode` | `OPENCODE_KEYS` | 2026-09-03 實測 8.1s |
| `oc:opencode/union-alpha` | `opencode/union-alpha` | `opencode` | **無**（刻意不帶） | **1.0.26 新增**；限時免費之 stealth 模型。2026-09-17 實測 6.8s 成功，詳見下方「不帶金鑰的條目」 |
| `oc:opencode/deepseek-v4-flash-free` | `opencode/deepseek-v4-flash-free` | `opencode` | `OPENCODE_KEYS` | 2026-08-21 實測失敗（`UnknownError`）；依套件哲學保留不移除，恢復的偵測就是下次再打 |
| `oc:agnes-ai/agnes-3.0-flash` | `agnes-ai/agnes-3.0-flash` | `agnes-ai` | `AGNES_KEYS` | 第三方，baseURL `https://apihub.agnes-ai.com/v1`。**1.0.25 才改為 3.0**（原 `agnes-2.5-flash`），REST 版 `agnes:agnes-3.0-flash` 同步改名 |
| `oc:poolside/poolside/laguna-s-2.1` | `poolside/poolside/laguna-s-2.1` | `poolside` | `POOLSIDE_KEYS` | 第三方，baseURL `https://inference.poolside.ai/v1` |

**六條全部自帶 `config.permission: { edit:'deny', write:'deny', bash:'deny' }`**——條目表的定位是唯讀調用。派審計、寫測試前要逐條放開，理由見「權限」一節。

**Poolside 的 `model` 是三段**：供應商名 `poolside` ＋ 模型 id `poolside/laguna-s-2.1`（模型 id 本身就含斜線），不是寫錯。

**全取條目表時會混進一條非文字生成的條目**：1.0.26 新增了 kind `api-typesafe-systemone`（決策模型 `typesafe:jev-latest`，輸入是待評估狀態、輸出是型別化答案，呼叫時必須另給 `questions`）。它的輸出形狀與文字生成完全不同，**不可與文字生成條目混在同一條遞補鏈**；全取時它會因缺 `questions` 以 `params` 錯誤在 0ms 失敗後換下一家，不影響其他家，但要它就得用 `pick` 單獨取出。

### 同一模型走 REST 走不通時，改走 `oc:` 往往就通

opencode CLI 內建各模型正確的端點與 SDK，而 REST 側的失敗有兩種完全不同的成因，**都不是「模型壞了」**：

| REST 失敗長相 | 真正的成因 | 處置 |
|---|---|---|
| HTTP 500 | **端點型別錯配**：zen 的端點依模型家族而異，muse-spark 系走 `/responses` 不走 `/chat/completions`（回 500 而非 404，極易被誤判成暫時故障而反覆重試） | 改用對的 kind，或改走 `oc:` 版 |
| HTTP 403 `FreeTierError`（free tier can only be used from within OpenCode） | **政策性阻擋**：該免費模型只開放 opencode 客戶端，REST 直呼被刻意擋下（2026-09-17 以 union-alpha 實測） | **只能收 `oc:` 版**，再等再試也不會通 |

本技能的預設模型屬第一種，union-alpha 屬第二種。

### 不帶金鑰的條目：`oc:opencode/union-alpha`

這是表內唯一**刻意不帶 `envVar`** 的 opencode 條目——不注入金鑰時 opencode 走自身的免費存取即可用（2026-09-17 以 CLI 1.18.31 實測 6.8s 成功）。套件之所以不綁金鑰，是因為實測 `OPENCODE_KEYS` 的第 1 把金鑰所屬工作區未開此模型（回 `Model is disabled`），第 2 把雖可用但該工作區會預設開啟新模型（可能非免費），兩者都不適合當預設。

**前提是本機 opencode 未登入（無 `auth.json`）**；若日後以金鑰登入，得先到該工作區把此模型開起來，否則就會撞上 `Model is disabled`。

### 展開條目：`resolveProviders` 的五個回傳欄位

```javascript
import providers from 'w-dispatch-ai/src/providers.mjs';
import resolveProviders from 'w-dispatch-ai/src/resolveProviders.mjs';
import readEnvFile from 'w-dispatch-ai/src/readEnvFile.mjs';

// 金鑰放 .env（OPENCODE_KEYS / AGNES_KEYS / POOLSIDE_KEYS，逗號分隔多把）
// 用 readEnvFile 而非 process.loadEnvFile：後者會把金鑰塞進 process.env，多專案並行時互相覆蓋
let env = readEnvFile('./.env');

let { providers: ps, table, skipped, missing, hints } = resolveProviders(providers, {
    env,
    pick: ['oc:opencode/muse-spark-1.3-contributor-free', 'oc:agnes-ai/agnes-3.0-flash'],
});

// pick 打錯字會「靜默少一條」，鏈比你以為的短——一律先擋下來
if (missing.length > 0) {
    throw new Error(`unknown provider id(s): ${missing.map((id) => `${id} (did you mean ${hints[id]}?)`).join(', ')}`);
}
```

| 回傳欄位 | 內容 |
|---|---|
| `providers` | 展開後之條目陣列，直接餵 `dispatchAiFallback`；`pick` 的順序即遞補優先序 |
| `table` | id 對條目之物件，直接餵 `dispatchAiWkf` |
| `skipped` | 缺對應環境變數而**自動停用**的條目（不中斷、不 throw），形如 `{ id, envVar }` |
| `missing` | `pick` 查無之 id |
| `hints` | `missing` 之拼寫提示（最接近的可用 id），僅相似度最高者非保證正解 |

**`skipped` 與 `missing` 都要看**：前者是「金鑰沒給」、後者是「id 打錯」，兩種都讓鏈默默變短，而症狀都是「遞補很快就走完卻沒成功」。

### 展開後的後處理：`exes` 與 `patch`

兩者都在 `resolveProviders` 內施作，故 `providers` 與 `table` 同源產出、必然一致——**不要拿回傳的陣列自己 map**（套件檔頭記載之殷鑑：逐條 timeout 只加在陣列版，工作流走 table 版全部落回預設而不自知）。

```javascript
let r = resolveProviders(providers, {
    env,
    pick: ['oc:opencode/muse-spark-1.3-contributor-free'],
    exes: { opencode: '<opencode 執行檔絕對路徑>' },                  // 逐 kind 注入；條目自帶 exe 者不覆寫
    patch: {                                                          // 逐 id 淺合併，於 exes 之後施作
        'oc:opencode/muse-spark-1.3-contributor-free': {
            timeoutMs: 3_600_000,
            extraArgs: ['--variant', 'xhigh'],
            config: { permission: { edit: 'allow', write: 'allow', bash: 'allow' } },
        },
    },
});
```

- **`exes` 解的是 `ENOENT`**：作業系統排程於 session 0 執行時 `PATH` 可能不含 npm 全域目錄，靠指令名會找不到執行檔。
- **`patch` 是逐條覆寫任意欄位的正規入口**：本技能要的 `xhigh`、1 小時逾時、放開權限鎖，三件事都在這裡補，不必改套件也不必自建條目表。
- **`config` 是整個覆寫不是深層合併**：`patch` 為淺合併，給了 `config` 就會整顆換掉——第三方條目的 `provider` 定義也在 `config` 內，覆寫時要連同定義一起寫回，否則注入的設定少了 provider 定義，會以 `UnknownError` 收場。

### 自帶條目與 id 命名

新模型上線快於套件發版時，把自訂條目**合併進輸入**再傳進去即可（同 id 時以自訂者覆蓋內建）；**動輸入、不要動回傳**——把條目 push 進回傳的 `providers` 陣列不會同步進 `table`，兩者當場分歧。

```javascript
let extra = [{ id: 'oc:opencode/<新模型>', model: 'opencode/<新模型>', kind: 'opencode', envVar: 'OPENCODE_KEYS', provider: 'opencode' }];
let merged = [...providers.filter((p) => !extra.some((e) => e.id === p.id)), ...extra];
```

- **`id` 務必明給且唯一**：省略時會回退為陣列索引字串，日後插入條目會讓後續條目繼承他人的遞補游標進度。命名要區分到「模型」而非只到「廠商」，同一模型經不同路徑取得時要帶上路徑前綴（`oc:` 走 CLI、`zen:`／`agnes:`／`poolside:` 走 REST）。
- **自有欄位一律放 `meta`**：條目除 `id`、`keys`、`meta` 外的鍵**一律原樣轉傳**給轉接器，自己加的分類、標籤、註記若不放 `meta`，會被當成 `execCli` 的選項送出去。`meta` 是保證永不轉傳的保留鍵。

不經條目表、直接呼叫時長這樣（供應商定義取自同一份表）：

```javascript
await wda.dispatchOpencode(prompt, {
    model: 'agnes-ai/agnes-3.0-flash',
    provider: 'agnes-ai',
    key: agnesKeys[0],
    config: {
        provider: {
            'agnes-ai': {
                npm: '@ai-sdk/openai-compatible',
                name: 'Agnes',
                options: { baseURL: 'https://apihub.agnes-ai.com/v1' },
                models: { 'agnes-3.0-flash': { name: 'Agnes 3.0 Flash' } },
            },
        },
        permission: { edit: 'deny', write: 'deny', bash: 'deny' },   // 見「權限」一節
    },
    timeoutMs: 3_600_000,   // 審計／複審／測試類 1 小時起跳，見「逾時」一節
});
```

Poolside 同形，換成 `provider: 'poolside'`、baseURL `https://inference.poolside.ai/v1`、`models: { 'poolside/laguna-s-2.1': { name: 'Laguna S 2.1' } }`。

**同一個模型經不同路徑＝不同的供應商**，條目 id 的前綴就是在區分這件事：`oc:` 走 opencode CLI，**有工具能力、能讀寫檔案**，但較慢；`agnes:`／`poolside:`／`zen:` 走 REST 直呼（`dispatchApiOpenaiCompat`／`dispatchApiOpenaiResponses`），免 CLI 免登入且快，但**沒有工具能力**——本套件遇模型回 `tool_calls` 一律以 `TOOL_CALLS_UNSUPPORTED`（`errorType: 'tool-unsupported'`）回報失敗，不假裝成功。兩者的額度池與故障域也各自獨立。**要派審計、寫測試這類需要讀寫檔案的任務，只能走 `oc:` 版。**

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
| 審計、複審、調查 | 讀檔 ＋ 寫檔（報告落檔）＋ 唯讀查證指令 | 同上，且**報告產出路徑必須落在同一個專案目錄內**；若沿用條目表的唯讀鎖，要把 `config.permission` 的 `write`／`edit` 放開 |
| 寫測試、驗證猜想、重現問題 | 讀檔 ＋ 寫測試檔 ＋ 執行測試 | 同上；維持轉接器預設的 `build` 代理，且 `config.permission.bash` 須為 `allow` 才跑得了測試 |
| 修改、實作 | 讀 ＋ 寫 ＋ 執行 | 同上 |

- **審計必須自己讀檔**。把檔案內容貼進提示詞不算獨立審計：被派對象只看得到你挑給它的片段，找不出你漏掉的地方，而那正是複審的唯一價值。
- **驗證猜想必須能寫檔並執行**。不能寫測試就只剩推論；「我認為可能是 X」沒有可重現的執行結果，不是結論。
- **不想放權時，換的是任務或環境，不是砍權限**。把目標複製或 `git worktree` 出一份到獨立目錄，`cwd` 指向該處，讓被派對象在裡面有完整讀寫執行，事後自己審 diff。

### 第四層權限：提示詞前綴（走工作流時預設禁止寫檔）

權限共有四層，前三層在你手上、第四層在套件手上：①CLI 旗標與代理規則（`--agent`／`--auto`）②轉接器選項（`config.permission`）③`providers.mjs` 條目自帶的唯讀鎖 ④**提示詞前綴**。

`w-dispatch-ai` 的工作流層（`dispatchAiWkf` 之 `callAi`／`runFanout`／`runRolePipeline`／`runFanoutPipeline`）**預設會在提示詞前掛上 `NO_SIDE_EFFECT`**，其內文明寫「禁止建立、修改或刪除任何檔案…任何寫入磁碟的動作都不會被採用」（唯讀查閱不在此限）。

**後果**：`config.permission` 全開、`--dir` 也對，模型仍會照提示詞不寫檔——exit 0、回覆看似正常、報告與測試檔一個都沒有。**症狀與 `config.permission` 被鎖完全同型**，但照權限那條路排查永遠修不好。

**要落檔就必須顯式關閉**：傳 `promptPrefix: ''`。注意**只有空字串才算關閉**，傳 `null`／`undefined`／省略都會回退成掛上。直接呼叫 `dispatchOpencode()` 不受影響——該前綴只在工作流層自動掛。

**反過來說，前綴是「請求」不是「強制」**：它靠模型願意遵守，真正擋得住寫入的是第②③層的 `config.permission`。所以①要唯讀就照樣上鎖，別只靠前綴；②要落檔則兩邊都得放行，缺一即為空手而回。該前綴本身為單一來源、亦由頂層匯出（`NO_SIDE_EFFECT`），直接呼叫 `dispatchAiFallback` 而想要同一約束時自行前綴即可，不要另抄一份措辭——措辭含「唯讀查閱不在此限」的豁免，抄舊版會讓某些 CLI 連讀檔都被禁掉。

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

需要跨出專案目錄時，優先把目錄範圍調對（改 `cwd`／`--dir`，或把待讀資料複製進來）。只有在使用者已授權無人值守修改、且執行環境可信時，才加 `--auto`；依 help 原文它會自動核准「未被明確拒絕」的權限，也就是連上表的 `ask` 檔位一併放行。

### 收斂權限用 `config.permission`，不是在預設與 `--auto` 之間二選一

轉接器的 `config` 會注入該次程序的 `OPENCODE_CONFIG_CONTENT`，其中的 `permission` 可逐項給 `allow`／`ask`／`deny`：

```javascript
config: { permission: { edit: 'deny', write: 'deny', bash: 'deny' } }   // 唯讀鎖
```

`w-dispatch-ai/src/providers.mjs` 內建的**五個** opencode 條目都帶這把唯讀鎖——因為那些條目是給純文字生成與遞補用的。**派審計、寫測試時要把對應項目放開**（`write`／`edit` 給 `allow`，要跑測試再放 `bash`），否則就是本技能「權限」開頭講的那種下限不足。走條目表時，放開的正規作法是 `resolveProviders` 的 `patch`（見「展開後的後處理」），且因 `patch` 為淺合併，覆寫 `config` 要把第三方條目原本的 `provider` 定義一起寫回。

### 權限不足是 exit 0 的假成功，連轉錄都會顯示完成

2026-09-08 於 OpenCode 1.18.29 實測，同一段提示詞（讀 `probe.txt` 第一行 ＋ 於同目錄建立 `out.txt`）：

| 條件 | stdout | 離開碼 | `out.txt` |
|---|---|---:|---|
| `--agent build`，未加 `--auto`（本機代理規則 `*: allow`） | `READ=… WRITE=DONE` | 0 | 已建立 |
| 同上，加 `config.permission = { edit:'deny', write:'deny', bash:'deny' }` | `READ=… WRITE=FAILED` | 0 | **未建立** |

第二列的轉錄裡甚至出現 `✓ Create out.txt file`（它把建檔轉交子代理，子代理回報成功）——**畫面上打勾、檔案不存在、離開碼 0**。判成敗只能看產物是否落地，不能看有沒有回話、更不能看轉錄的勾。

### 派工前的能力探測

正式派工前，以**與正式派工相同的目錄與代理選項**跑一次最小探測：

```javascript
const probe = await wda.dispatchOpencode(
    '讀取 <目標檔絕對路徑> 並原文輸出第 1 行；'
    + '再於 <產出目錄絕對路徑> 建立 probe-out.txt，內容為 OK；'
    + '最後只回一行：READ=<第1行> WRITE=<DONE 或 FAILED>',
    { model, cwd, timeoutMs: 100_000, validate: 'nonempty' },   //壓在呼叫端前景上限 120000 之內；再長就要背景執行
);
// 只看 stdout 不算數：要確認 probe-out.txt 真的落地
```

探測失敗時先修目錄範圍與代理權限，不要改提示詞重試。

## 逾時：審計、複審、測試類一律 1 小時起跳

**轉接器預設 300000（5 分鐘）對這類任務一定不夠**：審計要把模組讀完、複審要逐格核對、寫測試還得把測試跑起來；本供應商的免費模型實測快慢差距極大（同一句話有的數秒回、有的要數分鐘，名為 lightning 的那支實測反而最慢）。被逾時砍掉時 token 早就燒完卻拿不到任何結果——**逾時砍掉的不是等待時間，是整批已經付過錢的工作**。

**下限：`timeoutMs: 3_600_000`（1 小時），寧可保守。逾時是上限不是固定等待**——提早做完就提早回，給大不吃虧；給小才會兩頭空。

**五層都要放行，任一層先到就被截斷**（套件 README 之「Timeout 總覽」明訂這條階梯的數值須嚴格遞增）：

| 層 | 誰在殺 | 預設 | 這類任務要怎麼設 |
|---|---|---|---|
| ①呼叫端（Claude Code 的 Bash 工具） | harness 砍掉整個 node 行程 | 前景 120000，**上限 600000（10 分鐘）** | **一定要 `run_in_background: true`**——前景不論 `timeoutMs` 給多大，最多 10 分鐘就被砍。**但背景行程掛在 session 之下**，數小時級或不可因 session 更替而中斷者，須改走 detached ＋ `Monitor` |
| ②轉接器 `timeoutMs`（單次嘗試） | 逾時終止程序樹 | 300000 | `3_600_000` 起跳 |
| ③CLI 自身內層逾時 | — | `opencode run` **旗標表上沒有**此類旗標 | 不適用（只有 agy 有 `--print-timeout`） |
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
| `cooldownMs` | `0`（關閉） | 內建觸發只有 HTTP 429 與逾時，**429 僅 REST 類（`zen:`／`agnes:`／`poolside:`）偵測得到**；`oc:` 這類 CLI 條目的限流埋在 stderr 文字裡，內建規則抓不到。觸發後該條目**只被移到鏈尾不被移除**（前面全敗時仍會被試到，任一次成功立即解除），啟用期間「providers 順序即優先序」會被暫時重排。套件記載之實測：一次 107 秒請求中 72 秒耗在重複踩同一家，開冷卻後降至 15 秒。**只對有明給 `id` 的條目生效** |
| `coolDetect` | 無 | CLI 類限流的唯一入口（依賴注入），例：`(r) => /FreeUsageLimitError/i.test(r.stderr || '')` |
| `shouldStop` | 無 | 1 小時派工中途要止損的唯一手段：於每次嘗試之間檢查，回 `ABORTED`／`errorType: 'aborted'`。它不會中斷進行中的那一次嘗試 |

**`budgetFor()` 有陷阱，不要照抄**：它**只累加條目自己的 `timeoutMs`**（未帶者以統一預設 300000 計），讀不到你寫在 opt／`defaults` 的那一個；而套件內建的 providers 條目**刻意一條都不帶 `timeoutMs`**（1.0.26 實查 20 條皆無），所以 `budgetFor(內建條目)` 恆為「條目數 × 300000」——比你的 1 小時還小，反而把它壓下去。**本技能教的「直接引用 `providers.mjs`」正好踩中這一點**：要用 `budgetFor()` 就得先把 `timeoutMs: 3_600_000` 逐條寫進每個條目（用 `resolveProviders` 的 `patch` 逐 id 覆寫，別自己 map 回傳值），否則直接寫 `K × 3_600_000`。

**1 小時派工要留觀測點**：`dispatchAiFallback` 的 `onEvent` 會逐步回報 `'try'`／`'ok'`／`'next-key'`／`'skip-group'`／`'budget-out'`／`'aborted'`／`'cooled'`，失敗事件另帶 `errorType`、被拒回覆與 stderr。沒掛它的話，一小時內看不出是卡在哪一家、還是早就跳完整條鏈在空轉。

**工作流層的覆寫順序**（細者覆蓋粗者）：`dispatchAiWkf` 的 `defaults` → 各工作流 `callOpt` → 階段／名額規格 → provider 條目。把 1 小時寫在 `defaults`、而某條目自帶較小的 `timeoutMs` 時，**條目會贏**。

**哪些任務屬於這一類**：審計、複審、調查、寫測試、跑測試、多檔重構，以及任何要求逐項核對或產長報告者。**能力探測與單問一句維持短逾時**（1–3 分鐘）——探測本來就要快失敗。

**與套件內建規劃的關係**：`w-dispatch-ai/src/providers.mjs` 檔頭的 timeout 規劃以「單一 AI 工作約 15 分鐘」估出 `timeoutMs: 1_200_000`，那是一般複雜任務的估法；**審計／複審／測試類以本節的 1 小時為下限**，不要照抄 20 分鐘把它調回去。四層串起來的權威整合說明在套件 README 的「Timeout 總覽」一節。

**被砍時要保住已完成的部分**：失敗結果的 `stdout` 只會留 500 字元（`wsemi/src/execCli.mjs`），所以 1 小時派工一律掛 `onStdout` 邊跑邊落檔，否則被砍就真的什麼都不剩。

**逾時與假成功是兩回事**：逾時被殺時 `errorType` 為 `timeout`；權限被擋、或提示詞層被禁止寫檔則是 `ok: true`／exit 0，**根本不會產生 `errorType`**。看到「沒有結果但也沒有錯誤」先分清是哪一種，別互相誤診。

## 額度查詢沒有 opencode 版，別去找

套件自 `src/quota/` 提供三支額度查詢函數：`getQuotaClaude`、`getQuotaCodex`、`getQuotaAntigravity`。**沒有 `getQuotaOpencode`，也不該期待有**——那三家查的是「本機該 CLI 當前登入帳號」的訂閱額度窗口（5 小時／7 天等），而 OpenCode 這條路走的是免費型錄與 API 金鑰，不是訂閱窗口，沒有對應的可查端點。

所以 opencode 的限流只能事後從失敗結果判讀：CLI 類的限流字樣埋在 stderr，`errorType` 一律是 `exec`（不細分），要偵測就自己給 `coolDetect`（見「逾時」一節）。**不要為了「先查額度再決定派不派」去翻 `src/quota/`**，那裡沒有你要的東西。

## 轉接器契約（w-dispatch-ai 1.0.25）

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
| `validate`、`maxRetries`、`retryDelayMs`、`onStdout`、`maxBuffer` 等 | 依選項而定 | 原樣轉交給 `wsemi` 的 `execCli`；長任務建議掛 `onStdout` 邊跑邊落檔 |

提示詞透過 stdin 傳入。結果包含 `{ ok, stdout, stderr, code, error, errorType, durationMs, attempts }`；必須檢查 `ok`。

請使用 UMD 預設匯出：`import wda from 'w-dispatch-ai'`。

### 表以外的細節一律查原始碼（當前安裝版）

上表只列常用鍵。**細部設定、權限、實際可用的模型與供應商、錯誤分類等只要不確定，就去讀當前安裝版的原始碼，不要憑記憶或猜測**——技能寫的是查核當日的狀態，套件、CLI 與型錄都會滾動。

原始碼就在**技能根的 `node_modules/w-dispatch-ai/src/`**（見「套件裝在哪」一節）。**不要用 `npm ls` 或 `require.resolve` 查**——那兩者從當前專案解析，可能指到另一份。

| 想知道 | 讀哪個檔 |
|---|---|
| 完整選項、預設值、固定旗標與其順序、哪些鍵不轉傳給 `execCli` | `src/dispatchOpencode.mjs`（固定旗標順序為 `run` → `--agent <值>` → `-m` → `extraArgs`；`exe`／`model`／`key`／`provider`／`agent`／`config`／`extraArgs`／`input`／`env` 為自用鍵） |
| **實際可用、已實測過的模型與供應商條目**（含第三方 provider 的完整 `config`、金鑰環境變數、權限鎖、實測耗時與失敗碼） | `src/providers.mjs`——**本技能所有模型資訊的上游**，改模型前先讀它 |
| 有哪些 kind、何時用 CLI 類何時用 REST 類 | `src/adapters.mjs` 檔頭（判準只有一條：這次呼叫需不需要工具） |
| `validate` 規則語法 | **CLI 類實際走的是 `wsemi/src/execCli.mjs` 內建的驗證器**（`w-dispatch-ai/src/buildValidator.mjs` 是 REST 類的平行實作，語法目前一致但各自維護）。`nonempty`／`json`／`min:N`，逗號串接須全部通過；但**規則名稱打錯（如 `nonemtpy`）會被靜默忽略、等於完全沒驗**——判斷式沒有 `else` 分支，只有 `min:` 的參數打錯（如 `min:abc`）才算失敗。validate 字串要逐字核對，或直接傳自訂函數 |
| `errorType` 值域與判準 | `src/getErrorType.mjs` 檔頭一覽。CLI 類（本轉接器）用得到的只有 `params`／`timeout`／`spawn`／`validation`／`exec`，**其餘失敗一律歸 `exec` 不再細分**（各家 CLI 字樣隨版本漂移，套件刻意不維護簽章表）；`http`／`fetch`／`tool-unsupported`／`invalid-response`／`incomplete` 只出現於 REST 類，`aborted`／`budget` 只出現於遞補層。要細分 CLI 失敗就自己用 `coolDetect` 式注入判斷 |
| 額度查詢（**無 opencode 版**）之函數、結構與詞彙 | `src/quota/`；其 `errorType` 是另一套詞彙，與上列轉接器的不共用 |
| 條目展開、`pick`／`exes`／`patch`、拼寫提示 | `src/resolveProviders.mjs`（檔頭記載「後處理收進本函數」之理由與單邊套用殷鑑） |
| 工作流配套工具 | `src/wkf/`：`createFileStore`（跨行程持久化遞補游標與冷卻狀態，排程任務每次都是新行程故記憶體版每次歸零）、`createUsageCounter`（逐日用量計帳，純觀測不據以節流）、`salvageTruncatedArray`（截斷 JSON 陣列之前段搶救，刻意不併入預設解析） |
| 逾時的完整機制 | **`README.md` 之「Timeout 總覽」是唯一把四層串起來的權威說明**（階梯結構、各參數預設、工作流總時長公式）；細節另見 `src/dfTimeoutMs.mjs`（統一預設 300000）、`src/budgetFor.mjs`（只累加條目層 `timeoutMs`）、`src/dispatchAiFallback.mjs`（`budgetMs`／`minAttemptMs`／`cooldownMs`／`coolDetect`／`shouldStop` 之實際行為）、`src/dispatchAiWkf.mjs` 檔頭 |
| 提示詞層之防寫前綴 | `src/wkf/noSideEffectPrefix.mjs`（前綴原文）、`src/wkf/callAiWithFallback.mjs`（預設掛上、`promptPrefix: ''` 才關閉） |
| 多供應商遞補、金鑰輪替、條目 id 命名規則（`oc:`／`zen:`／`agnes:`…之意義） | `src/dispatchAiFallback.mjs` 檔頭 |

**檔頭註解是實測紀錄，不是設計說明**：`src/dispatchOpencode.mjs` 檔頭記著三條實測結論——①`OPENCODE_AUTH_CONTENT` 會**完全覆蓋** `auth.json` 但不改寫該檔（實測前後 md5 一致），屬 process 層級，可與其他專案並行；②`OPENCODE_API_KEY` 在 `auth.json` 已有憑證時不生效，故一律走 `OPENCODE_AUTH_CONTENT`；③**第三方 provider 只注入金鑰無效**，未給 `config` 定義時 `opencode models` 不列出該 provider，直接指定模型回 `UnknownError／Unexpected server error`——與本技能「認證與單次程序注入」一節記載的錯誤長相一致。與本技能所述不一致時，以原始碼與其實測註記為準，並回頭修技能。

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
npm install -g opencode-ai@latest
opencode --version
opencode run --help
```

`w-dispatch-ai` 裝在技能根、由使用者統籌更新（見「套件裝在哪」），**不要在專案裡 `npm install w-dispatch-ai`**。

2026-09-08 於本機 `opencode-ai` 1.18.29 查核：`opencode run` 之旗標（`--agent`、`-m`、`--variant`、`--dir`、`--auto`、`--format`、`--file`）皆與本技能所載一致。

2026-09-17 對 `w-dispatch-ai` 1.0.26 讀原始碼查核，並逐項以載入實跑驗證（未重跑 CLI 派工，故上段 CLI 事實維持原查核日）：

| 項目 | 結果 |
|---|---|
| `dispatchOpencode()` 固定參數與選項 | 與 1.0.17 起各版相同（`run` → `--agent <值>` → `-m` → `extraArgs`；自用鍵同一組），**呼叫方式不變** |
| `providers.mjs` | 全表 20 條，`kind: 'opencode'` 者 **6 條**，六條皆自帶唯讀鎖、皆不帶 `timeoutMs` |
| `resolveProviders()` | 回傳為 `{ providers, table, skipped, missing, hints }`，另有 `exes`／`patch` 後處理選項 |
| `src/quota/` | 三支訂閱額度查詢函數，**不含 opencode** |
| `errorType` | CLI 類實際用得到的仍只有 `params`／`timeout`／`spawn`／`validation`／`exec` 五種 |
| 條目之版本漂移 | 1.0.25 把 Agnes 由 2.5 換成 3.0（兩條目同步改名）；1.0.26 新增 `oc:opencode/union-alpha` 與新 kind `api-typesafe-systemone`（決策模型，非文字生成，不可混入文字遞補鏈）。**轉接器不動、條目一直動**，故 id 一律對安裝版核對 |
