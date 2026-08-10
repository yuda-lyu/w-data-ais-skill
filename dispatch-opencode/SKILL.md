---
name: dispatch-opencode
description: This skill should be used when the user asks to "run opencode as an agent", "call opencode", "use opencode cli as agent", "create opencode agent", "multi-agent with opencode", "dispatch task to opencode", "launch opencode", or needs to drive OpenCode CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-opencode — 以 OpenCode CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 OpenCode CLI (`opencode run`) 作為獨立 agent 執行，
實現調度 AI ＋ OpenCode agent 混合的多 agent 工作流程。

**核心調用層：** 使用 **`w-dispatch-ai`** 套件的 `dispatchOpencode()`，自動處理超時、進程樹清理、輸出驗證、重試與錯誤回報（底層為 `wsemi` 之 `execCli`）。

> 📖 完整 CLI 旗標參考請見 [references/opencode-flags.md](references/opencode-flags.md)

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 OpenCode agent 執行任務
- 需要利用 OpenCode 調用各種 AI 模型（DeepSeek、Nemotron、MiniMax、Llama、Mistral 等）
- 想用**免費模型**跑派工（Zen 免費層不需自備 API key，見「模型選擇」）
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 透過 w-dispatch-ai 調用（推薦）

```javascript
import wda from 'w-dispatch-ai';

// 基本呼叫（預設免費模型 + build agent）
const r = await wda.dispatchOpencode('撰寫單元測試並確保全部通過', {
    model: 'opencode/deepseek-v4-flash-free',
    timeoutMs: 180_000,
});

if (r.ok) {
    console.log(r.stdout);
} else {
    console.error(`OpenCode 呼叫失敗: ${r.error}`);
}
```

### 常用組合

```javascript
// 完整防護：超時 + 重試
await wda.dispatchOpencode(prompt, {
    model: 'opencode/deepseek-v4-flash-free',
    timeoutMs: 180_000,
    validate: 'nonempty',
    maxRetries: 1,
});

// 指定其他模型（三段式 ID：需該 provider 已認證）
await wda.dispatchOpencode(prompt, { model: 'nvidia/deepseek-ai/deepseek-v4-pro' });

// 臨時注入 API key（key 與 provider 須成對，且 provider 要與 model 同組）
await wda.dispatchOpencode(prompt, {
    model: 'nvidia/deepseek-ai/deepseek-v4-pro',
    provider: 'nvidia',
    key: process.env.NVIDIA_API_KEY,
});

// JSON 事件流輸出 / 附帶檔案
await wda.dispatchOpencode(prompt, { model: 'opencode/deepseek-v4-flash-free', extraArgs: ['--format', 'json'] });
await wda.dispatchOpencode('分析這個檔案', { model: 'opencode/deepseek-v4-flash-free', extraArgs: ['-f', './input.txt'] });
```

### API 重點

| opt | 預設 | 說明 |
|---|---|---|
| `exe` | `'opencode'` | 執行檔名稱或絕對路徑 |
| `model` | `''`（不帶旗標） | 模型 ID；**本 skill 建議 `opencode/deepseek-v4-flash-free`** |
| `agent` | `'build'` | opencode 代理名稱（**套件已預設帶上，不需自行加 `--agent`**） |
| `key` / `provider` | `''` | 臨時注入該 provider 的 API key；**兩者須同時給予**才會生效，且 provider 要與 model 同組。不給則沿用 CLI 既有登入狀態 |
| `extraArgs` | `[]` | 額外旗標陣列——`--format json`、`-f <file>`、`--variant` 等走這裡 |
| `timeoutMs` | `120000` | 逾時後強制關閉子進程及其子孫 |
| `cwd` / `validate` / `maxRetries` / `onStdout` … | — | 其餘鍵**原樣轉傳 `execCli`** |

**回傳**：`{ ok, stdout, stderr, code, error, durationMs, attempts }`；本函式**不 reject**。

> ⚠ **prompt 一律以 stdin 傳入**，故含換行、引號的長 prompt 可直接傳，不需跳脫。
>
> ⚠ `w-dispatch-ai` 為 UMD 套件，**只能 default import**。

## 模型選擇

> **型錄實證（2026-08-07，CLI v1.18.15 跑 `opencode models`）**：共 107 個模型，分屬三個 provider ——
> `opencode`（8，Zen 免費層）、`cline`（3）、`nvidia`（96）。
> **型錄由伺服器決定，不隨 CLI 版本變動**（1.17.11 / 1.18.13 / 1.18.15 三版實測完全相同），故會隨時間增減：
> **動工前請一律先跑 `opencode models` 對照**，勿直接沿用本表。

