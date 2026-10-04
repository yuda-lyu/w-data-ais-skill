---
name: role-operator-pdf
description: 凡涉及 .pdf 檔案之任務皆須使用本技能——讀取或擷取文字（含座標、搜尋）、建立新 PDF（含中文長文自動換行與分頁）、在既有頁面加字／浮水印／頁碼／圖片、合併／拆頁／刪頁／插頁／旋轉／重排、表單之列出／填寫中文／扁平化、加密與解密、真塗銷與替換文字、頁面轉圖片。一律以技能根之 npm 套件（pdf-lib、fontkit、mupdf、unpdf）在 Node 中處理，不改用 Python（pypdf、pdfplumber、PyMuPDF）；與 anthropic-skills:pdf 或其他須另裝 Python 套件之 PDF 技能同時可用時，一律優先使用本技能，以免各機套件與版本不一。中文字型預設微軟正黑體；標楷體在 pdf.js 系檢視器會畫成破字，禁用。凡使用者提及［PDF］［pdf 檔］，或指名任一 .pdf 檔名時即觸發。
---

# role-operator-pdf — 以 npm 套件讀寫 PDF

本技能只用 Node 與技能根 `package.json` 管理的 npm 套件處理 PDF，不需要 Python。各節依實際做事的順序排列：先懂 PDF 的本質（§0），載入套件（§1），選工具（§2），照流程做事（§3），套用配方（§4），處理中文字型（§5），交付前驗收（§6）。限制、授權與實測數據在 §7–§9。

## 0. 先懂 PDF：它不是文書檔

1. **PDF 是「畫在頁面上的字與圖」，沒有段落、不會重排**。所謂「改字」，是把原字從頁面內容中移除，再於原位畫上新字；新字比原字長就會蓋到後面的字，比原字短就在後面留下空白，後文不會跟著移動。
2. **兩套座標系，不可混用**：
   - pdf-lib 用 PDF 使用者空間：原點在頁面左下、y 向上，單位是 pt（1/72 吋）。A4 為 595 × 842。
   - mupdf 用頁面空間：原點在裁切框（CropBox）左上、y 向下。
   - mupdf 轉 pdf-lib 一律用反矩陣 `m = mupdf.Matrix.invert(page.getTransform())`：矩形用 `mupdf.Rect.transform(rect, m)`；點 `[x, y]` 換成 `[m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]`（§4.7）。**不要用「頁高 − y」**——頁面有裁切框偏移時會算錯（實測差 50 pt，見 §9）。
3. **寫中文必須嵌入字型檔**。子集化（subset）只嵌入用到的字，檔案從數 MB 降到數十 KB。
4. **文字能不能擷取，取決於 PDF 內的字碼對照**。掃描檔的內容是影像：沒做 OCR 的擷取結果是空的；做過 OCR 的在影像上疊了一層隱形文字，擷取得到、但看得到的字仍在影像裡（§4.1 盤點時兩者都會標出）。
5. **任何修改都會讓既有的數位簽章失效**。輸入檔有簽章時，動手前先告知使用者。

## 1. 套件與載入

| 套件 | 用途 | 授權 |
|---|---|---|
| `@cantoo/pdf-lib` | 建立、加字加圖、頁面操作、表單、加密解密（pdf-lib 仍在維護的分支） | MIT |
| `fontkit` | 中文字型解析與子集化（上游 2.x 版） | MIT |
| `mupdf` | 讀取、帶座標擷取、搜尋、真塗銷、轉圖片（官方 MuPDF 的 WASM 版） | AGPL-3.0 |
| `unpdf` ＋ `@napi-rs/canvas` | 以 pdf.js 轉圖片，交付前檢查在 pdf.js 系檢視器的樣子 | MIT |

**套件裝在技能根**——本技能目錄的上一層（本技能目錄之絕對路徑由載入本技能時取得），由技能根的 `package.json` 統一管理版本。

- **不要在專案裡另裝這些套件**，也**不要改用 Python 套件或以 Python 為主的 PDF 技能**，即使本機有裝——各機版本無法統一，是本技能存在的理由。
- **找不到就回報使用者**到技能根執行 `npm i`，不要自己找地方安裝。
- 全部套件都不需要 install scripts，在會擋 postinstall 的 npm 設定下也裝得起來；`@napi-rs/canvas` 以平台專屬的選用相依取得預先編好的執行檔。

**載入範本**——所有配方都以這段開頭。腳本寫在 `./tmp/<案名>/` 下，以 `node` 執行：

