---
name: dispatch-antigravity
description: This skill should be used when the user asks to "run antigravity as an agent", "call antigravity", "call agy", "use antigravity cli as agent", "dispatch task to antigravity", "launch antigravity", or needs to drive Google Antigravity CLI (`agy`, the official replacement for Gemini CLI from 2026-06-18) as a subprocess agent within a multi-agent workflow.
---

# dispatch-antigravity — 以 Antigravity CLI (`agy`) 作為 Agent 驅動

## 概述

驅動 Google **Antigravity CLI**（命令名 `agy`，**非** `antigravity`）作為 subprocess agent，搭配調度 AI 組多 agent 工作流。

**Antigravity CLI 是什麼**：Google 於 2026-05-19 Google I/O 公告，將取代 Gemini CLI；於 **2026-06-18** 起對「Free / Google AI Pro / Google AI Ultra」用戶停用 Gemini CLI；持有 Gemini Code Assist Standard / Enterprise 授權者繼續可用 Gemini CLI。

**核心調用層**：使用 `dispatch-cli` 技能執行，自動處理超時、進程樹清理、輸出驗證與錯誤回報。

> 📖 完整 CLI 旗標參考（含「不支援」項目逐條對照）見 [references/agy-flags.md](references/agy-flags.md)

## 何時使用此 Skill

- 使用者要求「跑 antigravity」「呼叫 agy」「用 antigravity cli 當 agent」
- 個人 / 免費帳戶用戶要從 `dispatch-gemini` 遷移過來（2026-06-18 後 gemini CLI 停服）
- 需要 Antigravity 多 agent 平台的能力（共用 Antigravity 2.0 desktop 的 agent harness）

## 透過 dispatch-cli 調用（推薦）

### 命令列

```bash
# 基本呼叫（推薦預設組合：非互動 + 自動核准 + 10 分鐘 timeout）
CLI_TIMEOUT_MS=600000 CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  agy --dangerously-skip-permissions --print-timeout 10m \
  --print "請動用最強推理能力深度思考此任務後再作答。任務描述：分析此專案架構並產出報告"

# 加 workspace 目錄（讓 agy 可讀寫該專案下檔案）
CLI_TIMEOUT_MS=600000 CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  agy --dangerously-skip-permissions --print-timeout 10m \
  --add-dir /path/to/project \
  --print "請動用最強推理能力深度思考此任務後再作答。任務描述：..."

# 接續先前對話
CLI_TIMEOUT_MS=600000 CLI_CWD="/path/to/project" \
  node dispatch-cli/scripts/run_cli.mjs \
  agy --dangerously-skip-permissions --print-timeout 10m \
  --continue \
  --print "繼續修改剛剛那段程式碼，加上錯誤處理"
```

> 路徑為相對範例，實際執行時請依執行環境調整。

### 模組匯入

```javascript
import { runCli } from './dispatch-cli/scripts/run_cli.mjs';

const result = await runCli('agy', [
    '--dangerously-skip-permissions',
    '--print-timeout', '10m',
    '--add-dir', '/path/to/project',
    '--print', '請動用最強推理能力深度思考此任務後再作答。任務描述：分析此專案架構並產出報告',
], {
    timeoutMs: 600_000,
    cwd: '/path/to/project',
});

if (result.ok) {
    console.log(result.stdout);
} else {
    console.error(`agy 呼叫失敗: ${result.error}`);
}
```

## 預設旗標說明（為何這樣設）

| 旗標 | 為何加 |
|------|-------|
| `--print "..."` (`-p`) | 必加，否則進入互動 TUI 模式無法 subprocess 控制 |
| `--dangerously-skip-permissions` | 必加，否則工具操作會 prompt 等人工確認，CI / 後台跑會卡住 |
| `--print-timeout 10m` | agy 預設 5m，但 deep reasoning + 大型任務可能超時；建議拉到 10 分鐘以上 |
| `--add-dir <path>` | 將指定目錄加入 workspace，讓 agy 能讀寫；多目錄可重複加 |
| `--continue` (`-c`) | 接續對話；首次呼叫不加 |

## 「預設使用最強的模型 + 最深的思考程度」實作說明

**現實限制**：agy 1.0.2 的 `--help` 已確認**沒有 `--model` / `--reasoning` / `--thinking` / `--effort` 任何旗標可控制模型或思考深度**。模型選擇與 thinking budget 由後端決定（agy 共用 Antigravity 2.0 desktop 的 agent harness）。

**唯一可行手段**：在 prompt 文字內以自然語言要求。本技能的範例與 wrapper 均**預設在 prompt 前綴加上**「請動用最強推理能力深度思考此任務後再作答。任務描述：」這段，由 Gemini 後端自行配置 thinking budget。

呼叫端若不要這個前綴（例如測試純 prompt），直接拿掉那段文字即可——技能本身不強制注入，只在文件範例與建議寫法中呈現。

