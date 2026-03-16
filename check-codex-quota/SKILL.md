---
name: check-codex-quota
description: 查詢 OpenAI Codex 帳號的 AI 模型額度。顯示 5 小時 session 配額和週配額。適用於：(1) 查詢 Codex 帳號額度狀態、(2) 確認是否達到 rate limit、(3) 規劃 API 使用策略。
---

# Check Codex Quota

查詢 OpenAI Codex 帳號的配額狀態。

## 使用方式

### 1. 取得 Access Token 和 Account ID

從 OpenClaw auth-profiles 取得：

```bash
# 取得 token
TOKEN=$(cat ~/.openclaw/agents/main/agent/auth-profiles.json | jq -r '.profiles["openai-codex:default"].access')

# 取得 account ID
ACCOUNT_ID=$(cat ~/.openclaw/agents/main/agent/auth-profiles.json | jq -r '.profiles["openai-codex:default"].accountId')
```

### 2. 執行查詢

```bash
# 格式化輸出
python scripts/check_quota.py "$TOKEN" "$ACCOUNT_ID"

# JSON 輸出
python scripts/check_quota.py "$TOKEN" "$ACCOUNT_ID" --json
```

## 輸出範例

### 表格格式
```
Plan: plus
Limit Reached: No ✅

Quota Type         Used   Remain     Reset In
------------------------------------------------
5h Session          25%      75%         3.5h
Weekly              10%      90%        120.0h
```

### JSON 格式
```json
{
  "plan_type": "plus",
  "session_quota": {
    "label": "5h Session",
    "remaining_pct": 75,
    "used_pct": 25,
    "reset_time": "2026-02-05T16:00:00",
    "reset_hours": 3.5
  },
  "weekly_quota": {
    "label": "Weekly",
    "remaining_pct": 90,
    "used_pct": 10,
    "reset_time": "2026-02-10T00:00:00",
    "reset_hours": 120.0
  },
  "limit_reached": false,
  "allowed": true
}
```

## API 資訊

- **Endpoint**: `https://chatgpt.com/backend-api/wham/usage`
- **認證**: 
  - `Authorization: Bearer <access_token>`
  - `ChatGPT-Account-Id: <account_id>` (必須)
- **回傳結構**:
  - `rate_limit.primary_window`: 5 小時 session 配額
  - `rate_limit.secondary_window`: 週配額

## 配額說明

| 配額類型 | 說明 |
|----------|------|
| Session (5h) | 每 5 小時重置的短期配額 |
| Weekly | 每週重置的長期配額 |

## 錯誤處理

| HTTP Code | 原因 |
|-----------|------|
| 401 | Token 過期，需重新認證 |
| 403 | Account ID 錯誤或權限不足 |
| 429 | Rate limit，已達配額上限 |

## 注意事項

- `ChatGPT-Account-Id` header 是必須的，否則 API 會回傳錯誤
- Account ID 可從 access token 的 JWT payload 中提取
- OpenAI Codex 目前只有一個模型，不像 Antigravity 有多模型配額