```javascript
// 【載入】
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const skillsRoot = path.resolve('<本技能目錄之絕對路徑>', '..')   // 技能根: 本技能目錄的上一層
const req = createRequire(path.join(skillsRoot, 'package.json'))  // 一律以技能根為基準、用套件名稱解析
const { PDFDocument, rgb, degrees } = req('@cantoo/pdf-lib')
const fontkit = req('fontkit')
const mupdf = await import(pathToFileURL(req.resolve('mupdf')).href)   // 純 ESM 且有 top-level await, 只能 import()
```

兩個載入陷阱：

- **不要用絕對路徑 `require` 套件資料夾**（如 `require('<技能根>/node_modules/xxx')`）。只用 `exports` 指定進入點、沒有 `main` 的套件會找不到模組；以技能根的 `package.json` 建立 `createRequire` 再用套件名稱載入，才會套用 `exports`。
- **`mupdf` 不能 `require`**：它是純 ESM 並在載入時以 top-level await 初始化 WASM，只能用 `import()` 載入 `req.resolve('mupdf')` 解析出的檔案。

## 2. 工具分工

| 要做的事 | 用 | 配方 |
|---|---|---|
| 盤點：頁數、尺寸、旋轉、加密、表單欄位、是否為掃描檔 | pdf-lib ＋ mupdf | §4.1 |
| 讀全文、帶座標擷取、搜尋 | mupdf | §4.2 |
| 人眼看內容（版面、圖表、掃描檔） | Read 工具直接讀 PDF，每次至多 20 頁 | — |
| 建立新 PDF（含中文長文換行分頁） | pdf-lib ＋ fontkit | §4.3 |
| 在既有頁面加字、浮水印、頁碼、圖片 | pdf-lib ＋ fontkit | §4.4 |
| 合併、拆頁、刪頁、插頁、旋轉、重排 | pdf-lib | §4.5 |
| 表單：列出欄位、填中文、扁平化 | pdf-lib ＋ fontkit | §4.6 |
| 真塗銷、替換文字 | mupdf 塗銷 ＋ pdf-lib 寫回 | §4.7 |
| 加密、解密 | pdf-lib | §4.8 |
| 頁面轉圖片（目視檢查、縮圖） | mupdf；交付前另以 unpdf（pdf.js）畫一次 | §4.9、§6 |

## 3. 標準流程

1. **不覆寫輸入檔**。輸出寫到新檔；路徑由使用者指定，未指定時放 `./tmp/<案名>/` 並在回報寫明位置。
2. **盤點輸入**（§4.1）：加密就先取得密碼；有旋轉頁、表單、簽章、掃描頁都要先知道，因為各自影響後面的作法。
3. **做事**：依 §2 選配方，先在共用工具（§5）取得中文字型。
4. **驗收**（§6）：重讀文字、雙渲染器目視，全部通過才交付。
5. **回報**：輸出路徑、做了哪些修改、驗收結果、沒驗或做不到的項目。

## 4. 配方

每段都接在 §1 的【載入】之後；用到中文的配方另接 §5 的【字型工具】。`<輸入.pdf>`、`<輸出.pdf>` 換成實際路徑。

### 4.1 盤點

```javascript
// 【盤點】
async function inventory(file) {
    const bytes = fs.readFileSync(file)
    const probe = await PDFDocument.load(bytes, { ignoreEncryption: true })
    if (probe.isEncrypted) return { file, encrypted: true }      // 加密: 先向使用者取得密碼(§4.8)
    const doc = await PDFDocument.load(bytes)
    const md = mupdf.Document.openDocument(bytes, 'application/pdf')
    const pages = doc.getPages().map((p, i) => {
        const { width, height } = p.getSize()
        const mp = md.loadPage(i)
        const st = mp.toStructuredText('preserve-whitespace,preserve-images')
        const chars = st.asText().replace(/\s/g, '').length
        let maxImage = 0                                           // 最大一張圖片的面積
        st.walk({ onImageBlock: ([x0, y0, x1, y1]) => { maxImage = Math.max(maxImage, (x1 - x0) * (y1 - y0)) } })
        const [bx0, by0, bx1, by1] = mp.getBounds()
        return { page: i + 1, size: `${Math.round(width)}x${Math.round(height)}`, rotate: p.getRotation().angle, chars, imageCover: +(maxImage / ((bx1 - bx0) * (by1 - by0))).toFixed(2) }
    })
    const fields = doc.getForm().getFields().map((f) => `${f.getName()}(${f.constructor.name})`)
    return { file, encrypted: false, pageCount: doc.getPageCount(), pages, fields }
}
console.log(JSON.stringify(await inventory('<輸入.pdf>'), null, 1))
```

判讀：

- `chars` 為 0：沒有文字層的掃描頁，內容改用 Read 工具看。
- `imageCover` 接近 1 而 `chars` 大於 0：掃描後經 OCR 的頁。看得到的字在圖片裡，文字層是疊在上面的隱形字；§4.7 只換得掉隱形字、畫面不變，不適用。
- `rotate` 不為 0 的頁不適用 §4.7。
- `fields` 不為空才有表單可填；其中出現 `PDFSignature` 代表有簽章欄位，已簽署的檔案任何修改都會讓簽章失效（§0 第 5 點），動手前告知使用者。