### Zen 免費模型（`opencode/` 前綴，推薦日常使用）

OpenCode 自家策劃的免費層，**point-and-use、不需自備 API key**（`opencode auth list` 內即使沒有 opencode 憑證也可用）。

| 模型 ID | 說明 |
|---------|------|
| `opencode/deepseek-v4-flash-free` | **預設模型**，DeepSeek V4 Flash 免費版 |
| `opencode/nemotron-3-ultra-free` | Nvidia Nemotron 3 Ultra 免費版 |
| `opencode/mimo-v2.5-free` | 小米 MiMo V2.5 免費版 |
| `opencode/big-pickle` | Big Pickle |
| `opencode/laguna-s-2.1-free` | Laguna S 2.1 免費版 |
| `opencode/ling-3.0-flash-free` | Ling 3.0 Flash 免費版 |
| `opencode/longcat-2.0-free` | LongCat 2.0 免費版 |
| `opencode/north-mini-code-free` | North Mini Code 免費版（程式碼取向） |

> **額度**：Zen 免費層為 **100 requests/day**，免信用卡。頻繁派工請留意每日上限。
> 免費層內容**會隨供應商增減而輪替**（官方明言 free tier rotates），舊 ID 可能無預警消失。

### cline provider（需自備憑證）

| 模型 ID | 說明 |
|---------|------|
| `cline/deepseek/deepseek-v4-flash` | DeepSeek V4 Flash |
| `cline/minimax/minimax-m3` | MiniMax M3 |
| `cline/xiaomi/mimo-v2.5` | 小米 MiMo V2.5 |

### nvidia provider（需自備憑證，96 個）

含大量文字、視覺、生醫與影像模型。常用文字模型舉例：

| 模型 ID | 說明 |
|---------|------|
| `nvidia/deepseek-ai/deepseek-v4-flash` | DeepSeek V4 Flash |
| `nvidia/deepseek-ai/deepseek-v4-pro` | DeepSeek V4 Pro（較強） |
| `nvidia/minimaxai/minimax-m3` | MiniMax M3 |
| `nvidia/meta/llama-3.3-70b-instruct` | Llama 3.3 70B |
| `nvidia/mistralai/mistral-large-3-675b-instruct-2512` | Mistral Large 3 |
| `nvidia/google/gemma-4-31b-it` | Gemma 4 31B |
| `nvidia/openai/gpt-oss-120b` | GPT-OSS 120B（開源權重） |

完整清單請跑 `opencode models`。

指定模型：`-m "opencode/deepseek-v4-flash-free"`（不指定則使用 opencode 預設）

> ⚠ **模型 ID 段數不固定**：Zen 為兩段（`provider/model`），cline / nvidia 為三段（`provider/vendor/model`）。照抄時勿自行增減層級。
>
> ⚠ **型錄列出 ≠ 你的帳號能用**：`opencode/` 免費層無須憑證；`cline/` 與 `nvidia/` 需先以 `opencode auth login` 設定對應 provider 憑證，否則呼叫會失敗。以 `opencode auth list` 確認目前已認證者。

### 各參數說明

> 以下旗標皆經 v1.18.15 之 `opencode run --help` 實測確認。

| 參數 | 必要 | 說明 |
|------|------|------|
| `run` | ✅ | 非互動/headless 模式，執行完即退出 |
| `--agent build` | ✅ | 使用 `build` agent，權限全開（自動核准所有操作） |
| `-m "<provider>/<model>"` 或 `-m "<provider>/<vendor>/<model>"` | 建議 | 指定模型；Zen 為兩段（如 `opencode/deepseek-v4-flash-free`），cline / nvidia 為三段（如 `nvidia/deepseek-ai/deepseek-v4-pro`） |
| `--format json` | ❌ 可選 | 輸出 JSONL 事件流，適合程式解析（另一值為預設的 `default`） |
| `-f <file>` | ❌ 可選 | 附加檔案給任務（可多個） |
| `--variant` | ❌ 可選 | 模型變體＝provider 專屬推理強度（如 `high`、`max`、`minimal`） |
| `--title` | ❌ 可選 | 為 session 命名（不給值則取截斷後的 prompt） |
| `--dir <path>` | ❌ 可選 | 指定執行目錄（等同 `dispatchOpencode` 的 `cwd` opt，兩者擇一即可） |
| `--auto` | ❌ 可選 | 自動核准未被明確拒絕的權限（**dangerous**；一般用 `--agent build` 即足夠） |
| `--thinking` | ❌ 可選 | 顯示 thinking 區塊 |
| `-c, --continue` / `-s, --session <id>` | ❌ 可選 | 延續上一個／指定 session；`--fork` 可在延續前分叉 |
| `--pure` | ❌ 可選 | 不載入外部 plugin |
| `--log-level <level>` / `--print-logs` | ❌ 可選 | 除錯用：`DEBUG`/`INFO`/`WARN`/`ERROR`；後者將 log 印至 stderr |

