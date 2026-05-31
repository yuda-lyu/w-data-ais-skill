---
name: zip-files-or-folder
description: 將使用者指定的單一檔案、多個檔案、或資料夾壓縮為 zip 檔，可指定輸出檔名、壓縮等級、密碼（單檔/多檔/資料夾各模式均支援）。底層引擎：無密碼單一輸入走 w-zip 的 zipFile/zipFolder，多輸入或任一密碼模式走 @zip.js/zip.js（zip20 預設，aes256 可選）。壓縮等級預設 1（最快速壓縮）。
---

# zip-files-or-folder — 壓縮檔案 / 多檔案 / 資料夾為 zip

## 概述

提供一致的 CLI / 程式化 API，將以下三種輸入壓縮為單一 zip，可加密碼：

1. **單一檔案** → 例：`document.pdf` → `archive.zip`
2. **單一資料夾** → 例：`./project/` → `archive.zip`（zip 內保留 `project/` 為頂層）
3. **多個檔案 / 混合輸入** → 例：`a.md` + `b.txt` + `./images/` → `archive.zip`（zip 根層級含 `a.md`、`b.txt`、`images/...`）

所有模式皆支援密碼加密（`zip20` 預設、`aes256` 可選）。

## 引擎選擇（自動）

| 條件 | 引擎 |
|------|------|
| 無密碼，1 個檔案 | `w-zip` 的 `mZip.zipFile`（底層即 `@zip.js/zip.js`） |
| 無密碼，1 個資料夾 | `w-zip` 的 `mZip.zipFolder` |
| 無密碼，2+ 個輸入（或混合） | `@zip.js/zip.js`（各檔案/資料夾於根層級） |
| **有密碼**（任一模式） | `@zip.js/zip.js`（zip20=ZipCrypto / aes256=encryptionStrength:3） |

> **為何多輸入與密碼模式直接走 @zip.js/zip.js**：w-zip 的 `mZip` 只提供 `zipFile`（單檔）與 `zipFolder`（單資料夾），無法直接接受多輸入（若先把多檔搬進暫存資料夾再 `zipFolder`，zip 內會多出該暫存資料夾名作頂層目錄）；其密碼支援也僅 hardcode ZipCrypto(zip20)、無法選 aes256。w-zip 1.0.23 起 `mZip` 底層已改用 `@zip.js/zip.js`，故本技能對「多輸入」與「任一密碼模式」直接呼叫同一套 `@zip.js/zip.js` 的 `ZipWriter`：多輸入把各檔案/資料夾放到 zip 根層級、密碼可在 zip20(ZipCrypto) 與 aes256(encryptionStrength:3) 間切換，且與 w-zip 單檔/資料夾路徑產生一致的 zip 結構。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`w-zip`、`@zip.js/zip.js`（`@zip.js/zip.js` 為 w-zip 的依賴、通常隨 w-zip 一併安裝；但本技能在「多檔／密碼模式」直接 import 它，故也明確列為依賴，避免 phantom dependency）

執行前驗證：
```bash
node -e "Promise.all([import('w-zip'), import('@zip.js/zip.js')]).then(()=>console.log('w-zip + @zip.js/zip.js OK')).catch(e=>{console.error(e.message);process.exit(1)})"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install w-zip @zip.js/zip.js
```

## 執行方式

### CLI

```bash
# 1) 單一檔案
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./doc.pdf --output ./out.zip

# 2) 單一資料夾
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./project --output ./project.zip

# 3) 多個檔案（--input 後接多個路徑）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./a.md ./b.txt --output ./out.zip

# 4) 多個 --input 旗標（等效於 3）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./a.md --input ./b.txt --output ./out.zip

# 5) 檔案 + 資料夾混合
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./README.md ./src ./docs --output ./bundle.zip

# 6) 帶密碼（單檔 / 多檔 / 資料夾皆可）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./secret.pdf --output ./secret.zip --password mypw
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./a.md ./b.md --output ./secret.zip --password mypw

# 7) 強加密（aes256）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./project --output ./secret.zip --password mypw --encryption aes256

# 8) 指定壓縮等級（預設 1 = 最快速；9 = 最高壓縮率）
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./logs --output ./logs.zip --level 9

# 9) JSON 輸出
node zip-files-or-folder/scripts/zip_files_or_folder.mjs --input ./a.md ./b.md --output ./out.zip --json
```

