---
name: download-baidu-pdf
description: 用 Playwright + 本機 Chrome 把「百度網盤分享的 PDF（文件預覽）」逐頁抓取頁面圖片並合併成一份本機 PDF。百度對「文件類」分享提供逐頁圖片預覽（原始 PDF 下載會被「安裝客戶端」牆擋住），本技能用瀏覽器開啟預覽頁、攔截帶簽章的頁圖 URL（同檔共用一組 sign/timestamp/object/fid、約 3 小時有效、IP 綁定，只差 pagenum），在同一活著的 session 內併發抓全部頁、用 pdfkit 逐頁合併。經實測：公開分享免登入即可抓（拋棄式 headless Chrome、無 profile、零介入）。僅服務「免登入可預覽」的公開文件分享，不提供登入功能。產出為圖片式 PDF（掃描書來源無可搜尋文字層，需 OCR 另行處理）。
---

# download-baidu-pdf — 用本機 Chrome 抓百度網盤公開分享 PDF（逐頁圖片合併）

## 概述

把**百度網盤「免登入可預覽」的公開 PDF 分享**逐頁抓取頁面圖片，合併成一份本機 PDF。

**為什麼需要這個工具**：百度對「文件類」分享提供**逐頁圖片預覽**，但原始 PDF 的「下載」會被「安裝客戶端」牆擋住（免費帳號尤其）。本工具改走預覽路徑——把預覽頁跑起來、攔截帶簽章的頁圖 URL，逐頁抓圖再合併。

**特點**：
- 用 Playwright 啟動本機 Chrome（`channel: 'chrome'`，免下載 Chromium）
- **公開分享免登入、零介入**（實測 2026-05）：拋棄式 headless Chrome、**不建 user_data、不需登入、不需桌面視窗**，安裝即用
- **網路攔截**取得帶簽章的頁圖 URL：簽章 URL 由前端 JS 動態產生並以圖片請求發出，**不在靜態 HTML 裡**，必須攔網路請求才拿得到
- 抓圖用 `context.request`（**自動帶完整 cookie，含 HttpOnly**），與預覽 session 同 IP、同簽章
- 逐頁 JPEG 寫磁碟快取，**中斷可續傳**（重跑同指令只補缺的頁）
- 用 `pdfkit` 逐頁合併，每頁尺寸 = 圖片像素
- 臨時/輸出檔**各自管理於技能自身目錄**：預設落在 `download-baidu-pdf/tmp/`（不污染 cwd / 技能庫根目錄）

**適用場景**：
- 想保存只開放「逐頁預覽」、不給原檔下載的百度網盤**公開**文件分享
- 知識庫匯入、離線閱讀前置處理

**不適用**：
- **需登入 / 需提取碼 / 已失效的分享**（本技能僅服務免登入可預覽的公開分享，不提供登入功能）
- 多檔／資料夾分享（僅處理「單一文件預覽」）
- 非文件類預覽（影片、壓縮檔等）
- 需要可搜尋文字層的場景（產出為圖片式 PDF，掃描書來源需另行 OCR）

> ⚠️ 產出為**圖片式 PDF**（每頁是頁面圖片）。若來源是掃描書（無內嵌文字），合併後的 PDF 文字**不可搜尋**，需另行 OCR。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`playwright`、`pdfkit`
系統需求：已安裝 Chrome（透過 `channel: 'chrome'` 直接調用，不需另下載 Chromium）；預設 headless，不需桌面 session

執行前驗證：
```bash
node -e "require('playwright'); require('pdfkit'); console.log('deps OK')"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install playwright pdfkit
```

## 技術原理

### 為什麼非用 Playwright + 活著的瀏覽器 session 不可

| 直接做法 | 失敗原因 |
|---|---|
| `fetch(原始 PDF 下載連結)` | 被百度「安裝客戶端」牆擋住（免費帳號尤其） |
| 抓分享頁 HTML 找圖片 URL | 帶簽章的頁圖 URL 由前端 JS 動態產生並以圖片請求發出，**不在 HTML 裡** |
| 拿到簽章 URL 後關瀏覽器再抓 | 簽章 **IP + session 綁定**，須在同一活著的 context 內、帶其 cookie 抓圖 |

### 簽章機制

預覽端點 `https://cdndoc.pcs.baidu.com/rest/2.0/docview/doc?datatype=pic&...&pagenum=N` 逐頁回傳 JPEG。同一檔案所有頁**共用一組簽章**（`sign` / `timestamp` / `object` / `fid`，約 **3 小時**有效、**IP 綁定**），只差 `pagenum`。本技能攔到任一頁的簽章 URL 後，去掉 `&pagenum=` 當 base，併發改變 `pagenum` 抓全部頁。

### 公開分享免登入（實測判定）

