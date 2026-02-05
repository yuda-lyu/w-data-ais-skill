---
name: check-antigravity-quota
description: 查詢單一 Google Antigravity 帳號的 AI 模型額度。顯示各模型的使用量、剩餘百分比、重置時間。適用於：(1) 查詢特定帳號的額度狀態、(2) 確認模型是否可用、(3) 規劃 API 使用策略。
---

# Check Antigravity Quota

查詢單一 Google Antigravity 帳號的所有 AI 模型額度狀態。

## 使用方式

### 1. 取得 Access Token

從 OpenClaw auth-profiles 取得：

```bash
cat ~/.openclaw/agents/main/agent/auth-profiles.json | jq -r '.profiles["google-antigravity:<email>"].access'
```

### 2. 執行查詢

```bash
# 格式化表格輸出
python scripts/check_quota.py "<access_token>"

# JSON 輸出
python scripts/check_quota.py "<access_token>" --json

# 指定 project ID（可選）
python scripts/check_quota.py "<access_token>" --project-id "<project_id>"
```

## 輸出範例

### 表格格式
```
Model                                      Used   Remain     Reset In
------------------------------------------------------------------------
gemini-2.5-pro                             85.0%   15.0%        24.5h
claude-opus-4-5-thinking                   72.3%   27.7%        18.2h
claude-sonnet-4-5                          45.0%   55.0%        12.1h
```

### JSON 格式
```json
[
  {
    "model": "gemini-2.5-pro",
    "remaining_pct": 15.0,
    "used_pct": 85.0,
    "reset_time": "2026-02-06T12:30:00",
    "reset_hours": 24.5
  }
]
```

## API 資訊

- **Endpoint**: `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- **認證**: Bearer token (OAuth access token)
- **回傳**: 各模型的 `quotaInfo.remainingFraction` 和 `quotaInfo.resetTime`

## 錯誤處理

| HTTP Code | 原因 |
|-----------|------|
| 401 | Token 過期，需重新認證 |
| 403 | 帳號需驗證或權限不足 |
| 429 | Rate limit，稍後再試 |

## 注意事項

- Access token 有效期約 1 小時，過期需 refresh
- 過濾掉 `chat_` 和 `tab_` 開頭的內部模型
- 結果按使用量由高到低排序
