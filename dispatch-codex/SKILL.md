---
name: dispatch-codex
description: 當任務需要委派給 Codex，或需要把 Codex 納入多代理工作流程時，透過 w-dispatch-ai 以非互動方式執行 OpenAI Codex CLI。
---

# dispatch-codex

使用 `w-dispatch-ai` 1.0.22+ 的 `dispatchCodex()` 執行自動化 Codex 任務。轉接器會呼叫 `codex exec`、透過 stdin 傳入提示詞、設定沙箱政策、略過 Git 儲存庫限制、管理逾時與程序樹清理，並以結果物件回報失敗。

需要變更模型／設定旗標、沙箱行為或非互動輸出時，讀取 [references/codex-flags.md](references/codex-flags.md)。

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

轉接器的 `sandbox` 預設為 `workspace-write`，一般儲存庫工作應維持此設定。Windows 上不論哪種模式，都以「Windows 前置」一節的 elevated 沙箱設定已完成為前提。只分析、不修改時使用 `read-only`。只有在使用者任務確實需要，而且執行環境已妥善隔離時，才可使用 `danger-full-access`。

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

## 轉接器契約（w-dispatch-ai 1.0.22）

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
