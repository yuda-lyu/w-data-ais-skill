---
name: dispatch-opencode
description: This skill should be used when the user asks to "run opencode as an agent", "call opencode", "use opencode cli as agent", "create opencode agent", "multi-agent with opencode", "dispatch task to opencode", "launch opencode", or needs to drive OpenCode CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-opencode — 以 OpenCode CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 OpenCode CLI (`opencode run`) 作為獨立 agent 執行，
實現調度 AI ＋ OpenCode agent 混合的多 agent 工作流程。

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 OpenCode agent 執行任務
- 需要利用 OpenCode 調用各種 AI 模型（GPT、Gemini、DeepSeek、Nemotron 等）
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 正確指令格式

```bash
opencode run --agent build -m "opencode/nemotron-3-super-free" "你的任務描述"

# 指定其他模型
opencode run --agent build -m "opencode/gpt-5.4-mini" "你的任務描述"

# JSON 格式輸出（便於程式解析）
opencode run --agent build -m "opencode/nemotron-3-super-free" --format json "你的任務描述"

# 附帶檔案
opencode run --agent build -m "opencode/nemotron-3-super-free" -f ./input.txt "分析這個檔案"
```

## 模型選擇

### 免費模型（推薦測試與日常使用）

| 模型 ID | 說明 |
|---------|------|
| `opencode/nemotron-3-super-free` | **預設模型**，Nvidia Nemotron 免費版 |
| `opencode/mimo-v2-omni-free` | Mimo V2 Omni 免費版 |
| `opencode/mimo-v2-pro-free` | Mimo V2 Pro 免費版 |
| `opencode/minimax-m2.5-free` | MiniMax M2.5 免費版 |

### OpenAI 系列

| 模型 ID | 說明 |
|---------|------|
| `opencode/gpt-5.4` | GPT 旗艦級 |
| `opencode/gpt-5.4-mini` | 輕量版，速度更快、成本更低 |
| `opencode/gpt-5.3-codex` | 程式碼優化版 |
| `opencode/gpt-5.3-codex-spark` | Codex 精簡版 |

### Claude 系列

| 模型 ID | 說明 |
|---------|------|
| `opencode/claude-opus-4-6` | Claude Opus 旗艦 |
| `opencode/claude-sonnet-4-6` | Claude Sonnet |
| `opencode/claude-haiku-4-5` | Claude Haiku 輕量 |

### 其他模型

| 模型 ID | 說明 |
|---------|------|
| `opencode/gemini-3-flash` | Google Gemini Flash |
| `opencode/gemini-3.1-pro` | Google Gemini Pro |
| `opencode/kimi-k2.5` | Kimi K2.5 |
| `opencode/glm-5` | 智譜 GLM-5 |
| `nvidia/deepseek-ai/deepseek-r1` | DeepSeek R1 推理模型 |

指定模型：`-m "opencode/nemotron-3-super-free"`（不指定則使用 opencode 預設）

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `run` | ✅ | 非互動/headless 模式，執行完即退出 |
| `--agent build` | ✅ | 使用 `build` agent，權限全開（自動核准所有操作） |
| `-m "nameProvider/nameAI/model"` | 建議 | 指定模型，格式為 `nameProvider/nameAI/model`（如 `nvidia/deepseek-ai/deepseek-r1`）或 `provider/model`（如 `opencode/nemotron-3-super-free`） |
| `--format json` | ❌ 可選 | 輸出 JSONL 事件流，適合程式解析 |
| `-f <file>` | ❌ 可選 | 附加檔案給任務 |
| `--variant` | ❌ 可選 | 推理強度（如 `high`、`max`、`minimal`） |
| `--title` | ❌ 可選 | 為 session 命名 |

> **與 Codex / Gemini 的差異**：OpenCode 不需要 `--full-auto`、`--skip-git-repo-check`、`--config` 等旗標，
> 因為 `--agent build` 已預設權限全開。也不需要先 `cd` 切換目錄。

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| 卡住等待人工確認 | 未使用 `--agent build` | 加上 `--agent build` |
| 模型找不到 | 模型 ID 格式錯誤 | 用 `opencode models` 查詢完整列表 |
| 認證失敗 | 未登入對應 provider | 執行 `opencode auth login` |
| 操作外部目錄被拒 | `external_directory` 權限為 ask | 在任務描述中指定寫入專案目錄內的路徑 |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 OpenCode agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# OpenCode agent — 使用 Bash/shell 工具（背景執行）
command: opencode run --agent build -m "opencode/nemotron-3-super-free" "... 寫入 result_opencode.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`opencode_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/opencode_result.txt`

## 安裝指引

```bash
opencode --version   # 確認 opencode 已安裝
opencode auth list   # 確認已登入的 provider
opencode models      # 查看可用模型列表
```

若未安裝，請執行：
```bash
npm install -g opencode-ai
```

認證方式（依 provider 不同）：
```bash
# OAuth 登入（如 OpenAI）
opencode auth login

# 或設定 API Key 環境變數（依 provider 而異）
```
