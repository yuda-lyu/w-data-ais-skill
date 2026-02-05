---
name: check-antigravity-quota-batch
description: 批次查詢多個 Google Antigravity 帳號的 AI 模型額度。自動讀取 auth-profiles.json 並平行查詢所有帳號。適用於：(1) 一次查看所有帳號額度、(2) 找出可用額度最多的帳號、(3) 規劃帳號輪替策略。
---

# Check Antigravity Quota (Batch)

批次查詢多個 Google Antigravity 帳號的模型額度。

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
📧 firsemisphere@gmail.com
   Model                                 Used  Remain    Reset
   ---------------------------------------------------------
   claude-opus-4-5-thinking             85.0%   15.0%      24h
   gemini-2.5-pro                       60.0%   40.0%      18h

============================================================
📧 firsemisphere2@gmail.com
   Model                                 Used  Remain    Reset
   ---------------------------------------------------------
   claude-opus-4-5-thinking             20.0%   80.0%      48h

============================================================
📊 Summary
   Total accounts: 6
   Errors: 1
```

## JSON 輸出格式

```json
[
  {
    "email": "firsemisphere@gmail.com",
    "project_id": "mesmerizing-smithy-3g808",
    "token_expires": "2026-02-05T14:00:00",
    "quotas": [
      {
        "model": "claude-opus-4-5-thinking",
        "remaining_pct": 15.0,
        "used_pct": 85.0,
        "reset_time": "2026-02-06T12:30:00",
        "reset_hours": 24.5
      }
    ]
  }
]
```

## 特性

- **平行查詢**: 使用 ThreadPoolExecutor 同時查詢多帳號
- **自動過濾**: 只查詢 `google-antigravity` provider
- **Token 檢查**: 自動檢測過期 token
- **Top 10**: 每帳號只顯示使用量最高的 10 個模型

## 常見錯誤

| 錯誤 | 說明 |
|------|------|
| Token expired | 需執行 `openclaw login google-antigravity` 重新認證 |
| HTTP 403 | 帳號需驗證或被停用 |
| HTTP 429 | Rate limit，減少並行數或稍後重試 |