### 4.2 讀文字：全文、帶座標、搜尋

```javascript
// 【讀文字】
const md = mupdf.Document.openDocument(fs.readFileSync('<輸入.pdf>'), 'application/pdf')
const n = md.countPages()
for (let i = 0; i < n; i++) {
    const st = md.loadPage(i).toStructuredText('preserve-whitespace')
    console.log(`--- 第 ${i + 1} 頁 ---\n${st.asText()}`)
    // 帶座標: blocks -> lines, 每行有 bbox {x, y, w, h}(mupdf 頁面空間, 原點左上) 與 text
    for (const b of JSON.parse(st.asJSON()).blocks) {
        for (const l of b.lines || []) console.log(`  [x=${l.bbox.x} y=${l.bbox.y}] ${l.text}`)
    }
}
// 搜尋: 回傳每個命中的四邊形陣列(mupdf 頁面空間); 區分大小寫, 第二個參數給 'ignore-case' 則不分
const hits = md.loadPage(0).search('<要找的字>')
console.log(`第 1 頁命中 ${hits.length} 處`)
```

- `search` 只適合粗估。它找不到跨行的中文，跨行命中的分組也不可靠；要逐一處理每一處（替換、塗銷）時，用 §4.7 的逐字比對。
- 表格沒有現成的擷取工具：用帶座標的結果依 x 分欄、依 y 分列自行組表，或直接用 Read 工具看。

### 4.3 建立新 PDF（中文長文換行分頁）

pdf-lib 的 `drawText` 不會自動分頁，`maxWidth` 也只在空白處斷行，中文整句不會換行。用下面的 `wrapLines`：中文逐字可斷，英數連續段整個不斷，遇 `\n` 強制換行。

```javascript
// 【建立】
function wrapLines(text, font, size, maxWidth) {
    const lines = []
    for (const para of text.split('\n')) {
        const tokens = para.match(/[A-Za-z0-9.,;:!?'"()\-_/@#%&+=]+|\s+|./gu) || ['']
        let line = ''
        for (const tk of tokens) {
            const cand = line + tk
            if (font.widthOfTextAtSize(cand, size) <= maxWidth || line === '') { line = cand; continue }
            lines.push(line.trimEnd())
            line = tk.trimStart()
        }
        lines.push(line.trimEnd())
    }
    return lines
}

const doc = await PDFDocument.create()
const font = await embedCjk(doc)                         // §5 字型工具, 預設微軟正黑體
const bold = await embedCjk(doc, 'msjhbd.ttc', 'MicrosoftJhengHeiBold')
const [W, H] = [595, 842], margin = 56, size = 12, lineHeight = 18
let page = doc.addPage([W, H]), y = H - margin
const ensureRoom = (need) => { if (y - need < margin) { page = doc.addPage([W, H]); y = H - margin } }

page.drawText('<標題>', { x: margin, y: y - 20, size: 20, font: bold })
y -= 44
for (const ln of wrapLines('<內文; 分段處寫 \n>', font, size, W - margin * 2)) {
    ensureRoom(lineHeight)
    page.drawText(ln, { x: margin, y: y - size, size, font })
    y -= lineHeight
}
fs.writeFileSync('<輸出.pdf>', await doc.save())
```

### 4.4 在既有頁面加字、浮水印、頁碼、圖片

```javascript
// 【加字加圖】
const doc = await PDFDocument.load(fs.readFileSync('<輸入.pdf>'))
const font = await embedCjk(doc)
const pages = doc.getPages()
pages.forEach((p, i) => {
    const { width, height } = p.getSize()
    // 斜向半透明浮水印
    p.drawText('<浮水印文字>', { x: width / 2 - 150, y: height / 2 - 60, size: 36, font, color: rgb(0.8, 0.1, 0.1), opacity: 0.18, rotate: degrees(35) })
    // 頁碼
    p.drawText(`第 ${i + 1} 頁 / 共 ${pages.length} 頁`, { x: width / 2 - 40, y: 24, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
})
// 圖片: PNG 用 embedPng, JPG 用 embedJpg; 圖片不透明, 會蓋住底下內容
const img = await doc.embedPng(fs.readFileSync('<圖片.png>'))
const w = 120
pages[0].drawImage(img, { x: 40, y: 40, width: w, height: img.height * (w / img.width) })
fs.writeFileSync('<輸出.pdf>', await doc.save())
```

在既有頁面加東西前，先用 §4.9 轉圖看空白處在哪；`drawImage` 的圖會整塊蓋住底下的字（實測）。

