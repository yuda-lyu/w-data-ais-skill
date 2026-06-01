---
name: convert-chinese
description: 繁體中文與簡體中文互轉技能，基於 opencc-js。支援大陸簡體（cn）↔ 台灣繁體（tw 字級／twp 詞級）↔ 香港繁體（hk）↔ 日本新字體（jp）↔ 通用繁體（t）任意方向轉換。預設 cn→twp（簡轉繁台灣詞級，例：网络→網路、视频→影片）。可接受字串、檔案或 stdin 輸入；輸出純文字或 JSON 結構。
---

# convert-chinese — 繁簡中文互轉

## 概述

包裝 [opencc-js](https://github.com/nk2028/opencc-js) 為一致的 CLI 與程式化 API，用於繁體中文與簡體中文（及香港繁體、日本新字體）之間任意方向轉換。

**典型用途**：
- 抓取大陸網站文章（簡體）→ 轉成台灣讀者習慣的繁體
- 抓取台灣／香港網站內容 → 轉成簡體供大陸場景使用
- 對接 fetch-aisixiang／fetch-guancha 等只接受簡體查詢的站點

## locale 代碼

opencc-js 原生支援：

| 代碼 | 名稱 | 說明 |
|------|------|------|
| `cn` | 簡體中文（大陸） | 標準大陸簡體 |
| `tw` | 繁體中文（台灣，字級） | 僅字形轉換（软件→軟件、网络→網絡） |
| `twp` | 繁體中文（台灣，詞級） | **含詞彙轉換**（软件→軟體、网络→網路、视频→影片、信息→資訊） |
| `hk` | 繁體中文（香港） | 香港字形與用詞 |
| `jp` | 日本新字體 | 日本當用漢字 |
| `t` | OpenCC 通用繁體 | 標準繁體（不偏地區） |

**預設** `from=cn, to=twp`：絕大多數場景（簡轉繁台灣）的合理預設。若不希望換詞彙（保留原文措辭），改用 `--to tw`。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`opencc-js`、`wsemi`、`lodash-es`

執行前驗證（`lodash-es` 為 ESM-only，須用動態 `import()` 檢測，不可 `require`）：
```bash
node -e "require('opencc-js'); require('wsemi'); import('lodash-es').then(() => console.log('deps OK'))"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install opencc-js wsemi lodash-es
```

## 執行方式

### CLI

```bash
# 1) 直接傳字串（最簡）
node convert-chinese/scripts/convert_chinese.mjs --text "简体中文"

# 2) 指定方向（簡→香港繁）
node convert-chinese/scripts/convert_chinese.mjs --text "网络视频" --from cn --to hk

# 3) 檔案輸入 + 寫檔輸出
node convert-chinese/scripts/convert_chinese.mjs --input ./article_cn.md --output ./article_tw.md --from cn --to twp

# 4) stdin 輸入（適合 pipe）
echo "简体中文" | node convert-chinese/scripts/convert_chinese.mjs --stdin

# 5) JSON 結構輸出（適合 agent 解析）
node convert-chinese/scripts/convert_chinese.mjs --text "简体中文" --json
```

### 旗標

| 旗標 | 必選 | 說明 |
|------|------|------|
| `--text "<text>"` | 三擇一 | 直接傳入文字 |
| `--input <path>` | 三擇一 | 由檔案讀入 |
| `--stdin` | 三擇一 | 由標準輸入讀入 |
| `--output <path>` | 選填 | 寫入指定檔案（否則輸出至 stdout） |
| `--from <locale>` | 選填 | 來源 locale，預設 `cn` |
| `--to <locale>` | 選填 | 目標 locale，預設 `twp` |
| `--json` | 選填 | 以 JSON 結構輸出（含 status 欄位） |
| `--help` / `-h` | — | 顯示用法 |

## 程式化呼叫

```javascript
import { convertChinese } from './convert-chinese/scripts/convertChinese.mjs'

// 簡→繁台灣（詞級，預設）
const tw = await convertChinese('简体中文，软件、网络、视频')
// → '簡體中文，軟體、網路、影片'

// 繁→簡
const cn = await convertChinese('繁體中文，軟體、網路', { from: 'tw', to: 'cn' })
// → '繁体中文，软体、网路'

// 簡→香港繁
const hk = await convertChinese('简体中文', { from: 'cn', to: 'hk' })
```

簽名：
```javascript
convertChinese(text: string, options?: { from?: string, to?: string }) → Promise<string>
```

## 輸出格式

### 預設（純文字）

直接將轉換後的字串輸出至 stdout 或寫入 `--output` 指定的檔案。適合 Unix pipe 流。

```
$ node convert_chinese.mjs --text "简体中文"
簡體中文
```

### `--json` 模式

```json
{
  "status": "success",
  "from": "cn",
  "to": "twp",
  "text": "簡體中文",
  "charCount": 4
}
```

錯誤時：
```json
{
  "status": "error",
  "from": "cn",
  "to": "twp",
  "message": "unknown to locale: xyz (allowed: cn, tw, twp, hk, jp, t)"
}
```

## status 約定

依全庫慣例（僅 `--json` 模式適用）：
- `status: "success"` — 轉換完成（輸出字串可能為空，若輸入為空）
- `status: "error"` — locale 不合法、套件未安裝、檔案讀寫失敗等

非 `--json` 模式下：成功時純文字輸出至 stdout，錯誤訊息輸出至 stderr 並 `exit 1`。

## 重試與超時

opencc-js 是純本地字典查表，不涉及網路 I/O，**不需要重試或超時機制**。

## 安全設計

- `--output` 寫檔路徑經 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名（`nul`、`con`、`prn`、`aux`、`com1-9`、`lpt1-9`）
- 字典快取：同一 `from→to` 組合在同一進程內只建立一次 Converter（opencc-js 字典載入有成本，重複轉換不重建）

## tw 與 twp 的差異（重要）

兩者都是「繁體中文（台灣）」，差別在（以下實證 opencc-js v1.3 的對照）：

| 原 | `tw`（字級） | `twp`（詞級） |
|---|------|-------|
| 软件 | 軟件 | **軟體** |
| 网络 | 網絡 | **網路** |
| 信息 | 信息 | **資訊** |
| 视频 | 視頻 | **影片** |
| 互联网 | 互聯網 | **網際網路** |
| 数据 | 數據 | **資料** |
| 服务器 | 服務器 | **伺服器** |
| 短信 | 短信 | **簡訊** |
| 鼠标 | 鼠標 | **滑鼠** |
| 打印机 | 打印機 | **印表機** |
| 光盘 | 光盤 | **光碟** |
| 激光 | 激光 | **雷射** |
| 出租车 | 出租車 | **計程車** |
| 视频博客 | 視頻博客 | **影片部落格** |

> 注意：opencc-js 的 twp 字典**不涵蓋全部兩岸用詞差異**。例如「计算机／电脑」、「软盘／磁碟」、「优盘／隨身碟」這幾組詞 twp 並不轉換（仍回計算機／軟盤／優盤）。如需更完整的兩岸詞彙映射，可在 opencc-js 結果之上再用 `OpenCC.CustomConverter` 補表。

**選擇原則**：
- 給台灣讀者看（部落格、新聞、文件） → `twp`（最自然）
- 保留原作者用語、只調整字形（學術翻譯、引文） → `tw`
- 不確定 → `twp`（預設）

## 邊界與已知限制

1. **不做語言偵測**：本技能不判斷輸入是繁是簡，由呼叫端指定 `from`。若 `from` 與實際輸入不符，opencc-js 仍會輸出（多半接近 no-op，少數字會誤轉）
2. **不做翻譯**：只做字形與詞彙映射，不做語意翻譯、不處理俚語
3. **同 locale 直接回原文**：若 `from === to`，函式直接 return 原字串，不經 OpenCC
4. **字典版本由 opencc-js 決定**：本技能不自訂字典；如需自訂映射，可改用 opencc-js 的 `CustomConverter` API
5. **僅處理中文字**：英數字、emoji、其他語言字元原樣保留