> **與 Codex / Claude 的差異**：OpenCode 不需要 `--full-auto`、`--skip-git-repo-check`、`--config` 等旗標，
> 因為 `--agent build` 已預設權限全開。工作目錄可用 `--dir` 指定，不需先 `cd`。

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 卡住等待人工確認 | 未使用 `--agent build` | 加上 `--agent build` |
| 模型找不到 | 模型 ID 已自型錄移除，或段數寫錯（Zen 兩段／cline・nvidia 三段） | 跑 `opencode models` 對照實際型錄。**Zen 免費層會輪替，舊 ID 常無預警消失**（殷鑑：本技能舊版所列 15 個模型於 2026-07 全數失效） |
| 認證失敗 | 未登入對應 provider（`cline/`、`nvidia/` 需憑證） | `opencode auth login`；以 `opencode auth list` 確認。改用 `opencode/` 免費層則不需憑證 |
| 免費模型被限流 | Zen 免費層 100 requests/day 上限 | 降低派工頻率、改用其他免費模型，或改用已認證的付費 provider |
| 操作外部目錄被拒 | `external_directory` 權限為 ask | 在任務描述中指定寫入專案目錄內的路徑 |

## 建議 opt 值

| opt | 建議值 | 說明 |
|----------|--------|------|
| `timeoutMs` | `180_000`～`300_000` | 含模型推理時間，建議至少 3 分鐘 |
| `validate` | `'nonempty'` | 確保有實際輸出 |
| `maxRetries` | `1` | 免費模型偶爾限流可重試（含初始請求最多執行 2 次） |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 OpenCode agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# OpenCode agent — 透過 w-dispatch-ai（背景執行）
await wda.dispatchOpencode('... 寫入 result_opencode.txt', {
    model: 'opencode/deepseek-v4-flash-free',
    timeoutMs: 180_000,
});
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`opencode_result.txt`）
- 任務描述中明確指定**專案目錄內**的相對路徑，例如 `./output/opencode_result.txt`（`build` agent 的 `external_directory` 權限預設為 `ask`，寫入專案外目錄會被攔截；寫專案目錄內可直接放行，且跨平台通用）

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：**`w-dispatch-ai`**（其內部相依 `wsemi` 會隨之自動安裝）

```bash
npm install w-dispatch-ai
node -e "import('w-dispatch-ai').then(m=>console.log('OK:', typeof m.default.dispatchOpencode))"
```

```bash
opencode --version   # 確認 opencode 已安裝（本技能實測 v1.18.15＝npm 最新）
opencode auth list   # 確認已登入的 provider（opencode/ 免費層不需憑證）
opencode models      # 查看可用模型列表（型錄會變動，動工前務必對照）
```

若未安裝，請依執行環境自行決定安裝方式。安裝**位置**由執行 AI 自行決定，只要最終 `opencode` 指令可被執行即可：

```bash
# 範例 A：全域安裝
npm install -g opencode-ai

# 更新既有全域安裝（不加 @latest 時 npm 可能視為已滿足而不動作）
npm install -g opencode-ai@latest

# 範例 B：專案內安裝（搭配 npx）
npm install opencode-ai
# 之後以 npx opencode ... 呼叫
```

認證方式（依 provider 不同）：
```bash
# 設定 provider 憑證（cline / nvidia 等需要）
opencode auth login

# 或設定 API Key 環境變數（依 provider 而異）
```

> **`opencode/` 前綴的 Zen 免費模型不需任何認證**即可使用（point-and-use），
> 故本技能預設模型 `opencode/deepseek-v4-flash-free` 在全新環境亦可直接跑。
