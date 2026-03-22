---
name: send-email
description: 透過 Google Apps Script Web App API 寄送 Email（純文字或 HTML），支援 JSON 檔案輸入與直接參數兩種模式。適用於 AI Agent 自動寄信、報告通知等場景。
---

# send-email — 透過 GAS Web App 寄送 Email

## 概述

透過 Google Apps Script (GAS) 部署的 Web App HTTP API 寄送 Email。
調度 AI 不直接操作 Gmail，而是以 `axios` POST JSON 到 GAS `/exec` 端點，由 GAS 端呼叫 `MailApp.sendEmail()` 完成寄信。

## 技術原理

```text
調度 AI 組成 JSON
→ axios POST 到 GAS /exec
→ GAS 驗證 token
→ MailApp.sendEmail()
→ 回傳 { ok, message, quotaRemaining }
```

## 前置需求

1. Node.js 已安裝
2. 依賴已安裝：`npm install axios`
3. 使用者須提供：
   - `gas_url` — GAS Web App 部署網址（須以 `/exec` 結尾）
   - `token` — GAS 端設定的驗證 token

## 執行方式

> 須從**專案或技能庫或技能所在目錄**（具有 `node_modules` 所在位置）執行。

### 模式 A：JSON 檔案（推薦，適合 HTML 信件）

```bash
node send-email/scripts/send_email.mjs <payload.json> [outputPath]
```

payload.json 格式：

```json
{
  "gas_url": "https://script.google.com/macros/s/XXXX/exec",
  "token": "your_secret_token",
  "to": "someone@example.com",
  "from": "AI 助理",
  "subject": "信件主旨",
  "body": "純文字內容（備援）",
  "htmlBody": "<html><body><h1>HTML 內容</h1></body></html>"
}
```

### 模式 B：直接參數（適合純文字信件）

```bash
node send-email/scripts/send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]
```

### 範例

```bash
# JSON 模式 — 寄送 HTML 報告
node send-email/scripts/send_email.mjs ./email_payload.json ./result.json

# 參數模式 — 寄送純文字通知
node send-email/scripts/send_email.mjs \
  "https://script.google.com/macros/s/XXXX/exec" \
  "my_token" \
  "someone@example.com" \
  "AI 助理" \
  "每日報告完成通知" \
  "您的每日報告已產出完畢，請至指定目錄查看。"
```

## 必填欄位

| 欄位 | 必要 | 說明 |
|------|------|------|
| `gas_url` | ✅ | GAS Web App 部署網址，須以 `/exec` 結尾 |
| `token` | ✅ | GAS 端設定的驗證 token |
| `to` | ✅ | 收件人 email |
| `from` | ✅ | 寄件顯示名稱（對應 `MailApp.sendEmail({ name })` ） |
| `subject` | ✅ | 信件主旨 |
| `body` | ⚠️ | 純文字內容（`body` 與 `htmlBody` 至少擇一） |
| `htmlBody` | ⚠️ | HTML 內容（若提供，建議同時提供 `body` 作為純文字備援） |

## 輸出格式

結果**一律寫入檔案**（JSON），無論成功或錯誤均寫入後才 exit。請讀取輸出檔取得結果，勿依賴 stdout。

**預設檔名**：`send_email_result_YYYYMMDD.json`

成功：

```json
{
  "status": "success",
  "sentAt": "2026-03-22 14:30:00",
  "to": "someone@example.com",
  "from": "AI 助理",
  "subject": "信件主旨",
  "gasResponse": {
    "ok": true,
    "message": "Email sent",
    "quotaRemaining": 95
  }
}
```

錯誤：

```json
{
  "status": "error",
  "message": "HTTP 403: ...",
  "attempt": 5
}
```

## AI Agent 標準操作流程

1. 向使用者確認 `gas_url` 與 `token`（若尚未提供）
2. 確認 `to`、`from`、`subject`、`body` 或 `htmlBody`
3. 若為 HTML 信件：先寫 payload JSON 檔，再用模式 A 執行
4. 若為純文字信件：可直接用模式 B 傳參數
5. 讀取輸出檔案，檢查 `status` 是否為 `success`
6. 向使用者回報結果（含 `quotaRemaining`）

## 常見錯誤與排除

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `缺少必填欄位: from` | 請求缺少 `from` | 補上寄件顯示名稱 |
| `HTTP 403` | Web App 部署權限不正確 | 確認 GAS 已部署為公開可呼叫的 Web App |
| `Unauthorized` | token 錯誤 | 確認 token 大小寫與內容完全一致 |
| `Missing body/htmlBody` | 兩者皆未提供 | 至少提供 `body` 或 `htmlBody` |
| 中文亂碼 | 編碼問題 | 腳本已內建 `charset=utf-8`，通常無須額外處理 |
| 5xx 伺服器錯誤 | GAS 暫時不可用 | 腳本內建自動重試（最多 5 次），等待 3s → 6s → ... → 上限 15s |
| `Cannot find module 'axios'` | 未安裝依賴 | 執行 `npm install axios` |

## HTML 信件建議

- 使用 `htmlBody` 寄送 HTML 信件時，建議同時提供 `body` 作為純文字備援
- 複雜 HTML 內容（表格、樣式）請使用 JSON 檔案模式（模式 A），避免 shell 跳脫問題
- 內聯樣式（`style="..."`）在 Email 客戶端相容性最佳，避免使用 `<style>` 區塊或外部 CSS

## 快速執行

```bash
# 從專案或技能庫或技能所在目錄（具有 `node_modules` 所在位置）執行
node send-email/scripts/send_email.mjs <payload.json> [outputPath]
node send-email/scripts/send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]
```