### 4.5 合併、拆頁、刪頁、插頁、旋轉、重排

```javascript
// 【頁面操作】
// 合併: 依序把各檔所有頁複製進新檔
const merged = await PDFDocument.create()
for (const f of ['<檔1.pdf>', '<檔2.pdf>']) {
    const src = await PDFDocument.load(fs.readFileSync(f))
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p)
}
fs.writeFileSync('<合併.pdf>', await merged.save())

// 拆頁或重排: 以 0 起算的索引, 依想要的順序複製到新檔
const src = await PDFDocument.load(fs.readFileSync('<輸入.pdf>'))
const picked = await PDFDocument.create()
for (const p of await picked.copyPages(src, [1, 0])) picked.addPage(p)
fs.writeFileSync('<拆出或重排.pdf>', await picked.save())

// 刪頁、插入空白頁、旋轉(就地修改)
const doc = await PDFDocument.load(fs.readFileSync('<輸入.pdf>'))
doc.insertPage(1, [595, 842])          // 插入空白頁要給尺寸; 不要寫 insertPage(i, doc.addPage(...)), 會多出一頁
doc.removePage(0)
doc.getPage(0).setRotation(degrees(90))
fs.writeFileSync('<輸出.pdf>', await doc.save())
```

### 4.6 表單：列出欄位、填中文、扁平化

```javascript
// 【表單】
const doc = await PDFDocument.load(fs.readFileSync('<表單.pdf>'))
const font = await embedCjk(doc)
const form = doc.getForm()
for (const f of form.getFields()) console.log(`${f.getName()} (${f.constructor.name})`)
const tf = form.getTextField('<欄位名稱>')
tf.setText('<中文內容>')
tf.updateAppearances(font)     // 不帶中文字型, 檢視器顯示的中文會變亂碼
form.flatten()                 // 選用: 欄位轉成一般內容, 之後不可再編輯
fs.writeFileSync('<輸出.pdf>', await doc.save())
```

勾選框用 `form.getCheckBox(name).check()`，下拉用 `form.getDropdown(name).select(value)`。沒有欄位的「表單」（只是畫了底線的文件）不能填，改用 §4.4 在指定座標加字。

### 4.7 真塗銷與替換文字

**用白色方塊蓋住不是塗銷**：底下的字仍然擷取得到。一律用 mupdf 的 `applyRedactions` 把字從頁面內容中移除；替換時再用 pdf-lib 依原字的基線、字級、字重、顏色，在原位寫上新字。

配方依 `replacement` 決定移除範圍：

| 用途 | `replacement` | 移除範圍 |
|---|---|---|
| 替換文字 | 新字 | 只移除文字；字底下的背景圖、底色、底線都保留 |
| 隱私塗銷 | 空字串 | 文字，加上壓在字上的圖片像素、完全落在塗銷區內的線條 |

**比對不用 mupdf 的 `search`**，改為逐字取出整頁文字後自行比對（實測見 §9）：

- `search` 找不到跨行的中文。中文換行處沒有空白，「原始／文字」分在兩行就漏掉，隱私塗銷會因此外洩。
- `search` 對跨行命中的分組不可靠：同一處會被拆成兩個命中，替換時新字會寫兩次。