### 旗標

| 旗標 | 必選 | 預設 | 說明 |
|------|------|------|------|
| `--input <path> [<path>...]` | ✓ | — | 一或多個輸入路徑，每個 `--input` 後可接多個路徑；可重複使用 `--input`；順序保留至 zip |
| `--output <path>` | ✓ | — | 輸出 zip 路徑（父目錄不存在會自動建立） |
| `--password <pw>` | — | 無 | 密碼加密；單檔 / 多檔 / 資料夾各模式皆支援 |
| `--encryption zip20\|aes256` | — | `zip20` | 加密方法（須與 `--password` 同時指定，見下節；單獨給 `--encryption` 而無 `--password` 會報錯） |
| `--level <0-9>` | — | `1` | 壓縮等級（0=不壓縮 1=最快速 9=最高壓縮）|
| `--json` | — | 否 | 以 JSON 結構輸出（含 `status` 欄位） |
| `--help` / `-h` | — | — | 顯示用法 |

## 加密方法比較（`--encryption`）

| 方法 | 安全強度 | 相容性 |
|------|---------|--------|
| **`zip20`**（預設） | 弱（傳統 ZipCrypto，已知可破） | 廣（Windows Explorer、7-Zip、WinRAR、Linux unzip、macOS 內建解壓全部支援） |
| `aes256` | 強（AES-256） | 7-Zip、WinZip、近代 unzip 工具可解；**Windows Explorer 可瀏覽 zip 但無法解出個別檔案**；舊版 Linux unzip 6 不支援 |

**選擇原則**：
- 給一般使用者下載／email、需 Windows Explorer 雙擊解開 → `zip20`（預設）
- 內部傳輸、收件方確認用 7-Zip / WinZip → `aes256`
- 機敏資料 → `aes256` 並另外傳輸密碼

> 兩種方法都**不加密檔名與檔案 metadata**（大小、時間、權限）；如需檔名隱蔽，請考慮先打包成單檔再加密。

## 程式化呼叫

```javascript
import { zipFilesOrFolder } from './zip-files-or-folder/scripts/zipFilesOrFolder.mjs'

// 單一檔案 + 密碼（預設 zip20）
const r1 = await zipFilesOrFolder(['./doc.pdf'], './out.zip', { password: 'pw' })

// 單一資料夾 + AES-256 強加密
const r2 = await zipFilesOrFolder(['./project'], './project.zip', { password: 'pw', encryption: 'aes256' })

// 多檔案混合 + 密碼
const r3 = await zipFilesOrFolder(['./a.md', './b.txt', './images'], './bundle.zip', { password: 'pw' })

// 最高壓縮率
const r4 = await zipFilesOrFolder(['./logs'], './logs.zip', { level: 9 })
```

簽名：
```javascript
zipFilesOrFolder(
    inputs: string[],
    output: string,
    options?: {
        password?: string,
        encryption?: 'zip20' | 'aes256',    // 預設 'zip20'，有 password 時生效
        level?: number,                       // 0-9，預設 1（最快速）
    }
): Promise<{
    output: string,        // 絕對路徑
    mode: 'single-file' | 'single-folder' | 'multi',
    sizeBytes: number,
    entryCount: number,    // 壓縮包內「檔案數」（不含目錄項），各引擎路徑語意一致
}>
```

## 輸出格式

### 預設（純文字 stdout）

