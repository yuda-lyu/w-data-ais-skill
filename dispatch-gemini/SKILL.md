---
name: dispatch-gemini
description: This skill should be used when the user asks to "run gemini as an agent", "call gemini", "use gemini cli as agent", "create gemini agent", "multi-agent with gemini", "dispatch task to gemini", "launch gemini", or needs to drive Google Gemini CLI as a subprocess agent within a multi-agent workflow.
---

# dispatch-gemini — 以 Gemini CLI 作為 Agent 驅動

## 概述

此 skill 教導調度 AI 如何將 Google Gemini CLI (`gemini`) 作為獨立 agent 執行，
實現調度 AI ＋ Gemini agent 混合的多 agent 工作流程。

## 何時使用此 Skill

- 使用者要求同時派出調度 AI 和 Gemini agent 執行任務
- 需要利用 Gemini 進行程式碼生成、npm/pip 安裝等需要網路的工作
- 建立 multi-agent pipeline，各 agent 各司其職寫入不同輸出檔案

## 正確指令格式

```bash
cd "工作目錄路徑"
gemini --approval-mode=yolo -p "你的任務描述"

# 指定模型（可選）
gemini --approval-mode=yolo -m gemini-2.5-pro -p "你的任務描述"
```

## 模型選擇

### Preview 系列（最新前沿）

| 模型 ID | 說明 |
|---------|------|
| `gemini-3.1-pro-preview` | 最新旗艦，進階推理 + agentic/vibe coding 能力 |
| `gemini-3.1-flash-lite-preview` | 高效能輕量 preview 版 |

### Stable 系列（生產環境推薦）

| 模型 ID | 說明 |
|---------|------|
| `gemini-2.5-pro` | 最強穩定版，複雜推理任務 |
| `gemini-2.5-flash` | 最佳性價比，低延遲高吞吐 |
| `gemini-2.5-flash-lite` | 最快速、最省成本 |

> ⚠️ 注意：`gemini-3-pro-preview`（v3.0）已於 2026-03-09 關閉。
> `gemini-3.1-pro-preview`（v3.1）為不同版本，目前仍可使用。

指定模型：`-m gemini-3.1-pro-preview`（不指定則使用 CLI 預設）

### 各參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `cd` 切換目錄 | ✅ | Gemini 以當前目錄為工作路徑，必須先 cd 到指定位置 |
| `--approval-mode=yolo` | ✅ | 自動核准所有工具操作，不需人工確認（`--yolo` 為舊版別名，建議改用此參數） |
| `-p "prompt"` | ✅ | 非互動/headless 模式，直接執行單一任務後退出 |
| `--sandbox` | ❌ 避免 | 會限制網路存取，導致 npm install 失敗 |

> **與 Codex 的差異**：Gemini 預設可連網，不需額外網路旗標；工作目錄靠 `cd` 指定，而非 CLI 參數。

## 常見錯誤與處理

| 錯誤情況 | 原因 | 解法 |
|----------|------|------|
| npm install 失敗 | 誤加了 `--sandbox` | 移除 `--sandbox` |
| 任務在錯誤目錄執行 | 忘記 `cd` 到工作目錄 | 在 gemini 指令前加 `cd "路徑" &&` |
| 等待人工確認而卡住 | 缺少自動核准參數 | 加上 `--approval-mode=yolo`（`--yolo` 亦可但為舊版別名） |

## 多 Agent 工作流程範例

當需要同時派出調度 AI 和 Gemini agent 時，以 **背景** 方式平行執行：

### Step 1: 平行啟動兩個 agent

```
# 調度 AI 自身的 subagent（依平台而異，例如 Agent tool / run_in_background）
prompt: "... 寫入 result_dispatcher.txt"

# Gemini agent — 使用 Bash/shell 工具（背景執行）
command: cd 工作路徑/gemini && gemini --approval-mode=yolo -p "... 寫入 result.txt"
```

### Step 2: 等待兩者完成後讀取結果

兩個背景任務都完成通知後，再讀取兩個輸出檔案，進行彙整。

## 輸出結構建議

- 每個 agent 寫入**不同檔案**，避免衝突
- 命名慣例：`{agent_type}_result.txt`（例：`dispatcher_result.txt`、`gemini_result.txt`）
- 任務描述中明確指定絕對路徑，例如 `d:/tmp/wk/gemini/result.txt`

## 安裝指引

```bash
gemini --version   # 確認 gemini-cli 已安裝
```

若未安裝，請執行：
```bash
npm install -g @google/gemini-cli
```

需通過 Google OAuth 認證（初次使用時互動登入），或設定 API Key：
```bash
export GEMINI_API_KEY=your_key_here
```

> **Headless / CI 環境**：`--approval-mode=yolo` 為非互動模式，無法進行 OAuth 互動登入。請事先在本機完成 OAuth 認證（憑證會快取），或改用 `GEMINI_API_KEY` 環境變數。
