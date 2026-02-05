---
name: check-all-quota
description: 批次查詢所有 AI 帳號的模型額度（Google Antigravity + OpenAI Codex）。自動偵測 auth-profiles.json 中的所有帳號並平行查詢。適用於：(1) 一次查看所有帳號額度、(2) 找出可用額度最多的帳號、(3) 規劃帳號輪替策略、(4) 監控所有 AI 服務配額狀態。
---

# Check All Quota

批次查詢所有 AI 帳號的**全部模型額度**。

## 支援 Provider

- **Google Antigravity**: Claude, Gemini, GPT-OSS 等模型
- **OpenAI Codex**: 5 小時 session 配額和週配額

## 使用方式

```bash
# 預設格式化輸出
python scripts/check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json

# JSON 輸出（完整結構化資料）
python scripts/check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json --json
```

## 輸出要求

執行後**必須回傳**：
1. 全部帳號的全部模型額度
2. 每個模型的使用百分比、剩餘百分比、重置時間
3. 若查詢失敗，必須提供該帳號的錯誤資訊

## 輸出範例

```
============================================================
🌐 Google Antigravity Accounts
============================================================

📧 firsemisphere5@gmail.com
   Model                                 Used  Remain    Reset
   ---------------------------------------------------------
   claude-opus-4-5-thinking              0.0%  100.0%       5h
   claude-sonnet-4-5                      0.0%  100.0%       5h
   gemini-2.5-pro                         0.0%  100.0%       5h
   ...（顯示全部模型）

📧 firsemisphere6@gmail.com
   ❌ Error: Token expired

============================================================
🤖 OpenAI Codex Accounts
============================================================

📧 default (Plan: plus)
   Quota Type                           Used  Remain    Reset
   ---------------------------------------------------------
   codex-session-5h                      0.0%  100.0%       4h
   codex-weekly                         35.0%   65.0%     111h

============================================================
📊 Summary
   Google Antigravity: 6 accounts
   OpenAI Codex: 1 accounts
   Total: 7 accounts
   Errors: 1
```

## 模型排序

各帳號的模型按以下固定順序顯示：

1. claude-opus-4-5-thinking
2. claude-sonnet-4-5-thinking
3. claude-sonnet-4-5
4. gemini-3-pro-high
5. gemini-3-pro-low
6. gemini-3-pro-image
7. gemini-3-flash
8. gemini-2.5-pro
9. gemini-2.5-flash
10. gemini-2.5-flash-thinking
11. gemini-2.5-flash-lite
12. gpt-oss-120b-medium

未列出的模型會排在最後。

## 模型排序

各帳號的模型額度按以下順序顯示：

1. claude-opus-4-5-thinking
2. claude-sonnet-4-5-thinking
3. claude-sonnet-4-5
4. gemini-3-pro-high
5. gemini-3-pro-low
6. gemini-3-pro-image
7. gemini-3-flash
8. gemini-2.5-pro
9. gemini-2.5-flash
10. gemini-2.5-flash-thinking
11. gemini-2.5-flash-lite
12. gpt-oss-120b-medium

未列出的模型會排在最後。

## 自動偵測帳號

腳本會自動讀取 `auth-profiles.json` 並根據 `provider` 欄位分類：
- `provider: "google-antigravity"` → 使用 Antigravity API
- `provider: "openai-codex"` → 使用 ChatGPT API

新增或移除帳號後，腳本會自動偵測變更，無需修改程式碼。

## 錯誤處理

每個帳號獨立查詢，若某帳號查詢失敗：
- 該帳號會顯示 `❌ Error: <錯誤訊息>`
- 不影響其他帳號的查詢
- Summary 會統計錯誤數量

常見錯誤：
| 錯誤 | 說明 |
|------|------|
| Token expired | 需執行 `openclaw login <provider>` 重新認證 |
| HTTP 403 | 帳號需驗證或被停用 |
| HTTP 429 | Rate limit |
| Network error | 網路連線問題 |

## JSON 輸出格式

```json
[
  {
    "provider": "google-antigravity",
    "email": "firsemisphere5@gmail.com",
    "project_id": "...",
    "quotas": [
      {"model": "claude-opus-4-5-thinking", "remaining_pct": 100, "used_pct": 0, "reset_time": "...", "reset_hours": 5.0},
      {"model": "gemini-2.5-pro", "remaining_pct": 100, "used_pct": 0, ...}
    ]
  },
  {
    "provider": "google-antigravity",
    "email": "firsemisphere6@gmail.com",
    "error": "Token expired",
    "quotas": []
  },
  {
    "provider": "openai-codex",
    "email": "default",
    "account_id": "...",
    "plan_type": "plus",
    "limit_reached": false,
    "quotas": [
      {"model": "codex-session-5h", "remaining_pct": 100, "used_pct": 0, ...},
      {"model": "codex-weekly", "remaining_pct": 65, "used_pct": 35, ...}
    ]
  }
]
```

## 特性

- **自動偵測**: 根據 auth-profiles.json 動態載入所有帳號
- **完整回傳**: 回傳每個帳號的全部模型額度
- **錯誤資訊**: 查詢失敗時提供明確錯誤訊息
- **平行查詢**: 使用 ThreadPoolExecutor 同時查詢（最多 8 並行）
- **多 Provider**: 支援 Google Antigravity 和 OpenAI Codex