```javascript
// 【替換文字】
const target = '<要替換的字>', replacement = '<新字>'   // replacement 給空字串 = 隱私塗銷(只移除, 不寫新字)
const pages = null                                      // null 為全部頁; 只處理特定頁時給 0 起算的索引, 例 [2] 為第 3 頁
const input = fs.readFileSync('<輸入.pdf>')
const rotations = (await PDFDocument.load(input)).getPages().map((p) => p.getRotation().angle)

// 比對規則: 區分大小寫; 目標中的空白可對到原文的空白或換行; 中日韓字之間容許換行或空白
const wide = (c) => c.codePointAt(0) >= 0x2e80        // 中日韓文字與全形符號
const tc = [...target.trim()]
let pattern = ''
tc.forEach((c, i) => {
    if (/\s/.test(c)) { if (!/\s/.test(tc[i - 1])) pattern += '\\s+'; return }
    pattern += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (tc[i + 1] && !/\s/.test(tc[i + 1]) && (wide(c) || wide(tc[i + 1]))) pattern += '\\s*'
})
const re = new RegExp(pattern, 'g')
const box = (seg) => {   // 一段字的外框(mupdf 頁面空間)
    const xs = seg.flatMap((ch) => ch.quad.filter((v, j) => j % 2 === 0)), ys = seg.flatMap((ch) => ch.quad.filter((v, j) => j % 2 === 1))
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const warns = new Map()  // 相同警告合併計數, 最後一起印
const warn = (msg) => warns.set(msg, (warns.get(msg) || 0) + 1)

// 1) mupdf: 逐頁取每個字 -> 比對 -> 每處依行切段, 每段一個塗銷區 -> 套用; 同時記下原字的基線、字級、字重、顏色
const md = new mupdf.PDFDocument(input)
const found = []
for (const i of pages || [...Array(md.countPages()).keys()]) {
    const page = md.loadPage(i)
    const chars = []
    let text = '', map = [], line = null                       // map[k]: text 第 k 個字對應 chars 的索引, 行與行之間補的 \n 為 -1
    page.toStructuredText('preserve-whitespace').walk({
        beginLine: (bbox, wmode, dir) => { line = { wmode, dir }; text += '\n'; map.push(-1) },
        onChar: (c, origin, font, size, quad, color) => { text += c; map.push(chars.length); chars.push({ c, origin, font, size, quad, color, line }) },
    })
    const occurrences = [...text.matchAll(re)]
    if (!occurrences.length) continue
    if (rotations[i] !== 0) throw new Error(`第 ${i + 1} 頁有旋轉, 本配方不適用, 停下回報使用者`)
    const m = mupdf.Matrix.invert(page.getTransform())       // mupdf 頁面空間 -> PDF 使用者空間
    for (const o of occurrences) {
        const segs = []                                        // 依行切段: 跨行的一處會有兩段
        for (const k of map.slice(o.index, o.index + o[0].length)) {
            if (k < 0 || !chars[k].c.trim()) continue
            const last = segs[segs.length - 1]
            if (last && last[0].line === chars[k].line) last.push(chars[k]); else segs.push([chars[k]])
        }
        const rects = segs.map(box)
        const first = segs[0][0]
        if (replacement && (first.line.wmode !== 0 || Math.abs(first.line.dir[1]) > 0.001 || first.line.dir[0] < 0)) throw new Error(`第 ${i + 1} 頁「${target}」是直書或斜排, 本配方不適用, 停下回報使用者`)
        if (replacement && segs.length > 1) warn(`第 ${i + 1} 頁「${target}」跨行, 新字只寫在第一段的位置`)
        for (const r of rects) page.createAnnotation('Redact').setRect(r)   // 每段各一個塗銷區; 不要併成一個大框, 跨行時會誤塗他字
        const [ox, oy] = first.origin                          // 第一個字的基線起點
        found.push({ pageIndex: i, x: m[0] * ox + m[2] * oy + m[4], y: m[1] * ox + m[3] * oy + m[5], width: rects[0][2] - rects[0][0], size: first.size, bold: first.font.isBold(), color: first.color })
    }
    if (replacement) page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE)   // 替換: 只移除文字
    else page.applyRedactions(false)                           // 隱私塗銷: 連同圖片像素與線條; 參數改 true 會加畫黑框
}
if (!found.length) throw new Error(`找不到「${target}」`)

// 2) pdf-lib: 依原字的基線、字級、字重、顏色寫新字; 不會重排, 新字較寬會蓋到後文、較窄會在後文前留空白, 先比寬度
const doc = await PDFDocument.load(md.saveToBuffer('').asUint8Array())
if (replacement) {
    const font = await embedCjk(doc)
    const bold = found.some((h) => h.bold) ? await embedCjk(doc, 'msjhbd.ttc', 'MicrosoftJhengHeiBold') : null
    for (const h of found) {
        const f = h.bold ? bold : font
        const w = f.widthOfTextAtSize(replacement, h.size)
        if (w > h.width * 1.05 || w < h.width * 0.95) warn(`第 ${h.pageIndex + 1} 頁: 新字寬 ${w.toFixed(1)}, 原字寬 ${h.width.toFixed(1)}, ${w > h.width ? '會蓋到後文' : '後文前會留空白'}`)
        doc.getPage(h.pageIndex).drawText(replacement, { x: h.x, y: h.y, size: h.size, font: f, color: rgb(...h.color) })
    }
}
fs.writeFileSync('<輸出.pdf>', await doc.save())
for (const [msg, n] of warns) console.warn(n > 1 ? `${msg}(共 ${n} 處)` : msg)
const perPage = {}
for (const h of found) perPage[h.pageIndex + 1] = (perPage[h.pageIndex + 1] || 0) + 1
console.log(`「${target}」${replacement ? `替換為「${replacement}」` : '已塗銷'}共 ${found.length} 處; 各頁處數 ${JSON.stringify(perPage)}`)
```

驗收必做（§6）：

- `leaked` 必須為空。
- `mustHave` 只放新字本身。新字是另外畫上的文字物件，擷取時排在該頁文字最後，連同前後文（如「Sum: 100」）會對不上（§7）。
- 新字的位置、字級、粗細、顏色用雙渲染器目視確認。
- 隱私塗銷另看塗銷處底下的圖片是否已清成白色。