實測（2026-05，以一個 350 頁公開 PDF 分享驗證）：**拋棄式 headless Chrome、無 profile、未登入**，即可攔到 `datatype=pic` 簽章 URL 並渲染完整預覽、組出 PDF。故本技能全程走全自動免登入路徑，**不提供任何登入功能**——需登入 / 提取碼 / 已失效的分享一律回 `preview-not-found`（不在本技能範圍）。

### 本技能的做法

```
1. chromium.launch（拋棄式本機 Chrome，channel:'chrome'，預設 headless、無 profile、不登入）
2. page.on('request') 掛網路攔截 → goto 分享頁
3. 輪詢：
   - datatype=pic 的簽章 URL（去掉 pagenum 當 base）
   - 總頁數：讀 DOM 頁碼指示「/N」(優先) → 網路參數 pageAll/page_num(>0) → --pages 手動
   - 檔名（頁面標題，去掉「_免费高速下载」等後綴）
4. 同一 context 內用 context.request 併發抓每頁 JPEG（自動帶 cookie；含重試 + 磁碟快取續傳）
5. 抓完關閉瀏覽器 → pdfkit 逐頁合併（頁面尺寸 = 圖片像素）
```

> 總頁數**優先讀 DOM 的「/N」頁碼指示**：實測百度 `method=info` 請求的 `page_num` 會先回 0，只信網路參數會誤判，故以畫面顯示的頁碼為準。

> 本技能的瀏覽器開啟／重試／反自動化機制，**參考**技能庫既有 `fetch-web-by-playwright-head` / `fetch-web-by-playwright-headless` / `fetch-youtube-transcript` 的累積經驗（`channel:'chrome'`、線性退避重試、`--disable-blink-features=AutomationControlled` + 隱藏 `navigator.webdriver`、`page.on('request')` 攔截）。

## 執行方式

### CLI

```bash
node download-baidu-pdf/scripts/download_baidu_pdf.mjs <百度分享網址> [輸出檔.pdf] [選項]
```

### 範例

```bash
# 公開分享（免登入、headless、全自動，自動偵測檔名與頁數；輸出到 download-baidu-pdf/tmp）
node download-baidu-pdf/scripts/download_baidu_pdf.mjs "https://pan.baidu.com/s/1xxxxxxxx==?linksource=zhihu"

# 指定輸出檔名與併發
node download-baidu-pdf/scripts/download_baidu_pdf.mjs "https://pan.baidu.com/link/zhihu/7Jxxxx==" "我的文件.pdf" --conc 6

# 輸出到指定目錄、保留逐頁圖檔（預設組裝完成後會自動刪除頁圖，只留 PDF）
node download-baidu-pdf/scripts/download_baidu_pdf.mjs "https://pan.baidu.com/s/1xxxx==" --out-dir ./out --keep-pages

# debug：有頭模式
node download-baidu-pdf/scripts/download_baidu_pdf.mjs "https://pan.baidu.com/s/1xxxx==" --headed
```

### 旗標

| 旗標 | 預設 | 說明 |
|------|------|------|
| `<百度分享網址>` | — | 必填：`pan.baidu.com/s/<token>` 或 `/link/.../<token>` |
| `[輸出檔.pdf]` | 分享頁標題 | 選填：輸出 PDF 檔名（未指定則用分享頁標題自動命名） |
| `--out-dir <path>` | `download-baidu-pdf/tmp` | 輸出目錄（預設技能自身目錄下的 tmp/） |
| `--conc <n>` | `5` | 併發抓圖數（過高易被限速，可調小如 3） |
| `--pages <n>` | 自動偵測 | 手動指定總頁數（自動偵測失敗時用） |
| `--keep-pages` | （預設刪除） | 保留逐頁 JPEG 暫存於 `<out-dir>/.pages_<slug>/`（供續傳/OCR）；**不加時，PDF 組裝完成後自動刪除頁圖、只留 PDF** |
| `--headed` | （預設無頭） | 有頭模式（debug 用） |
| `--wait <sec>` | `45` | 等預覽載入/取得簽章的秒數 |
| `--json` | 否 | 以 JSON 結構輸出至 stdout（否則只印輸出 PDF 路徑一行） |
| `--help` / `-h` | — | 顯示用法 |

## 程式化呼叫

```javascript
import { downloadBaiduPdf } from './download-baidu-pdf/scripts/downloadBaiduPdf.mjs'

const r = await downloadBaiduPdf('https://pan.baidu.com/s/1xxxx==')
if (r.status === 'success') {
    console.log(r.outputPath)   // 產出的 PDF 絕對路徑（預設於 download-baidu-pdf/tmp）
    console.log(r.totalPages)   // 頁數
}
```

選項：

