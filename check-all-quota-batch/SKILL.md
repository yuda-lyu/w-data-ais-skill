---
name: check-all-quota-batch
description: 批次查詢所有 AI 帳號的模型額度（Google Antigravity + OpenAI Codex）。自動偵測 auth-profiles.json 中的所有帳號並平行查詢。適用於：(1) 一次查看所有帳號額度、(2) 找出可用額度最多的帳號、(3) 規劃帳號輪替策略、(4) 監控所有 AI 服務配額狀態。
---

# Check All Quota (Batch)

批次查詢所有 AI 帳號的模型額度，支援：
- **Google Antigravity**: Claude, Gemini, GPT-OSS 等模型
- **OpenAI Codex**: 5 小時 session 配額和週配額

## 使用方式

```bash
# 預設格式化輸出
python scripts/check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json

# JSON 輸出
python scripts/check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json --json
```

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

📧 firsemisphere@gmail.com
   claude-opus-4-5-thinking            100.0%    0.0%      83h
   ...

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
   Errors: 0
```

## 自動偵測帳號

腳本會自動讀取 `auth-profiles.json` 並根據 `provider` 欄位分類：
- `provider: "google-antigravity"` → 使用 Antigravity API
- `provider: "openai-codex"` → 使用 ChatGPT API

新增或移除帳號後，腳本會自動偵測變更，無需修改程式碼。

## 特性

- **自動偵測**: 根據 auth-profiles.json 動態載入所有帳號
- **平行查詢**: 使用 ThreadPoolExecutor 同時查詢多帳號（最多 8 並行）
- **多 Provider**: 支援 Google Antigravity 和 OpenAI Codex
- **Token 檢查**: 自動檢測過期 token
- **統一格式**: 所有 provider 輸出格式一致

## JSON 輸出格式

```json
[
  {
    "provider": "google-antigravity",
    "email": "firsemisphere5@gmail.com",
    "project_id": "...",
    "quotas": [
      {"model": "claude-opus-4-5-thinking", "remaining_pct": 100, "used_pct": 0, ...}
    ]
  },
  {
    "provider": "openai-codex",
    "email": "default",
    "account_id": "...",
    "plan_type": "plus",
    "limit_reached": false,
    "quotas": [
      {"model": "codex-session-5h", "remaining_pct": 100, "used_pct": 0, ...}
    ]
  }
]
```

## 常見錯誤

| 錯誤 | 說明 |
|------|------|
| Token expired | 需執行 `openclaw login <provider>` 重新認證 |
| HTTP 403 | 帳號需驗證或被停用 |
| HTTP 429 | Rate limit，減少並行數或稍後重試 |
