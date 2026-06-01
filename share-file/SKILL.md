---
name: share-file
description: 用 Playwright + 本機 Chrome 將檔案上傳到 Wormhole.app，回傳一次性 24 小時內過期的分享連結（max-downloads 與 expiration 皆可自訂；預設 1 次下載、24 小時過期）。檔案上限 5 GB（Wormhole 標準模式邊界）；上傳完成後立即關閉瀏覽器釋放系統資源（依靠 Wormhole server 端 24 小時保存）。
---

# share-file — 用 Wormhole.app 上傳檔案取得一次性連結

## 概述

驅動 Playwright 開本機 Chrome 至 [wormhole.app](https://wormhole.app/) 上傳檔案，UI 流程結束後讀取分享連結並關閉瀏覽器。連結預設「24 小時過期 + 1 次下載」，符合使用者要求的「一次性、24 小時內可下載」場景。

**為何 5GB 上限**：Wormhole 區分兩種模式：
- **標準模式（≤ 5GB）**：加密後上傳到 server，**24 小時內可下載；寄件方可關閉瀏覽器**
- **P2P 模式（5–10GB）**：純 WebRTC 點對點，**寄件方需保持瀏覽器開啟直到對方下載完**

本技能設計核心是「上傳完即關閉，釋放系統資源」，因此**僅支援標準模式**，檔案超過 5GB 直接拒絕（避免誤入 P2P 模式被卡住）。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`playwright`、`wsemi`、`lodash-es`
系統需求：已安裝 Chrome（透過 `channel: 'chrome'` 直接調用，不需另下載 Chromium）

執行前驗證：
```bash
node -e "require('playwright'); console.log('playwright OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install playwright wsemi lodash-es
```

## 執行方式

### CLI

```bash
# 預設：1 次下載、24 小時過期、無頭模式
node share-file/scripts/share_file.mjs ./my_file.pdf

# 自訂下載次數與過期時間
node share-file/scripts/share_file.mjs ./my_file.pdf --max-downloads 5 --expiration 6h

# JSON 結構輸出（含 actualSelectOptions 確認設定真的被套用）
node share-file/scripts/share_file.mjs ./my_file.pdf --json

# 將結果寫入檔案
node share-file/scripts/share_file.mjs ./my_file.pdf --output ./share_result.json

# 有頭模式（debug 用，可看到 Wormhole 介面）
node share-file/scripts/share_file.mjs ./my_file.pdf --headed
```

### 旗標

| 旗標 | 預設 | 說明 |
|------|------|------|
| `<file>` | — | 必填：要上傳的檔案路徑（必須是檔案，不可是資料夾） |
| `--max-downloads <N>` | `1` | 最大下載次數，僅接受 Wormhole 站方支援的選項：`1, 5, 10, 20, 50, 100` |
| `--expiration <T>` | `24h` | 過期時間，僅接受 Wormhole 站方支援的選項：`1h`（或 `60min`）`, 2h, 6h, 12h, 24h` |
| `--headed` | 否 | 以有頭模式跑 Playwright（預設無頭；除非 debug 否則不需要） |
| `--upload-timeout <sec>` | `600` | 上傳完成 timeout（秒），預設 10 分鐘；大檔配合慢網路可調高 |
| `--json` | 否 | 以 JSON 結構輸出至 stdout（否則純文字輸出 URL） |
| `--output <path>` | — | 將完整 JSON 結果寫入指定檔案 |
| `--help` / `-h` | — | 顯示用法 |

## 程式化呼叫

```javascript
import { shareFile } from './share-file/scripts/shareFile.mjs'

// 預設：1 次下載、24 小時、無頭
const r1 = await shareFile('./my_file.pdf')
console.log(r1.url)  // https://wormhole.app/XXX#YYYY

// 自訂
const r2 = await shareFile('./big_video.mp4', {
    maxDownloads: 5,
    expiration: '12h',
    headless: true,
    uploadTimeoutMs: 1200000,  // 20 分鐘
})
```

簽名：
```javascript
shareFile(
    filePath: string,
    options?: {
        maxDownloads?: 1 | 5 | 10 | 20 | 50 | 100,  // 預設 1
        expiration?: '1h' | '60min' | '2h' | '6h' | '12h' | '24h',  // 預設 '24h'
        headless?: boolean,                          // 預設 true
        chromeChannel?: string,                      // 預設 'chrome'
        navigationTimeoutMs?: number,                // 預設 30000
        uploadTimeoutMs?: number,                    // 預設 600000 (10 分鐘)
    }
): Promise<{
    status: 'success' | 'error',
    url?: string,                       // 成功時：完整 Wormhole 連結（含 # fragment 解密金鑰）
    fileName?: string,
    sizeBytes?: number,
    maxDownloads?: number,
    expiration?: string,
    actualSelectOptions?: string[],     // 成功時：實際生效的兩個 select option 文字（驗證用）
    message?: string,                   // 錯誤時
    reason?: string,                    // 錯誤時：詳列於下方
    fetchedAt: string,
}>
```

## 輸出格式

### 純文字 stdout（預設）

```
https://wormhole.app/abc123#xyz...
```

成功時只輸出 URL 一行；錯誤時 stderr 印失敗訊息、`exit 1`。適合 shell pipe：
```bash
URL=$(node share-file/scripts/share_file.mjs ./file.pdf)
```

### `--json` 模式（成功）

```json
{
  "status": "success",
  "url": "https://wormhole.app/2QQXpJ#NleiXsuNOEPQcccHnFn_lg",
  "fileName": "my_file.pdf",
  "sizeBytes": 512000,
  "maxDownloads": 1,
  "expiration": "24h",
  "actualSelectOptions": ["24 小時後", "1 下載"],
  "fetchedAt": "2026-05-18 17:07:42"
}
```

`actualSelectOptions` 是上傳後從 Wormhole UI 讀回的兩個 `<select>` 實際選定值，用於驗證「24 小時 / 1 下載」確實被套用，**不是預設值的回顯**——若站方改 UI 導致設定沒套到，這裡會立刻露餡。

### `--json` 模式（錯誤）

```json
{
  "status": "error",
  "message": "檔案過大 (5.00 GB ≥ 5 GB)，超過 Wormhole 標準模式上限；...",
  "reason": "too-large",
  "sizeBytes": 5368709121,
  "fileName": "huge.bin",
  "fetchedAt": "..."
}
```

## status 約定

依全庫慣例：
- `status: "success"` — URL 已取得，瀏覽器已關閉
- `status: "error"` — 各種失敗（見下表）

`reason` 列舉：

| reason | 意義 |
|--------|------|
| `invalid-input` | filePath 不是字串 |
| `file-not-found` | 路徑不存在 |
| `not-a-file` | 路徑存在但不是檔案（如資料夾、symlink） |
| `empty-file` | 檔案大小為 0 bytes |
| `too-large` | 檔案 ≥ 5 GB |
| `invalid-max-downloads` | maxDownloads 不在 `1/5/10/20/50/100` 內 |
| `invalid-expiration` | expiration 不在 `1h/60min/2h/6h/12h/24h` 內 |
| `missing-deps` | playwright 未安裝 |
| `playwright-error` | 瀏覽器啟動／導航／上傳互動失敗 |

## 重試與超時

本技能不做自動重試（上傳是長時 I/O，重試成本高且可能造成站方計費或限制）。失敗時直接回 `status: error`，由呼叫端決定是否重試。

**超時設定**：
- 導航 timeout：30 秒（首頁載入）
- 上傳 timeout：預設 10 分鐘，可用 `--upload-timeout` 或 `uploadTimeoutMs` 調整
  - 估算：上傳 1 GB ≈ 130 MB/min（10 Mbps 上行）→ 8 分鐘；故 1GB 內 10 分鐘多半夠用
  - 大檔（2–5 GB）建議加長至 1800 秒（30 分鐘）以上

## 上傳後資源釋放

上傳成功後（已讀到 URL）**立即 `browser.close()`**，不留待用：

- ≤5GB 走的是 server 模式，**Wormhole 主機保留檔案 24 小時**，寄件方不需持續在線
- 連結內含的 `#` fragment 是 AES-GCM 解密金鑰（永不上傳到 server），務必完整傳給收件方

## 安全與隱私

- 解密金鑰在 URL fragment（`#` 之後），server 不會收到此部分
- Wormhole 採用 128-bit AES-GCM + HKDF SHA-256 derived keys（[Wormhole Security Design](https://wormhole.app/security)）
- 本技能不做任何網路擷取／儲存，連結僅以 return 值方式傳回呼叫端
- 寫檔路徑（`--output`）經 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名

## 邊界與已知限制

1. **僅標準模式（≤ 5GB）**：超過走 P2P 模式需手動操作，本技能拒絕
2. **依賴 Wormhole UI 結構**：若站方改 chakra-input class 或 select 結構，本技能可能找不到元素；`actualSelectOptions` 欄位是早期警告機制
3. **不做重試**：失敗即報；長檔案 + 不穩網路須自行重試
4. **不支援批次**：一次只能上傳一個檔案；多檔請呼叫端自行迴圈，並建議在連續呼叫間加 `await sleep(10000)+` 避免觸發站方反爬機制
5. **headless 偵測**：實測 Wormhole.app 對 headless 不敏感，預設 headless；若日後站方加偵測可改 `--headed`
6. **不支援自訂 expiration / max-downloads 範圍以外的值**：本技能僅接受 Wormhole 站方 UI 提供的選項；自訂值（如 `--max-downloads 3`）會被拒絕