```
✓ 壓縮完成：D:\path\to\out.zip
  mode=multi  entries=3  size=12.4 KB
```

### `--json` 模式

```json
{
  "status": "success",
  "inputs": ["./a.md", "./b.txt"],
  "output": "D:\\path\\to\\out.zip",
  "mode": "multi",
  "sizeBytes": 12698,
  "entryCount": 2
}
```

錯誤時：
```json
{
  "status": "error",
  "message": "輸入路徑不存在: ./nonexistent",
  "inputs": ["./nonexistent"],
  "output": "./out.zip"
}
```

## entryCount 語意

`entryCount` 一律為「壓縮包內的檔案數」，**不含目錄項**。各引擎路徑（w-zip 單檔 / w-zip 單資料夾 / @zip.js/zip.js 多檔與密碼模式）對相同輸入回傳一致的數值——例如「3 檔 + 1 子目錄」的資料夾，無論加不加密碼，`entryCount` 皆為 `3`。

## status 約定

依全庫慣例（僅 `--json` 模式適用）：
- `status: "success"` — 壓縮完成
- `status: "error"` — 輸入不存在、輸出寫檔失敗、level 不合法、encryption 不合法、指定 encryption 但未提供 password 等

非 `--json` 模式下：成功訊息至 stdout，錯誤訊息至 stderr 並 `exit 1`。

## zip 內部結構

| 模式 | zip 內容 |
|------|---------|
| 單一檔案 | 檔案於根層級（檔名 = 原檔名） |
| 單一資料夾 | 該資料夾為根層級頂層目錄，內含完整子樹（例：`./project/` → zip 內為 `project/...`） |
| 多檔案 / 混合 | 各檔案 / 資料夾於根層級並列（檔案=原檔名，資料夾=原資料夾名 + 子樹） |

## 重試與超時

本技能為純本地 I/O 操作（檔案系統讀寫），**不涉及網路、不需要重試或超時機制**。

## 安全設計

- `--output` 寫檔路徑經 `_WIN_RESERVED_RE` 防護，禁止寫入 Windows 保留裝置名（`nul`、`con`、`prn`、`aux`、`com1-9`、`lpt1-9`）
- 所有輸入路徑於壓縮前驗證存在性與類型（檔案 / 資料夾 / 其他），失敗即報錯
- 輸出目錄若不存在會以 `recursive: true` 建立
- `@zip.js/zip.js` 於 Node 下以 `configure({ useWebWorkers: false })` 關閉 web worker，確保壓縮後 process 能正常結束、不殘留 worker（與 w-zip mZip 一致）

## 邊界與已知限制

1. **加密不含檔名／metadata**：兩種加密方法都不加密 zip entry 名稱、檔案大小、時間戳；如需檔名隱蔽，請先把多檔合併打包再加密
2. **aes256 與 Windows Explorer 不完全相容**：Windows Explorer 可瀏覽 aes256 zip 內容清單，但**不能解出**檔案；如需 Windows 雙擊解壓 → 用預設 `zip20` 或請對方裝 7-Zip
3. **不處理 symlink**：輸入路徑若為 symlink，壓縮行為由底層引擎決定，本技能未明確處理
4. **不解壓**：本技能僅做壓縮；解壓可呼叫 `w-zip` 的 `mZip.unzip(zipPath, dest, { pw? })` 自行處理（注意 w-zip 的 unzip 對 aes256 的支援需自行驗證）
5. **不支援 7z 格式**：w-zip 的 `m7z` 模組可做 7z 壓縮，但需另裝 7z 命令列；本技能僅做 zip
6. **檔名重複**：多檔案模式若兩個輸入有相同 basename（例：`./a/x.txt` 與 `./b/x.txt`），會**報錯並中止整個操作**（兩者無法並列於 zip 根層級；底層 `@zip.js` 不允許同名 entry）；請改用單一資料夾模式，或先將其中一個重新命名