```javascript
await downloadBaiduPdf(url, {
    output: '我的文件.pdf',        // 輸出 PDF 檔名（預設用分享頁標題）
    outDir: undefined,            // 輸出目錄（預設技能自身目錄下的 tmp/，即 download-baidu-pdf/tmp）
    concurrency: 5,               // 併發抓圖數（預設 5）
    pages: null,                  // 手動指定總頁數（自動偵測失敗時用）
    keepPages: false,             // 是否保留逐頁 JPEG 暫存（預設 false：組裝完成後刪除；設 true 保留供續傳/OCR）
    headless: true,               // 是否無頭（預設 true；設 false 供 debug）
    chromeChannel: 'chrome',
    navigationTimeoutMs: 30000,
    signatureWaitMs: 45000,       // 等預覽載入/取得簽章的 timeout
})
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "url": "https://pan.baidu.com/s/1xxxx==",
  "outputPath": "...\\download-baidu-pdf\\tmp\\我的文件.pdf",
  "fileName": "我的文件.pdf",
  "totalPages": 350,
  "sizeBytes": 101122048,
  "pagesDir": null,
  "keptPages": false,
  "fetchedAt": "2026-05-30 12:36:59"
}
```

> 預設（不加 `--keep-pages`）：PDF 組裝完成後即刪除頁圖，`keptPages: false`、`pagesDir: null`。加 `--keep-pages` 才保留，此時 `keptPages: true`、`pagesDir` 為 `<out-dir>/.pages_<slug>/` 的絕對路徑。
> 註：頁圖只在「成功合併 PDF」後才刪除；若中途抓圖失敗（`pages-failed`）會保留已抓頁圖，重跑同指令仍可續傳。

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "url": "https://pan.baidu.com/s/1xxxx==",
  "message": "找不到預覽頁圖簽章 URL：...本技能僅支援「免登入可預覽」的公開文件分享。",
  "reason": "preview-not-found",
  "fetchedAt": "2026-05-30 12:36:59"
}
```

`reason` 列舉：

| reason | 意義 |
|--------|------|
| `invalid-url` | 不是有效的百度網盤分享網址（需 `pan.baidu.com/s/...` 或 `/link/...`） |
| `missing-deps` | `playwright` 或 `pdfkit` 未安裝 |
| `preview-not-found` | 找不到預覽頁圖簽章 URL（非文件類預覽、需登入／提取碼、或分享已失效）——不在本技能範圍 |
| `total-pages-unknown` | 抓到簽章但偵測不到總頁數（請用 `--pages <n>` 手動指定） |
| `pages-failed` | 部分頁抓取失敗（簽章多半已過期；重跑同指令即可續傳，附 `failedPages`） |
| `playwright-error` | 瀏覽器啟動／導航／例外 |

## status 約定

依全庫慣例：
- `status: "success"` — PDF 已產出（`outputPath`），瀏覽器已關閉
- `status: "error"` — 各種失敗（見上表 `reason`）

## 重試與超時

- **開瀏覽器／導航** transient 失敗 → 重試（**最多 2 次，含初始 3 次**，線性退避 3s → 6s）。已分類錯誤（`preview-not-found`、`total-pages-unknown`、`pages-failed`）**不重試**。
- **每頁抓圖**：每頁最多 4 次嘗試（退避 0.5s → 1s → 1.5s），全頁跑完後對失敗頁再補一輪。
- **預設超時**：導航 30s；等簽章 45s（`--wait` 可調）；單頁請求 30s。

## 安全設計

- **不持久化任何登入態**：拋棄式 Chrome（Playwright 自動暫存目錄、跑完即丟），不建 user_data、不碰使用者個人 Chrome profile、不提供登入功能。
- `browser.close()` 放在 `finally` 區塊，確保資源釋放（即使拋例外）；抓圖完成即關閉瀏覽器（合併 PDF 為本機運算，不需 session）。
- 抓圖用 `context.request` 自動帶 context cookie，不手動複製／落地 cookie 字串。
- **路徑來源**：臨時/輸出檔預設落在**技能自身目錄**下的 `tmp/`（場景 B，用 `fileURLToPath(import.meta.url)` 解析，**不用** `new URL().pathname`），不寫到 cwd / 技能庫根目錄；fs 操作前 log 出 absolute 路徑驗收。可用 `--out-dir` 覆寫。

## 邊界與已知限制

1. **僅免登入公開分享**：需登入 / 提取碼 / 已失效的分享一律回 `preview-not-found`，本技能不提供登入功能。
2. **僅單一文件預覽**：不處理多檔／資料夾分享。
3. **僅圖片式 PDF**：產出每頁是頁面圖片，**不含可搜尋文字層**（掃描書來源需 OCR 另行處理）。
4. **簽章 3 小時過期**：抓到一半失敗多半是過期。**重新執行同一指令即可**（已抓的頁有磁碟快取會自動續傳；只重抓缺的頁，簽章已換則重新載入預覽取得新簽章）。
5. **解析度由百度預覽決定**：常見約 1517×2048／頁（約 180 DPI），非原檔解析度。
6. **依賴百度預覽 URL / DOM 結構**：若百度改 `datatype=pic` 端點、`pageAll`/`page_num` 參數名、或預覽頁碼「/N」呈現方式，攔截/偵測規則需更新。
