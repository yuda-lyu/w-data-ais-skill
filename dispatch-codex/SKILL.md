---
name: dispatch-codex
description: This skill should be used when the user asks to "run codex as an agent", "call codex", "use codex cli as agent", "create codex agent", "multi-agent with codex", "dispatch task to codex", "launch codex", or needs to drive OpenAI Codex CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-codex — 以 Codex CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 OpenAI Codex CLI (`codex exec`) 作為獨立 agent 執行，
實現調度 AI ＋ Codex agent 混合的多 agent 工作流程。

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 Codex agent 執行任務
- 需要利用 Codex 進行程式碼生成、npm/pip 安裝等需要網路的工作
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 正確指令格式

```bash
codex exec \
  --full-auto \
  --skip-git-repo-check \
  --config sandbox_workspace_write.network_access=true \
  "你的任務描述"

# 指定模型（可選）
codex exec --full-auto --skip-git-repo-check \
  --config sandbox_workspace_write.network_access=true \
  -m gpt-5.4 \
  "你的任務描述"
```

## 模型選擇

| 模型 ID | 說明 |
|---------|------|
| `gpt-5.4` | **預設模型**，旗艦級專業工作用途 |
| `gpt-5.4-mini` | 輕量版，速度更快、成本更低 |
| `gpt-5.3-codex` | 專為程式碼優化的版本 |
| `gpt-5.3-codex-spark` | Codex 精簡版 |

指定模型：`-m gpt-5.4`（不指定即使用預設 `gpt-5.4`）

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `exec` | ✅ | 非互動/headless 模式（少了這個會出現 "stdin is not a terminal" 錯誤） |
| `--full-auto` | ✅ | 允許 Codex 自動執行所有操作，不需人工確認 |
| `--skip-git-repo-check` | ✅ | 允許在非 git repo 目錄下執行（否則報錯 "Not inside a trusted directory"） |
| `--config sandbox_workspace_write.network_access=true` | ✅ | 啟用沙箱網路，讓 npm install / pip install 等可以正常使用 |

## 常見錯誤與處理

| 錯誤訊息 | 原因 | 解法 |
|----------|------|------|
| `stdin is not a terminal` | 用了 `codex` 而非 `codex exec` | 改用 `codex exec` |
| `Not inside a trusted directory` | 未在 git repo 內且缺少旗標 | 加上 `--skip-git-repo-check` |
| npm install 網路失敗 | 沙箱預設封鎖網路 | 加上 `--config sandbox_workspace_write.network_access=true` |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 Codex agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# Codex agent — 使用 Bash/shell 工具（背景執行）
command: codex exec --full-auto --skip-git-repo-check \
         --config sandbox_workspace_write.network_access=true \
         "... 寫入 result_codex.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`codex_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/codex_result.txt`

## 前置需求確認

```bash
codex --version   # 確認 codex-cli 已安裝
```

若未安裝，請執行：
```bash
npm install -g @openai/codex
```

若無事先通過 OAuth 認證，則需設定 OpenAI API Key：
```bash
export OPENAI_API_KEY=your_key_here
```
