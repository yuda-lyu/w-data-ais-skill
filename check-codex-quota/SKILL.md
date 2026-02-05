---
name: check-codex-quota
description: 查詢 OpenAI Codex 帳號的 AI 模型額度。顯示 5 小時 session 配額和週配額。適用於：(1) 查詢 Codex 帳號額度狀態、(2) 確認是否達到 rate limit、(3) 規劃 API 使用策略。
---

# Check Codex Quota

查詢 OpenAI Codex 帳號的配額狀態。

## 使用方式

### 1. 取得 Access Token

從 OpenClaw auth-profiles 取得：

```bash
cat ~/.openclaw/agents/main/agent/auth-profiles.json | jq -r '.profiles["openai-codex:default"].access'
```

### 2. 執行查詢

```bash
# 格式化輸出
python scripts/check_codex_quota.py "<access_token>"

# JSON 輸出
python scripts/check_codex_quota.py "<access_token>" --json

# 指定 account ID（可選，會自動從 token 解析）
python scripts/check_codex_quota.py "<access_token>" --account-id "<account_id>"
```

## 輸出範例

### 表格格式
```
📧 Email: user@example.com
📋 Plan: plus

Window               Used   Remain     Reset In
----------------------------------------------------
primary (5h)           45%      55%         2.3h
weekly                 20%      80%        72.5h
code_review            10%      90%         4.8h
```

### JSON 格式
```json
{
  "email": "user@example.com",
  "plan": "plus",
  "windows": [
    {
      "name": "primary (5h)",
      "used_pct": 45,
      "remaining_pct": 55,
      "reset_time": "2026-02-05T15:30:00",
      "reset_hours": 2.3,
      "limit_reached": false
    }
  ]
}
```

## API 資訊

- **Endpoint**: `https://chatgpt.com/backend-api/wham/usage`
- **認證**: Bearer token + `ChatGPT-Account-Id` header
- **回傳結構**:
  - `rate_limit.primary_window`: 5 小時 session 配額
  - `rate_limit.secondary_window`: 週配額
  - `code_review_rate_limit`: Code review 專用配額

## 配額類型

| 配額 | 說明 | 重置週期 |
|------|------|----------|
| primary (5h) | 主要使用配額 | 5 小時 |
| weekly | 週配額上限 | 7 天 |
| code_review | Code review 專用 | 5 小時 |

## 錯誤處理

| HTTP Code | 原因 |
|-----------|------|
| 401 | Token 過期，需重新認證 |
| 403 | 帳號權限不足或被停用 |
| 429 | Rate limit，配額用盡 |

## 注意事項

- Account ID 會自動從 JWT token 的 `https://api.openai.com/auth.chatgpt_account_id` 解析
- Token 有效期約 10 天，過期需 refresh