## 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `CLI_CWD`（dispatch-cli） | 建議 | 子進程工作目錄；agy 預設以 cwd 為起點 |
| `--dangerously-skip-permissions` | ✅ | 自動核准所有工具請求 |
| `--print "prompt"` (`-p`) | ✅ | 非互動模式，跑完即退出 |
| `--print-timeout <duration>` | 建議 | 預設 5m，深思考任務建議 10m+ |
| `--add-dir <path>` | 視情況 | 將目錄加入 agy workspace |
| `--continue` (`-c`) | 視情況 | 接續對話 |
| `--log-file <path>` | 視情況 | 自訂 log 檔位置 |
| `--sandbox` | ❌ 避免 | 會限制 terminal，可能擋住部分操作 |

> **與 dispatch-gemini 的差異**：
> 1. 命令名 `agy` 不是 `antigravity`
> 2. **沒有** `-m / --model` 旗標
> 3. **沒有** `-o json` 結構化輸出旗標
> 4. 自動核准旗標叫 `--dangerously-skip-permissions`，不是 gemini 的 `--approval-mode=yolo` / `--yolo`
> 5. timeout 旗標 `--print-timeout` 為 CLI 內建（gemini 仰賴外部 timeout）

## 認證

- 首次跑 `agy -p "..."` 若未登入會嘗試開瀏覽器 OAuth；headless / CI 環境會卡住
- 對策：先以**桌面互動模式**跑一次 `agy` 完成 OAuth 登入（憑證會快取，後續 print 模式直接用）
- 已使用 **Antigravity 2.0 desktop IDE** 的使用者，agy CLI 通常**自動沿用同一份 OAuth**，不需另登入

## dispatch-cli 建議參數

| 環境變數 | 建議值 | 說明 |
|----------|--------|------|
| `CLI_TIMEOUT_MS` | `600000`（10 分鐘）以上 | agy 含深度思考可能耗時，至少 10 分鐘 |
| `CLI_CWD` | 專案絕對路徑 | 建議設定，agy 依賴 cwd 定位專案脈絡 |
| `CLI_VALIDATE` | `nonempty` | 確保有實際輸出 |
| `CLI_MAX_RETRIES` | `1` | OAuth token 過期等暫時錯誤可重試（含初始最多執行 2 次） |

## 常見錯誤與處理

| 現象 | 原因 | 解法 |
|------|------|------|
| 命令找不到（`agy: command not found`） | 安裝後 PATH 未生效 | 重開 shell 或用絕對路徑 `%LOCALAPPDATA%\agy\bin\agy.exe` |
| 卡住數分鐘無回應 | 首次未登入觸發 OAuth 但 print 模式無法互動 | 先在桌面跑 `agy`（不加 `-p`）完成登入 |
| 任務在錯誤目錄執行 | 未設定 `CLI_CWD` / `cwd` | 設環境變數 `CLI_CWD` 或 `runCli` 的 `cwd` 選項 |
| 工具請求等人工確認 | 缺 `--dangerously-skip-permissions` | 加上此旗標 |
| 超時 timeout | 大型任務或深度思考超過 5 分鐘預設 | `--print-timeout 10m` 或更長 |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 agy agent 時，以**背景**方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異）
prompt: "... 寫入 result_dispatcher.txt"

# agy agent — 透過 dispatch-cli（背景執行）
command: CLI_TIMEOUT_MS=600000 CLI_CWD=/path/to/project \
         node dispatch-cli/scripts/run_cli.mjs \
         agy --dangerously-skip-permissions --print-timeout 10m \
         --add-dir /path/to/project \
         --print "請動用最強推理能力深度思考此任務後再作答。任務描述：... 寫入 result_agy.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`agy_result.txt`）
- 任務描述中明確指定絕對路徑

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

> 本技能透過 dispatch-cli 執行，請先依 dispatch-cli 技能的安裝指引安裝其 npm 依賴（wsemi、lodash-es）。

```bash
agy --version   # 確認 agy 已安裝
```

若未安裝，使用官方安裝腳本（依執行環境選擇）：

```bash
# Windows PowerShell
irm https://antigravity.google/cli/install.ps1 | iex

# Windows CMD
curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd

# macOS / Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

安裝位置由執行 AI 自行決定（預設 `%LOCALAPPDATA%\agy\bin\` Windows / `$HOME/.local/bin` 或類似 Unix），只要最終 `agy` 指令可被執行即可。

**首次認證**：在桌面互動模式跑一次 `agy`（不加 `-p`），會開瀏覽器完成 Google OAuth。已登入 Antigravity 2.0 desktop 的使用者通常自動沿用 OAuth，不需另登入。

> **Headless / CI 環境**：`--dangerously-skip-permissions` 不會自動完成 OAuth；請事先在本機完成認證，憑證會快取在 `~/.agy/` 或 `%USERPROFILE%\.agy\`。

> **與 `dispatch-gemini` 的關係**：本技能是 `dispatch-gemini` 的後繼者（gemini CLI 於 2026-06-18 對個人帳戶停服）。Code Assist Enterprise 授權者仍可繼續用 `dispatch-gemini`；其餘人應改用本技能。