### 4.8 加密與解密

```javascript
// 【加密解密】
// 加密(預設 AES-256)
const doc = await PDFDocument.load(fs.readFileSync('<輸入.pdf>'))
await doc.encrypt({ userPassword: '<開啟密碼>', ownerPassword: '<權限密碼>' })
fs.writeFileSync('<加密.pdf>', await doc.save())

// 判斷是否加密, 再以密碼開啟; 存檔即為解密後的檔案
const bytes = fs.readFileSync('<加密.pdf>')
const probe = await PDFDocument.load(bytes, { ignoreEncryption: true })
console.log('isEncrypted =', probe.isEncrypted)
const opened = await PDFDocument.load(bytes, { password: '<開啟密碼>' })   // 沒給密碼會丟 EncryptedPDFError
fs.writeFileSync('<解密.pdf>', await opened.save())
```

mupdf 讀加密檔：`openDocument` 後 `needsPassword()` 為 true，以 `authenticatePassword(密碼)` 通過（回傳非 0）後即可讀取。

### 4.9 頁面轉圖片

```javascript
// 【轉圖片】
const bytes = fs.readFileSync('<輸入.pdf>')
const pageIndex = 0, scale = 1.5
// mupdf: 主要用這個
const pix = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(pageIndex)
    .toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
fs.writeFileSync('<輸出-mupdf.png>', pix.asPNG())
// pdf.js(unpdf): 交付前看「Firefox、VS Code 預覽、網頁檢視器」會怎麼顯示; 頁碼從 1 起算
const { renderPageAsImage } = req('unpdf')
const png = await renderPageAsImage(new Uint8Array(bytes), pageIndex + 1, { canvasImport: async () => req('@napi-rs/canvas'), scale })
fs.writeFileSync('<輸出-pdfjs.png>', Buffer.from(png))
```

用 Read 工具看圖之前，先以 `file <圖檔>` 確認是 PNG（`PNG image data`）——內容不是合法圖片時讀進來會讓整個 session 壞掉。

## 5. 中文字型

**預設微軟正黑體**：`msjh.ttc` 取 `MicrosoftJhengHeiRegular`，粗體 `msjhbd.ttc` 取 `MicrosoftJhengHeiBold`。Windows 10／11 內建，字型授權允許嵌入，mupdf 與 pdf.js 都畫得正確（§9）。

```javascript
// 【字型工具】
// 找字型檔: 系統字型與「只裝給目前使用者」的個人字型兩處都找; 找不到就停下回報, 不默默換字型
function findFont(fileName) {
    const dirs = [path.join(process.env.WINDIR || 'C:/Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Windows/Fonts')]
    for (const d of dirs) {
        const p = path.join(d, fileName)
        if (fs.existsSync(p)) return p
    }
    throw new Error(`此機未安裝字型檔 ${fileName}(已找 ${dirs.join(' 與 ')})`)
}

// 嵌入中文字型: TTC 字型集必須指定 postscriptName; 會檢查字型授權是否允許嵌入
async function embedCjk(doc, fileName = 'msjh.ttc', postscriptName = 'MicrosoftJhengHeiRegular') {
    const bytes = fs.readFileSync(findFont(fileName))
    const ft = fontkit.create(bytes, postscriptName || undefined)
    const t = ft['OS/2'].fsType
    if (t.noEmbedding || t.bitmapOnly) throw new Error(`${ft.postscriptName} 的授權禁止嵌入 PDF`)
    doc.registerFontkit({ ...fontkit, create: (b) => fontkit.create(b, postscriptName || undefined) })
    return doc.embedFont(bytes, { subset: !t.noSubsetting })
}
```

| 規則 | 原因 |
|---|---|
| 一律用 `fontkit`，**不要用 `@pdf-lib/fontkit`** | 後者（pdf-lib 文件建議的那個，2020 年後停更）子集化中文字型必定失敗：`Cannot read properties of undefined (reading 'pos')` |
| **禁用標楷體 `kaiu.ttf`** | 它要靠字型內的 hinting 指令拼筆畫；pdf.js 不執行 hinting，Firefox 內建、VS Code 預覽與多數網頁檢視器會畫成破字（mupdf 正常） |
| 新細明體 `mingliu.ttc`（`PMingLiU`）可用 | mupdf 與 pdf.js 實測皆正常 |
| Windows 內附 `NotoSansTC-VF.ttf` 不建議 | 可變字型，預設取到 Thin（極細）字重 |
| TTC 字型集要指定 postscriptName | 不指定時 fontkit 回傳整個字型集，pdf-lib 無法嵌入 |
| 其他字型由使用者自行安裝 | 個人安裝的字型在 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`，`findFont` 兩處都會找 |

查某個 TTC 內有哪些 postscriptName：`fontkit.create(bytes).fonts.map((f) => f.postscriptName)`。

## 6. 交付關卡

全部通過才交付；任一項沒做，回報時寫明缺哪一項。

```javascript
// 【驗收】
async function verify(outFile, { pageCount, mustHave = [], mustNotHave = [], renderPages = [0] }, password) {
    const bytes = fs.readFileSync(outFile)
    const md = mupdf.Document.openDocument(bytes, 'application/pdf')
    if (md.needsPassword() && !md.authenticatePassword(password || '')) throw new Error('需要正確密碼才能驗收')
    const n = md.countPages()
    let all = ''
    for (let i = 0; i < n; i++) all += md.loadPage(i).toStructuredText('preserve-whitespace').asText()
    const flat = all.replace(/\s/g, '')
    const report = {
        pageCount: n, pageCountOk: pageCount === undefined || n === pageCount,
        missing: mustHave.filter((s) => !flat.includes(s.replace(/\s/g, ''))),
        leaked: mustNotHave.filter((s) => flat.includes(s.replace(/\s/g, ''))),
        images: [],
    }
    const dir = path.dirname(outFile), base = path.basename(outFile, '.pdf')
    const plain = password ? await (await PDFDocument.load(bytes, { password })).save() : bytes
    const { renderPageAsImage } = req('unpdf')
    for (const i of renderPages) {
        const a = path.join(dir, `${base}-p${i + 1}-mupdf.png`), b = path.join(dir, `${base}-p${i + 1}-pdfjs.png`)
        fs.writeFileSync(a, md.loadPage(i).toPixmap(mupdf.Matrix.scale(1.3, 1.3), mupdf.ColorSpace.DeviceRGB, false, true).asPNG())
        fs.writeFileSync(b, Buffer.from(await renderPageAsImage(new Uint8Array(plain), i + 1, { canvasImport: async () => req('@napi-rs/canvas'), scale: 1.3 })))
        report.images.push(a, b)
    }
    return report
}
console.log(JSON.stringify(await verify('<輸出.pdf>', { mustHave: ['<應出現的字>'], mustNotHave: ['<已塗銷的字>'] }), null, 1))
```

逐項確認：

1. `pageCountOk` 為 true、`missing` 與 `leaked` 皆為空陣列。塗銷類任務 `leaked` 必須為空——只看畫面沒有字不算數。替換類任務的 `mustHave` 只放新字本身（理由見 §4.7）。
2. `images` 的每張圖先 `file` 確認是 PNG，再用 Read 工具逐張看：字有沒有破碎、有沒有蓋到原有內容、位置對不對、中文有沒有變方框。mupdf 與 pdf.js 兩張都要看，只看一張會漏掉 pdf.js 系檢視器的問題。
3. 輸入檔未被覆寫（路徑不同，或比對修改前後的雜湊）。
4. 加密檔：給密碼能開、不給密碼打不開（§4.8 的 `isEncrypted` 與 `EncryptedPDFError`）。

## 7. 限制與陷阱

| 情形 | 處置 |
|---|---|
| 新字與原字寬度不同 | 不會重排：較寬會蓋到後文，較窄會在後文前留空白。§4.7 會警告；差太多就調字級、改寫用字，或回報使用者 |
| 原字不是微軟正黑體 | 新字一律以微軟正黑體寫入。原檔嵌入的字型通常只含用到的字，不能拿來寫新字，所以字形會和前後文不同；差異明顯時回報使用者 |
| 替換後的文字順序 | 新字是另外畫上的文字物件：畫面正確、單獨搜尋新字找得到，但 mupdf 與 pdf.js 擷取時都把它排在該頁最後，複製整段或連同前後文搜尋會對不上。後續還要擷取文字時回報使用者 |
| 一處跨行的替換 | 新字只寫在第一段的位置，下一行開頭留下空白（§4.7 會警告） |
| 頁面有旋轉、文字直書或斜排 | §4.7 在寫入前停下報錯；回報使用者 |
| 掃描頁（`chars` 為 0） | 沒有文字層：內容用 Read 工具看；要產生文字層須 OCR，不在本技能範圍（npm 有 `tesseract.js` 可評估） |
| 掃描後 OCR 的頁（`imageCover` 接近 1、`chars` 大於 0） | 看得到的字在圖片裡，§4.7 只換得掉疊在上面的隱形字、畫面不變：停下回報 |
| 表格擷取 | 沒有現成工具：依 §4.2 帶座標結果自行分欄分列，或直接看圖 |
| Office 檔或網頁轉成 PDF | 本技能的套件沒有排版引擎，不要用 §4.3 把文字重排成 PDF 充數（版面會全失）；回報使用者，由原程式匯出 PDF |
| 已有數位簽章的 PDF（§4.1 `fields` 出現 `PDFSignature`） | 任何修改都會讓簽章失效；動手前告知使用者 |
| 用方塊蓋字當作塗銷 | 底下文字仍可擷取：一律用 §4.7，並以 §6 的 `leaked` 驗證 |
| 貼圖蓋住內容 | 圖片不透明；先轉圖找空白處再決定座標 |
| 中文表單欄位顯示亂碼 | 填值後要 `updateAppearances(中文字型)` |
| 加密演算法 | 預設 AES-256；RC4 須另給 `allowWeakCryptography`，非必要不用 |

## 8. 授權

`@cantoo/pdf-lib`、`fontkit`、`unpdf`、`@napi-rs/canvas` 為 MIT。`mupdf` 為 AGPL-3.0（或向 Artifex 購買商用授權），與 Python 的 PyMuPDF 相同。只在本機當工具使用沒有額外義務；若要把含 mupdf 的程式散布出去，或做成對外提供的網路服務，須依 AGPL 公開原始碼——遇到這類用途先告知使用者。

## 9. 實測數據附錄

2026-10-04 於 Windows（Node 24）實測；套件版本 `@cantoo/pdf-lib` 2.11.1、`fontkit` 2.0.4、`mupdf` 1.28.1、`unpdf` 1.8.1、`@napi-rs/canvas` 1.0.10。

| 實測 | 結果 |
|---|---|
| 建立含中文 PDF（微軟正黑體子集） | 正文＋粗體標題 2 頁 35 KB；mupdf 與 unpdf 皆正確讀回中文 |
| 長文換行分頁（`wrapLines`） | 中文填滿行寬、英文單字不被切斷，自動跨到第 2 頁 |
| 替換文字：樣式 | 6 處（字壓在圖上、壓在底色上、粗體「甲方：」後緊接細體、紅字、第 2 頁兩處）新字的基線起點、字級、粗細、顏色皆與原字一致；粗體 20 pt 標題亦同。取整行字型的舊作法在「粗體後緊接細體」處會誤取粗體 |
| 替換文字：比對 | `search` 預設區分大小寫；「原始／文字」分在兩行時 `search` 找不到，逐字比對找得到；英文跨行命中的分組錯亂（第 1 頁 18 處回傳 35 個命中，只有第一處正確分組），`regexp` 模式亦同 |
| 替換與隱私塗銷的移除範圍 | 替換（不清圖片與線條）：背景圖、底色、底線完整保留。隱私塗銷（預設參數）：圖上被塗銷的區塊清成白色；沒有完全落在塗銷區內的底線保留 |
| 替換後的擷取順序 | mupdf 與 pdf.js（unpdf `extractText`）都把新字排在該頁文字最後 |
| 旋轉頁、斜排字 | 兩者都在寫入前報錯停下 |
| 英文多字替換 | 「should not be broken」跨 2 頁 29 處全數替換；新字較短時，句點前留下空白 |
| 掃描後 OCR 的頁 | 整頁圖片＋透明文字層：盤點得 `imageCover` 1、`chars` 6 |
| 簽章欄位 | 帶 `/FT /Sig` 欄位的檔案，盤點的 `fields` 列出 `Signature1(PDFSignature)` |
| 裁切框偏移下之座標換算 | `getTransform()` 為 `[1,0,0,-1,-50,760]`；反矩陣換算後 x=168 正確，「頁高 − y」法差 50 pt |
| 加密 | AES-256；mupdf `needsPassword()` 為 true、密碼驗證通過；pdf-lib 無密碼載入丟 `EncryptedPDFError` |
| 表單 | 填「申請人：王小明」並以中文字型產生外觀，扁平化後欄位數 0、文字仍可擷取 |
| 浮水印、頁碼、貼圖 | mupdf 與 pdf.js 畫面一致；不透明圖片會蓋住底下文字 |
| `insertPage(1, doc.addPage(...))` | 2 頁變 4 頁（多一頁）；`insertPage(1, [w, h])` 正確 |
| 系統字型渲染 | 微軟正黑體 Regular／Bold、新細明體：mupdf 與 pdf.js 皆正常；標楷體：mupdf 正常、pdf.js 破字 |
| 字型嵌入授權（fsType） | 微軟正黑體、新細明體、標楷體為 editable（可嵌入）；Noto Sans TC 無限制 |
| `@pdf-lib/fontkit` 1.1.1 子集化 | 標楷體與 Noto Sans TC 皆失敗（`reading 'pos'`）；不子集化可過但每檔 3–7.5 MB |
| 安裝 | 全部套件無 install scripts，在擋 postinstall 的 npm 設定下正常安裝 |
