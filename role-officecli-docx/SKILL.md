---
name: role-officecli-docx
description: 凡涉及 .docx 檔案之任務皆須使用本技能——不論該檔為輸入,輸出,或兩者皆是.包含:建立 Word 文件,報告,信函,備忘錄或提案;讀取,解析或擷取任何 .docx 之文字;編輯,修改或更新既有文件;處理模板,追蹤修訂,註解,頁首頁尾或目錄.凡使用者提及[Word 文件][文件][報告][信函][備忘錄],或指名任一 .docx 檔名時即觸發.
---

# OfficeCLI DOCX 技能

## 安裝

若 `officecli` 不存在:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

以 `officecli --version` 驗證(若 PATH 尚未生效請開新終端機).安裝失敗時可自 https://github.com/iOfficeAI/OfficeCLI/releases 下載執行檔.

## ⚠️ Help 優先鐵則

**本技能教的是[好的 docx 長什麼樣],不是每一個指令旗標.凡屬性名,列舉值或別名不確定時,一律先查 help,不可用猜的.**

```bash
officecli help docx                         # 列出所有 docx 元素
officecli help docx <element>               # 完整元素綱要(如 paragraph, field, numbering, watermark, toc)
officecli help docx <verb> <element>        # 依動詞篩選(如 add field, set section)
officecli help docx <element> --json        # 機器可讀綱要
```

help 內容與已安裝之 CLI 版本綁定.**本技能與 help 衝突時, 以 help 為準**.

## 心智模型

`.docx` 是一包 XML 部件的 ZIP(`document.xml`, `styles.xml`, `numbering.xml`, `header*.xml`, `footer*.xml`, `comments.xml` …).使用者看到的一切——標題, 表格, 頁碼, 目錄, 追蹤修訂——都是該 ZIP 內的 XML.`officecli` 於其上提供語意路徑 API(`/body/p[1]/r[2]`), 故幾乎不必碰原始 XML;非碰不可時才用 `raw-set`(見 XML 附錄).

## Shell 與執行紀律

docx 路徑含 `[]`, 部分屬性值含 `$`, 兩者皆為 shell 元字元.跳脫分三層發生, 須分清楚:

1. **Shell 層.** 元素路徑一律加引號:`"/body/p[1]"`, 不可寫 `/body/p[1]`(zsh/bash 會 glob `[N]`).任何含 `$` 之值用單引號:`--prop text='$50M'`——不論多長, 整個值包在同一對單引號內.未加引號之 `$50M` 會被吃成 `M`;在同一長字串內混用 `'…$var…'` 與 `"…$50…"` 正是 `$50` 無聲消失之處.
2. **CLI 層(`text=`).** 兩字元跳脫 `\n` 與 `\t` **會**於 `--prop text=` 內被解讀——`\n` 成為 `<w:br/>` 軟換行, `\t` 成為 `<w:tab/>`, docx / pptx / xlsx 行為一致.要字面的反斜線 n 須寫兩次(`\\n`, 極少需要).此規則同樣適用於列層級表格之 `c1…cN` 捷徑(`\n` → 儲存格內之 `<w:br/>`).
3. **JSON 層(batch).** 於 `batch` heredoc 之 JSON 字串內亦可直接傳真正換行 `"\n"`, 結果相同.

有疑慮時, 寫入後以 `view text` 逐字元比對.

**逐步執行.** `officecli` 每次呼叫都會變更檔案.指令一次跑一條並檢查各自 exit code——50 條指令之腳本若第 3 條失敗會無聲連鎖崩壞.任何結構性操作(新樣式, 表格, 目錄, 分節)後, 先 `get` 回來確認再往上疊.

**開檔/存檔生命週期:** 開頭 `officecli open <file>`, 結尾 `officecli save <file>` 落地——`save` 只寫檔並保留常駐以利後續編輯;僅在一次性交付要釋放常駐時才用 `officecli close <file>`.兩者皆永遠安全(不會報錯或遺失工作).同一樣式之大量段落請用 `batch`(整個陣列一次處理).**只在非 officecli 邊界才 flush:** officecli 自己的讀取一律看得到你的編輯;僅於非 officecli 程式要讀該檔前才執行 `save`/`close`(python-docx, Word, 渲染器, 交付).

**`$FILE` 慣例.** 所有指令使用 `"$FILE"`——設定一次即可(`FILE="your-doc.docx"`).切勿把字面的 `doc.docx` / `review.docx` 複製進輸出, 一律代換為實際目標檔.

## 產出品質要求

每份文件**必須**達到之交付標準——動手下指令前先知道這些.

**清楚的層級.** 每份非瑣碎文件都有 標題 → Heading 1 → Heading 2 → 內文, 而非一整片未套樣式之 `Normal` 段落.若 `view outline` 顯示為單一扁平清單, 就是層級缺失.

**明確指定標題字級**(Word 預設樣式字級會隨模板漂移):**H1 ≥ 18pt**(長篇報告用 20pt), H2 = 14pt 粗體, H3 = 12pt 粗體, 內文 = 11–12pt, 行距 1.15–1.5x.優先用 `style=Heading1` 而非行內字級, 使日後改版只需動樣式定義一次——但當模板樣式不可信時, 就明確設定字級.

**一種內文字型, 一種強調色.** 一種易讀內文字型(Calibri, Cambria, Georgia, Times New Roman);強調色用於標題重點或表頭, 不要做成彩虹.

**用屬性控制間距.** 段落用 `spaceBefore` / `spaceAfter`.成排空段落會破壞分頁, 且會被 `view issues` 標記.

**排版品質.** 新內容使用彎引號(`'` `'` `"` `"`)而非 ASCII 直引號——直接用 Unicode, 或在 `raw-set` 內用 XML 實體(`&#x2018;`/`&#x2019;`/`&#x201C;`/`&#x201D;`).範圍用連接號 `–`(`2024–2026`), 插語用破折號 `—`.

**超過 1 頁之文件一律要有頁首, 頁尾與頁碼.** 頁碼須走實際 `PAGE` 欄位(`--prop field=page`), 絕不可用字面文字[Page 1]——CLI 會自動注入 `<w:fldChar>`(見頁首頁尾章節).

**保留既有模板風格.** 編輯已有既定外觀之檔案時須配合它——既有慣例優先於本指引.

### 視覺交付底線(適用於每一份文件)

宣告完成前, 執行 `officecli view "$FILE" html` 並讀取回傳之 HTML 路徑, 確認以下全部成立:

- **不可有佔位符被當成資料渲染.** `$xxx$`, `{var}`, `{{name}}`, `<TODO>`, `lorem`, `xxxx` 絕不可出現於標題, 內文, 封面, 目錄, 圖說, 頁首或頁尾.要留給人填寫之字面 `{name}` 只能放在明顯的說明段落內([寄出前請替換 `{name}`]), 絕不可作為完稿內容.
- **不可有被截斷之標題或溢出之儲存格.** 應加寬欄位或設 `wrapText`, 而非裁掉內容.
- **文件有 3 個以上標題時須有目錄**(`--type toc`).
- **封面填滿率 ≥ 60%, 末頁 ≥ 40%.** 過於單薄之封面補上副標 / 作者 / 日期 / 範圍 / 重點摘要;[感謝頁]之末頁補上結論 / 後續步驟 / 聯絡方式 / 法律聲明.
- **文件文字內不可有 `\$`, `\t`, `\n` 字面殘留.** 若 `view text` 出現這些, 代表某層 shell 跳脫外洩——刪除該段落重新輸入.

任一項不過, **停下來修好再宣告完成**.

## 標準工作流程

六步驟.每次非瑣碎的建置都照這個形狀走.

1. **開檔.** `officecli open "$FILE"`(常駐為預設).新檔則先 `officecli create "$FILE"`.
2. **先摸清狀況.** 既有檔案:`officecli view "$FILE" outline`——標題樹, 節數, 是否已有目錄 / 浮水印 / 追蹤修訂.**絕不盲目編輯**.
3. **逐步建置.** 先結構, 再內容, 最後格式:樣式與編號定義 → 分節 / 版面設定 → 標題與內文 → 表格 / 圖片 / 欄位 / 目錄 → 頁首 / 頁尾 → 註解.每個結構性操作後先 `get` 回來確認再往上疊.
4. **依規格套格式.** 明確的標題字級, 間距, 寬度, 對齊, 定位點, 清單縮排——格式是交付物的一部分, 不是可有可無的美化.
5. **存檔, 然後信結構不信快取文字.** `officecli save "$FILE"` 寫出 XML.TOC / PAGE / NUMPAGES / SEQ / PAGEREF 欄位帶有**快取值**, 在人工重算(Word 內按 F9)前可能過時或空白.應確認欄位*存在*(`get --depth 3` 找得到 `<w:fldChar>`), 而非相信看到的文字.
6. **QA——預設一定有問題.** 完成的定義是[跑完一輪修正與驗證後找不到新問題], 而不是[最後一條指令 exit 0].見 QA 章節.

## 快速上手

最小可用 docx:一個標題, 一段內文, 一個次標題, 以及帶實際頁碼欄位之頁尾.請改寫套用, 不要照抄——你的檔案, 你的內容.

```bash
FILE="review.docx"
officecli create "$FILE"
officecli open "$FILE"
officecli add "$FILE" /body --type paragraph --prop text="Q4 2026 Review" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Revenue grew 18% year-over-year, ahead of plan." --prop size=11pt --prop spaceAfter=8pt
officecli add "$FILE" /body --type paragraph --prop text="Key Drivers" --prop style=Heading2 --prop size=14pt --prop bold=true --prop spaceBefore=12pt --prop spaceAfter=6pt
officecli add "$FILE" /body --type paragraph --prop text="Enterprise renewals, upsell, and a new EMEA region." --prop size=11pt
officecli add "$FILE" / --type footer --prop type=default --prop size=9pt --prop text="Page " --prop field=page
officecli set "$FILE" "/footer[1]/p[1]" --prop align=center
officecli save "$FILE"
officecli validate "$FILE"
```

已驗證:`validate` 回 `no errors found`;`get /footer[1] --depth 3` 顯示 5 個 run 之 PAGE 欄位鏈(begin / instrText / separate / 快取值 / end).

## 讀取與分析

先廣後窄.`outline` 告訴你現況有什麼;確定該看哪裡後再切入 `view text` / `get` / `query`.

```bash
officecli view "$FILE" outline            # 標題樹, 節數, 表格/圖片數, 浮水印, 是否有追蹤修訂——先從這裡摸清狀況
officecli view "$FILE" html               # 讀取回傳之HTML路徑: 一批編輯後之第一次視覺檢查(層級, 空段間距, 缺目錄)
officecli view "$FILE" text --start 1 --end 80   # 內容QA用之文字; 路徑以 [/body/p[N]] 標示, 可據以用 get 跳回
officecli view "$FILE" annotated          # 值 + 樣式/字型/字級 + 各 run 之警告
officecli view "$FILE" stats              # 段落數, 字型使用, 樣式分佈
officecli view "$FILE" issues             # 空段落, 缺替代文字, 間距異常
```

`officecli watch "$FILE"` 會啟動即時預覽供人類使用者自行開啟——代理自檢請用 `view html`.最終視覺驗證是使用者在 Word / WPS / Pages 內開啟該 `.docx`.

**檢視單一元素.** XPath 式語意路徑(1 起算).一律加引號——shell 會 glob `[N]`.最後一個元素用 `[last()]`(要括號);`[last]` 會報錯.加 `--json` 取得機器輸出.

```bash
officecli get "$FILE" /                          # 文件根: metadata, 版面設定
officecli get "$FILE" "/body/p[1]"                # 單一段落
officecli get "$FILE" "/body/p[1]/r[1]"           # 單一 run(字元層級格式)
officecli get "$FILE" "/body/tbl[1]" --depth 3    # 表格含列與儲存格
officecli get "$FILE" "/footer[1]" --depth 3      # 頁尾——檢查 fldChar
officecli get "$FILE" "/styles/Heading1"          # 樣式定義
officecli get "$FILE" /numbering --depth 2        # 編號 abstractNum + num 綁定
```

**跨文件查詢.** CSS 式選擇器, 用於系統性檢查而非手動逐一走訪.運算子:`=`, `!=`, `~=`(包含), `>=`, `<=`, `[attr]`(存在).完整參考:`officecli query --help`.

```bash
officecli query "$FILE" 'paragraph[style=Heading1]'       # 所有 H1
officecli query "$FILE" 'p:contains("quarterly")'         # 文字比對
officecli query "$FILE" 'p:empty'                         # 空段落(雜訊)
officecli query "$FILE" 'image:no-alt'                    # 無障礙缺口
officecli query "$FILE" 'paragraph[size>=24pt]'           # 數值比較
officecli query "$FILE" 'field[fieldType!=page]'          # PAGE 以外之欄位
```

`query --json` 將結果包在 `.data.results[]`——計數用 `jq '.data.results | length'`.

**大型文件.** 以 `view outline` 依標題導覽並用 `query` 跳點;不要把整個 body 倒進 context.

## 建立與編輯

動詞:`add`(新元素), `set`(改屬性), `remove`, `move`, `swap`, `batch`, `raw-set`(最後手段之 XML).九成的建置就是段落, run, 表格, 幾張圖, 一個目錄, 一個頁尾.

### 段落, run 與樣式

段落(`p`)是區塊;run(`r`)是段落內格式一致之文字片段.段落層級屬性(樣式, 對齊, 間距, 縮排)設在 `p` 上;字型 / 字級 / 顏色 / 粗體設在 `r` 上.

```bash
officecli add "$FILE" /body --type paragraph --prop text="Executive Summary" --prop style=Heading1 --prop size=18pt --prop bold=true --prop spaceAfter=12pt
officecli set "$FILE" "/body/p[1]/r[1]" --prop color=1F4E79
```

垂直間距用 `spaceBefore` / `spaceAfter`——**絕不用連續空段落**.左縮排用 `--prop indent=720`(twips), 首行縮排 `firstLineIndent=360`, 凸排 `hangingIndent=720`;開頭打空白會觸發 `view issues`.

### 表格

表格是 `/body/tbl[N]`, 列為 `tr[N]`, 儲存格為 `tc[N]`.先以列/欄數建立, 再填內容.

```bash
officecli add "$FILE" /body --type table --prop rows=4 --prop cols=3 --prop width=100%
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop header=true --prop c1=Quarter --prop c2="Revenue" --prop c3="Growth"
officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[1]/p[1]/r[1]" --prop bold=true
```

列層級 `set` 支援 `height`, `header` 與 `c1 / c2 / … / cN` 文字捷徑(`cN` 可推廣至任意欄數).儲存格格式(粗體, 填色, 顏色)要下在該儲存格的段落 / run 上——**不是**列層級.個別儲存格框線設在 `tc` 之 `border.*`(`--prop border.bottom="single;6;000000;0"`), 或內層段落之 `pbdr.*`.

**水平分隔線 = 段落下框線, 絕不用單列表格.** 表格當分隔線會渲染成一個有最小高度之空盒(在頁首頁尾最明顯).改用段落之 `pbdr.bottom`(`樣式;粗細;顏色`):

```bash
officecli set "$FILE" "/body/p[3]" --prop pbdr.bottom="single;6;2E75B6"
```

### 清單(項目符號, 編號, 多層)

單層項目符號/編號, 在段落設 `listStyle`(`listStyle` 是**段落**屬性, 不是 run 屬性——常見錯誤):

```bash
officecli add "$FILE" /body --type paragraph --prop text="First item" --prop listStyle=bullet
```

多層(法律式 1 / 1.1 / 1.1.1)須先加 `abstractNum`, 再加 `num`, 然後逐段引用 `numId`:

```bash
officecli add "$FILE" /numbering --type abstractnum --prop format=decimal     # → abstractNum id=0
officecli add "$FILE" /numbering --type num --prop abstractNumId=0             # → num id=1
officecli add "$FILE" /body --type paragraph --prop text="Section one" --prop numId=1 --prop ilvl=0
```

ID 為 0 起算:第一個 `abstractNum` 是 id=0;`num` 以 `abstractNumId=0` 引用它, 自身被指派為 id=1.引用不存在之 `abstractNumId` 會報錯, 故建立後要確認 id.以 `officecli query "$FILE" 'paragraph[numId>0]'` 驗證.層級與格式選項見 `help docx abstractnum` / `help docx num`.

### 定位點(簽名欄, 引導點列)

定位點是段落的一級子元素 `tab`;`pos` 接受 `6in`/`6cm`/twips, `val` ∈ `left`/`center`/`right`, `leader` ∈ `none`/`dot`/`hyphen`/`underscore`.見 `help docx tab`.

```bash
officecli add "$FILE" "/body/p[1]" --type tab --prop pos=6in --prop val=right --prop leader=dot
```

**引導點注意事項.** 單獨設 `leader=dot` 不會出現點——引導點只有在文字與定位點之間確實存在 `<w:tab/>` 字元時才渲染.用文字內的 `\t` 產生它:先定義定位點(`add tab --prop pos=6in --prop val=right --prop leader=dot`), 再 `--prop text="Chapter 1\t12"`——該 `\t` 成為 `<w:tab/>`, 點就會一路填到靠右對齊之頁碼.(字面 `text="Chapter 1 ......... 12"` 也能交付, 但真正的定位點對齊得更乾淨.)

### 欄位(PAGE / NUMPAGES / DATE / MERGEFIELD / REF)

欄位是渲染時才計算之動態值.`fieldType` 決定欄位種類;`name` 提供目標(合併欄位名或 `ref` 書籤);`format` / `instr` 加上開關.

| 欄位 | 用途 | 範例 |
|---|---|---|
| `page` | 目前頁碼 | 頁尾用 `--prop field=page`, 行內用 `--prop fieldType=page` |
| `numpages` | 總頁數 | `--prop field=numpages` / `--prop fieldType=numpages` |
| `date` | 今日 | `--prop fieldType=date --prop format='yyyy-MM-dd'` |
| `mergefield` | 模板合併標記 | `--prop fieldType=mergefield --prop name=CustomerName` |
| `ref` | 交叉參照至書籤 | `--prop fieldType=ref --prop name=bookmarkName` |

完整 `fieldType` 列舉(30+ 種, 含 `pageref`, `seq`, `styleref`, `docproperty`, `createdate` …)見 `help docx field`.**沒有 `fieldInstr` 這個 fieldType**——具名捷徑不足時, 用 `instruction` 屬性傳原始欄位指令文字.圖片開關(`MERGEFIELD Amount \# "#,##0.00"`, `DATE \@ "yyyy年MM月"`)走 `--prop instruction='…'`(mergefield 的 `format` 屬性會被忽略並發出警告——請用 `instruction`).

```bash
officecli add "$FILE" "/body/p[3]" --type field --prop fieldType=mergefield --prop name=customer_name
# 渲染為 «customer_name»——可見的佔位, 於 Word 郵件合併時被替換.
```

**MERGEFIELD 模板:絕不可渲染出佔位符字面.** 顯示為內文之 `{{customer_name}}` 或 `$NAME$` 是收件人看得到的失敗模板——請插入真正的 MERGEFIELD(如上), 或把字面標記侷限在明顯的說明段落內.以 `query 'field[fieldType=mergefield]'` 確認.

**SEQ / PAGEREF / TOC 欄位值.** officecli 在寫入時不會儲存渲染後之欄位值.依需求分別重算:

- **SEQ 編號**(`Figure 1/2/3`):`officecli set "$FILE" / --prop recalcFields=seq` 依 body 文件順序計數 SEQ 欄位並寫入快取值(`evaluated` 轉為 true;開關與格式見 `help docx document`).標題相對之 `\s` 與頁首頁尾內之 SEQ 仍須交由 Word.
- **PAGE / PAGEREF / NUMPAGES / TOC 頁碼**需要分頁計算, officecli 沒有該引擎——用 `officecli set "$FILE" /settings --prop updateFields=true` 交由 Word 於開啟時處理.

多圖文件兩者都要用.學術論文請見 `officecli-academic-paper` 技能.

### 頁首與頁尾(頁碼)

單指令模式——CLI 會注入 `<w:fldChar>`, 你不必手工組欄位:

```bash
# 空白首頁頁尾——自動啟用 differentFirstPage 使封面無頁碼
officecli add "$FILE" / --type footer --prop type=first --prop text=""
# 預設頁尾含實際頁碼
officecli add "$FILE" / --type footer --prop type=default --prop align=center --prop size=9pt --prop text="Page " --prop field=page
```

兩者皆存在時, 預設頁尾是 `/footer[2]`;只有一個時是 `/footer[1]`.**驗證**:`get --depth 3` 必須顯示 `fldChar` 子元素, 而非只有字面 `"Page"` 之 run(`view outline` 對實際欄位與靜態文字都印出 "Footer: Page"——不可依賴它).**不要**用 `set --prop differentFirstPage=true`——該屬性不支援(會以 exit 2 拒絕, 不是無聲失敗);加入 first 型頁尾即會翻轉該旗標.複合式 **Page X of Y** 見食譜 (b).

### 目錄

任何有 3 個以上標題之文件都要有目錄.先確認所要範圍確實有合格來源:目錄來源必須使用內建 Heading 樣式, 或帶 `outlineLvl` 之自訂段落樣式;粗體或大字級之 Normal 文字**不是**來源.若無合格來源, 停下來修正標題結構, 而不是插入一個會渲染成 "Error! No table of contents entries found." 的目錄.

```bash
# 內建 Heading 樣式即為目錄來源.
officecli add "$FILE" /body --type paragraph --prop text="Introduction" --prop style=Heading1
# 自訂段落樣式須有大綱層級(0 = Heading 1).
officecli add "$FILE" /styles --type style --prop id=ThesisH1 --prop type=paragraph --prop outlineLvl=0
# 來源存在後才加入目錄.
officecli add "$FILE" /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --index 0
```

頁碼需要分頁計算, OfficeCLI 無法自行算出目錄頁碼.設 `updateFields=true` 讓 Word 於開啟時重算目錄(與所有欄位).在沒有 Word 相容欄位引擎的情況下, 應如實回報[目錄為動態且尚未計算], 不可宣稱頁碼已就緒, 也不可猜一份靜態目錄.

```bash
officecli set "$FILE" /settings --prop updateFields=true
```

目錄可直接以 `/toc[1]` 或 `/tableofcontents` 進行 `get`/`set`/`remove`.

### 圖片

圖片放在 run 內.替代文字為無障礙之必要項——建立時直接帶 `alt`:

```bash
officecli add "$FILE" "/body/p[5]" --type picture --prop src=logo.png --prop width=1.5in --prop alt="Acme logo"
```

交付前確認 `officecli query "$FILE" 'image:no-alt'` 為空.

### 圖表

呈現數據要加**原生圖表**——可編輯, 可套主題, 具無障礙性, 於 Word 內可重新渲染——**絕不可用圖表截圖 PNG**.`data="Label:v1,v2,…"` 為每組系列;每個系列一個 `data=`(或 `series1=`/`series2=`).

```bash
officecli add "$FILE" /body --type chart --prop chartType=bar --prop title="Revenue by Region" --prop categories="EMEA,APAC,Americas" --prop data="2026:120,150,180"
```

`chartType` ∈ bar / column / line / pie / area / scatter(軸與圖例, 系列樣式見 `help docx chart`).以 `--type picture` 放 PNG 只在 officecli 無法建置之特殊圖表時作為退路.

### 超連結與書籤

外部連結走 `hyperlink`:

```bash
officecli add "$FILE" "/body/p[2]" --type hyperlink --prop url="https://example.com" --prop text="our site"
```

**內部連結**(連到書籤)用 `--prop anchor=bookmarkName`——**不是**在 `url` 內放 `#fragment`:

```bash
officecli add "$FILE" "/body/p[2]" --type hyperlink --prop anchor=chapter1 --prop text="See Chapter 1"
```

另一種做法是把 `PAGEREF` 欄位與可見文字搭配.見 `help docx hyperlink` / `help docx bookmark`.

### 分節與版面設定

文件根 `/` 承載版面設定(`pageWidth`, `pageHeight`, 邊界, 單位 twips).多節文件(橫向插頁, 分欄)須加 `section` 分節符——見 `help docx section`.駝峰式(`pageWidth`, 正式名)與小寫別名(`pagewidth`)皆可, 建議用駝峰式.

```bash
officecli set "$FILE" / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginLeft=1440
# 報紙式多欄流排(columnSpace 單位 twips; 720 = 0.5in):
officecli set "$FILE" / --prop columns=2 --prop columnSpace=720
```

### 強制分頁

每個邏輯分界只用**一種**分頁機制.預設做法是在目標標題設 `pageBreakBefore=true`.替代做法是在標題前插入一個明確的 `pagebreak`.**同一分界絕不可兩種併用**:產生的雙重分頁會造成空白頁.剛加完 `pagebreak` 後, 絕不可再對 `p[last()]` 設 `pageBreakBefore`.

```bash
# 預設: 直接把分頁套在標題上.
officecli add "$FILE" /body --type paragraph --prop text="Introduction" --prop style=Heading1 --prop pageBreakBefore=true
```

`--prop break=newPage` 是 `pageBreakBefore=true` 之別名.以 `view html` 預覽並檢查有無空白頁.

### 報告層級食譜

長篇報告每次都會用到的模式.每則皆已實測且通過 `validate`.

**(a) 豐富封面——達到 ≥ 60% 填滿底線.** 疊上機密標示, 主標, 副標, 客戶/專案/日期區塊, 以及重點主題列, 然後強制下一節換頁:

```bash
officecli add "$FILE" /body --type paragraph --prop text="CONFIDENTIAL — CLIENT USE ONLY" --prop align=center --prop size=9pt --prop color=C00000 --prop spaceAfter=24pt
officecli add "$FILE" /body --type paragraph --prop text="Strategic Growth Review" --prop style=Title --prop size=32pt --prop bold=true --prop align=center --prop font=Cambria --prop spaceAfter=8pt
officecli add "$FILE" /body --type paragraph --prop text="FY26 Outlook and Scenario Planning" --prop italic=true --prop size=16pt --prop align=center --prop spaceAfter=36pt
officecli add "$FILE" /body --type paragraph --prop text='Prepared for: Acme Corp. Leadership Team' --prop align=center --prop size=11pt
officecli add "$FILE" /body --type paragraph --prop text='Engagement: 2026-04 — 2026-06' --prop align=center --prop size=11pt --prop spaceAfter=36pt
officecli add "$FILE" /body --type paragraph --prop text="Key themes: 1) margin resilience, 2) EMEA expansion, 3) capital allocation." --prop align=center --prop italic=true --prop size=10pt
officecli add "$FILE" /body --type paragraph --prop text="Executive Summary" --prop style=Heading1 --prop pageBreakBefore=true
```

**(b) Page X of Y 頁尾——複合 PAGE + NUMPAGES.** 先加頁尾段落, 再以三個子操作組出實際的 `Page <X> of <Y>`.此為 `help docx footer` 官方食譜.

```bash
officecli add "$FILE" / --type footer --prop type=default --prop text="Page " --prop align=center --prop size=9pt
officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=page
officecli add "$FILE" "/footer[1]/p[1]" --type run --prop text=" of "
officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=numpages
officecli get "$FILE" "/footer[1]/p[1]" --depth 1 | grep -o fldChar | wc -l   # 應 ≥ 4; 用 grep -o … | wc -l, 不可用 grep -c(單行XML只會回1)
```

**(c) 表頭列填色配白色粗體字.** 順序很重要——**先**填入表頭儲存格文字(空儲存格沒有 run, 對空儲存格下 `set …/tc[N]/p[1]/r[1]` 會報 "No r found"), **再**設儲存格填色, **最後**設 run 格式:

```bash
officecli add "$FILE" /body --type table --prop rows=5 --prop cols=4 --prop width=100%
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop header=true --prop c1=Quarter --prop c2=Revenue --prop c3=Growth --prop c4=Status
for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[$col]" --prop fill=1F4E79
  officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[$col]/p[1]/r[1]" --prop bold=true --prop color=FFFFFF
done
for row in 3 5; do for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[$row]/tc[$col]" --prop fill=D9E2F3      # 斑馬紋
done; done
```

**(d) 財務表格——數字靠右, 合計列粗體, 合計上方加下框線.**

```bash
for row in 2 3 4 5; do for col in 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[$row]/tc[$col]/p[1]" --prop align=right
done; done
for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[5]/tc[$col]/p[1]/r[1]" --prop bold=true
  officecli set "$FILE" "/body/tbl[1]/tr[4]/tc[$col]/p[1]" --prop pbdr.bottom="single;6;000000;0"
done
```

**(e) 單一儲存格內多個項目符號(SWOT / 風險矩陣).** `c1="a\nb"` 產生的是**同一段落**內之 `<w:br/>` 換行——純多行文字可以, 但項目符號需要獨立段落.先用 `set c1=` 種下第一行, 之後每個項目用 `add paragraph`(帶 `listStyle=bullet`)加在該儲存格下:

```bash
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop c1="Installed base of 18k enterprise seats"
officecli add "$FILE" "/body/tbl[1]/tr[1]/tc[1]" --type paragraph --prop text="Margin structure above peer median" --prop listStyle=bullet
officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[1]/p[1]" --prop listStyle=bullet
```

若種下的那行跑到最下面, 重新排序:`officecli move "$FILE" "/body/tbl[1]/tr[1]/tc[1]/p[N]" --index 0`.

**(f) 沒有欄位引擎時之目錄.** 純 CLI 流程無法算出可靠頁碼.保留動態目錄, 設 `updateFields=true`, 並告知收件人在 Word 或其他相容欄位引擎內開啟.不要用猜測的靜態頁碼取代它.

### 模板交付——分離[模板說明]與終端使用者內容

HR / 法務 / 供應商模板帶有僅供內部之指引([替換 `{{CompanyName}}`]), **絕不可**隨交付出去.兩種可行模式:

- **文末[模板說明]章節**, 置於明確的 `Heading 1` 之下([給 HR 使用者之模板說明]), 所有指引放其下方;發佈前自該標題起往下 `remove`(以 `query 'paragraph[style=Heading1]:contains("Template Notes")'` 定位).
- **書籤界定之內部區段**, 夾在 `__template_notes_start` / `_end` 書籤之間;交付時以 `raw-set` 移除兩錨點之間的一切.

模板之交付關卡:移除後, `query 'p:contains("Template Notes")'` 與 `query 'p:contains("{{")'` **兩者皆須為空**.若有任何說明段落殘留, 下游員工就會讀到內部語言.

### 進階 / 特殊主題(若你在寫報告可略過)

報告, 備忘錄, 信函, 提案與 HR 模板用不到這節.只有當你的文件屬於學術類(方程式, 註腳, 參考書目), 審閱類(註解, 追蹤修訂), 或標記類(浮水印)才需繼續讀.

**方程式與註腳.** `--type equation` 接受 LaTeX——`\frac`, `\sum`, 希臘字母, `\mathit`, `\mathcal` 皆可渲染.預設建立獨立之 `/body/oMathPara[N]` 顯示區塊;若要嵌入行內文字, 對段落路徑加 `--prop mode=inline`(`add "/body/p[N]" --type equation --prop formula=… --prop mode=inline`).註腳依段落索引自動編號.參考書目凸排:每則 `firstLineIndent=-720 indent=720`.

```bash
officecli add "$FILE" /body --type equation --prop formula="\\frac{a}{b} + \\sum_{i=1}^{n} x_i"
officecli add "$FILE" "/body/p[3]" --type footnote --prop text="See Appendix A for methodology."
```

**註解與追蹤修訂.** 批次接受/拒絕:`set "$FILE" /revision --prop revision.action=accept`(或 `reject`);以 `/revision[@author=Alice]` 或 `/revision[@type=ins]` 之選擇器縮小範圍.個別修訂以 `query ins` 與 `query del` 定位(`trackedchange` 不是選擇器).在 run 上建立追蹤修訂:`--prop revision.type=ins|del --prop revision.author=…`(完整 `revision.*` 見 `help docx run`——還有 `format`/`moveFrom`/`moveTo`).新增註解:`add "/body/p[4]" --type comment --prop author=… --prop text=…`;以 `--prop parentId=N` 串成回覆串, 以 `set "/comments/comment[N]" --prop done=true` 標記已解決(**解決而非刪除**以保留稽核軌跡——之後可用 `query 'comment[done=false]'` 列出未結項).屬性綱要:`help docx comment` / `help docx run`.

**浮水印.** 一行指令:`add / --type watermark --prop text="DRAFT" --prop color=BFBFBF --prop opacity=0.8`(預設透明度 0.5);之後可用 `set /watermark --prop opacity=…` 調整.

**何時該換技能.** 章節草稿, ≤ 3 個註腳, ≤ 2 條方程式, 無參考書目/交叉參照——留在 docx 技能.需要引用格式(APA / Chicago / IEEE / GB 7714), 內文與參考文獻自動連結, 帶 `\ref` 之編號方程式, [圖目錄], 或自動更新之交叉參照——換 **`academic-paper`**.文件目的是**資料蒐集**(可填寫表單, 含使用者填寫欄位之合約, 問卷, 郵件合併模板;`<w:sdt>` 內容控制項, `<w:ffData>`, `documentProtection=forms`)——換 **`officecli-word-form`**.

### raw-set 逃生門(L1 / L2 / L3)

三個精細度層級;能用高層就別用低層.

- **L1 — 高階屬性**(`--prop text=…`, `--prop style=Heading1`):預設做法, 涵蓋 80%.
- **L2 — 點式屬性退路**(`pbdr.top=`, `ind.left=`, `shd.fill=`, `padding.top=`, `font.size=`):L1 缺該旋鈕時使用.例:`--prop pbdr.bottom="single;6;1F4E79;0"`.產出符合綱要之 XML.
- **L3 — `raw-set` 直接寫 XML**:最後手段, 無綱要保護.用於內部超連結, 複合欄位, 以及具名動詞表達不出的形狀(見 XML 附錄).

框線格式為 `樣式;粗細;顏色;間距`:`single;4;FF0000;1`.十六進位顏色**絕不加 `#`**:`FF0000`.配色方案名稱(`accent1..6`, `dark1`/`dark2`, `light1`/`light2`, `hyperlink`)於任何可用十六進位處皆可用——但要跨主題穩定的顏色請用十六進位.

## QA(必要)

**預設一定有問題——QA 是抓蟲, 不是確認儀式.** 你的第一版文件幾乎不可能正確;第一次檢查就零問題, 代表你看得不夠仔細.標題看起來沒事, 直到 `view outline` 顯示 H3 直接掛在 H1 底下;頁尾看起來顯示 "Page 1", 直到 `get --depth 3` 揭露那是靜態 run 而非欄位.

### 宣告完成前之最低循環

1. `officecli view "$FILE" issues`——空段落, 缺替代文字, 格式異常.
2. `officecli view "$FILE" outline`——標題層級(不可 H1 → H3 跳級), 目錄是否存在, 節數.
3. `officecli view "$FILE" text --max-lines 400`——錯字, 殘留的 `\$`/`\t`/`\n` 字面, 佔位符標記.
4. `officecli validate "$FILE"`——綱要檢查(交付關卡會對已關閉, 落地之檔案再跑一次).
5. **視覺檢查——整份文件當成一張聯絡表**(僅限具視覺能力之代理——若你無法解讀影像請跳過此步:步驟 1–4 就是你的上限, 且交付時須註明[未經視覺驗證]).`officecli view "$FILE" screenshot --grid auto -o /tmp/sheet.png`, 然後讀取它.`--grid auto` 把**每一頁**拼成一張圖(自動決定欄數;`--grid 4` 可強制)——你會*看見*分頁, 空白頁, 標題節奏, 左右失衡的邊界, 以及目錄/封面的落點, 而不只是 DOM.Windows+Word 環境會用真正的 Word 逐頁渲染, 其他環境用 HTML.截圖失敗時退回 `view html`, 並註明跨頁分頁 / 對齊 / 節奏[未經視覺驗證].縮圖只用來**定位**:任何細判(欄位對齊, 行距, 縮排, 深色疊深色, 圖說位置)須以 `screenshot --page N` 對該頁全解析度確認(不加 `--grid`;Windows 上為真正的 Word).[validate 通過]不等於可交付;[看起來像一份真實文件]才是.
6. 若任一項失敗, 修正後**重跑整個循環**——一個修正常會引發另一個問題.

### 交付關卡(交件前執行——任一項失敗即 REJECT, 不得交付)

複製貼上, 設好 `FILE`, 在每個關卡都印出 OK 之前不得宣告完成.

```bash
FILE="your-file.docx"

# 關卡 1 — 綱要.
officecli close "$FILE" 2>/dev/null
officecli validate "$FILE" | grep -q "no errors found" || { echo "REJECT Gate 1: validate failed"; exit 1; }
echo "Gate 1 OK"

# 關卡 2 — 標記外洩(shell 跳脫 / 模板標記 / 字面 \$ \t \n). grep -c 不會誤判為 PASS.
LEAK=$(officecli view "$FILE" text | grep -cE '(\$[A-Za-z_]+\$|\{\{[^}]+\}\}|<TODO>|xxxx|lorem|\\[\$tn])')
[ "$LEAK" -eq 0 ] && echo "Gate 2 OK" || { echo "REJECT Gate 2: $LEAK leak line(s)"; officecli view "$FILE" text | grep -nE '(\$[A-Za-z_]+\$|\{\{[^}]+\}\}|<TODO>|xxxx|lorem|\\[\$tn])'; exit 1; }
# 目錄佔位在 Word 相容欄位引擎更新前是正常的; 請改以結構確認目錄欄位與 updateFields 設定.

# 關卡 3 — 應有頁尾時, 實際 PAGE 欄位須存在.
FLD=$(officecli query "$FILE" 'field[fieldType=page]' --json | jq '.data.results | length')
[ "$FLD" -ge 1 ] && echo "Gate 3 OK" || { echo "REJECT Gate 3: no live PAGE field"; exit 1; }
echo "Delivery Gate PASS"
```

### 欄位 / 快取值抽查

欄位帶有快取值, 寫入時可能過時或空白——請以**結構而非文字**確認其存在.

- **頁尾 PAGE:** `get /footer[N] --depth 3` 會列出 begin / instrText / separate / 快取 / end 之 run 鏈——單一 PAGE ≥ 5 個 run, 複合 "Page X of Y" ≥ 11 個.只有一個文字為 `"Page"` 的 run = 欄位遺失;請以 `--prop field=page` 重新加入.
- **目錄:** `get /toc[1] --depth 2` 顯示欄位結構.頁碼在重算前可能讀作 `1 1 1 1` 或 `Update field to see…`(見目錄章節——設 `updateFields=true`).
- **MERGEFIELD:** `query 'field[fieldType=mergefield]'`——每個欄位一個, 且他處不可有字面 `{{name}}`.

### 誠實的限制

`validate` 抓的是綱要錯誤, 不是設計錯誤——一份文件可以在標題層級錯誤, 假 Heading 1 字級, 佔位符當內文, 或無封面卻有空白首頁頁尾的情況下通過它.聯絡表視覺檢查(`screenshot --grid`)與欄位結構檢查, 才是抓出驗證抓不到之問題的方法.

### QA 顯示注意事項(這些不用追)

- `view text` 對每個編號清單項目都顯示 `"1."`, 與渲染後的號碼無關——實際輸出會正確遞增.
- `view issues` 會對封面段落, 置中標題, 清單項目, 參考書目條目標記[內文段落缺首行縮排]——首行縮排只有 APA/學術內文才需要;在區塊式商務文件上這些屬預期現象.

## 已知問題與陷阱

當某處[看起來壞了], 先歸因再追查:**[AGENT-ERROR]** 文件真的錯了(要修) · **[RENDERER-BUG]** 文件是對的, 只是某檢視器渲染不同(不用追) · **[SKILL gap]** 技能沒教到這條規則(回報 issue).

### 檢視器怪癖(跨檢視器, [RENDERER-BUG]——不用追)

在斷定顏色/欄位/圖表壞掉之前, 先在使用者的目標檢視器內開啟;若在那裡正常就是檢視器怪癖.

- **PAGE 欄位可能顯示字面 "Page"**(無數字)直到重算——請以 `fldChar` 是否存在判斷, 而非看數字.
- **目錄快取頁碼可能讀作 "1 1 1 1"** 直到按 F9.
- **圓餅 / 環圈填色在某些檢視器可能塌成單一顏色**(直條/橫條正常).
- **表單控制項核取方塊可能渲染成雙框**;**OMML 方程式基線**可能跨檢視器位移(XML 完全相同).

### 常見陷阱

| 陷阱 | 正確做法 |
|---|---|
| `--index` vs `[N]` | `--index` 0 起算;`[N]` 路徑 1 起算 |
| 多次 `add --index N` 用同一個 N | 每次插入都會把後面內容往下推;重複用 N 會使後加的跑到先加的**前面**——請反序插入, 或用錨定 `paraId` 之 `move --after/--before` |
| zsh/bash 未加引號之 `[N]` | 每個路徑都加引號:`"/body/p[1]"` |
| 用 `[last]` 當謂詞 | 必須是 `[last()]`, 要括號 |
| 間距直接給 twips 原始值 | 用帶單位之值:`12pt`, `0.5cm`, `1.5x` |
| 用空段落做間距 | 用 `spaceBefore` / `spaceAfter` |
| 用列層級 `set` 設儲存格格式 | 列 `set` 只支援 `height`, `header`, `c1..cN` 文字;格式要下在儲存格的段落 / run |
| 把 `listStyle` 設在 run 上 | 那是**段落**屬性 |
| 用開頭空白做縮排 | 用 `indent=720` / `firstLineIndent=360` / `hangingIndent=720`(點式 `ind.left` / `ind.firstLine` 亦可) |
| 用 `set differentFirstPage=true` 抑制封面頁碼 | **不支援**——請加 first 型頁尾:`--type footer --prop type=first --prop text=""` |
| 需要新章節另起一頁 | 在標題用 `pageBreakBefore=true`;明確 `pagebreak` 僅為替代方案, **絕不併用** |
| 一個儲存格內要多個項目符號段落 | `c1="a\nb"` 只產生 `<w:br/>` 換行(同一段落);要獨立項目符號段落請用食譜 (e) |
| 點式屬性夠用卻去動 `raw-set` | 優先用 L2 點式屬性, 而非 L3 raw-set |
| 下一段繼承了前一段之 Heading 樣式 | 在後續段落明確設 `--prop style=Normal` |
| 修改正在 Word 內開啟之檔案 | 先在 Word 內關閉該檔 |
| echo 進 batch 時 `$`/`'` 爆掉 | 用單引號界定符之 heredoc:`cat <<'EOF' \| officecli batch …` |

## raw-set XML 附錄(L3 模式)

`raw-set` 注入字面 OOXML——無綱要保護.`<w:pPr>` 內之元素順序:`pStyle`, `numPr`, `spacing`, `ind`, `jc`, `rPr`(最後).彎引號用實體(`&#x2018;`/`&#x2019;`/`&#x201C;`/`&#x201D;`).任何前後帶空白之 `<w:t>` 要加 `xml:space="preserve"`.RSID 為 8 位十六進位.追蹤修訂/註解之作者除非使用者另行指定, 一律用 "Claude".

**追蹤修訂之插入 / 刪除**——優先用 run 上之高階 `--prop revision.type=ins|del`;raw-set 僅用於具名路徑表達不出的情況(如拒絕/還原他人之修訂, 見下).要替換整個 `<w:r>…</w:r>`, **絕不可**把標籤塞進 run 內部;把原本的 `<w:rPr>` 複製進兩者以保留格式.`<w:del>` 內須用 `<w:delText>`(指令則用 `<w:delInstrText>`):

```xml
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="Claude" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>30</w:delText></w:r></w:del>
<w:ins w:id="2" w:author="Claude" w:date="2026-01-01T00:00:00Z"><w:r><w:t>60</w:t></w:r></w:ins>
<w:r><w:t> days.</w:t></w:r>
```

刪除段落/清單項目之**全部**內容時, 也要把段落標記標為已刪除(`<w:pPr><w:rPr>` 內加 `<w:del/>`)——否則接受修訂後會留下一個空段落.要**拒絕他人之插入**, 把你的 `<w:del>` 巢狀於他們的 `<w:ins>` 內;要**還原他人之刪除**, 在其後加 `<w:ins>`(不要改動他們的).

**連到書籤之內部超連結**(優先用高階 `--prop anchor=`;raw-set 僅用於指令表達不出之自訂 run 樣式):

```xml
<w:hyperlink w:anchor="chapter1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>See Chapter 1</w:t></w:r></w:hyperlink>
```

**單一 run 內之複合欄位**(如單指令路徑組不出的雙欄位)——`fldChar begin / instrText / separate / value / end` 鏈:

```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>1</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

**註解標記**是 `<w:r>` 之同層兄弟, **絕不可**放在 run 內(回覆串與已解決狀態屬高階功能——`--prop parentId=`/`done=`, 見上方註解章節):

```xml
<w:commentRangeStart w:id="0"/><w:r><w:t>annotated text</w:t></w:r><w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
```

以 `officecli set "$FILE" /settings --prop updateFields=true` 強制開啟時重算欄位(寫入 `<w:updateFields w:val="true"/>`;涵蓋依賴版面之欄位 PAGE / PAGEREF / NUMPAGES / TOC 頁碼——不需 raw-set).SEQ 編號請優先用 `set / --prop recalcFields=seq`, 它會立即寫入正確快取值, 不必等 Word.

### Help 指引

拿不準時:`officecli help docx`, `officecli help docx <element>`, `officecli help docx <verb> <element>`, 代理用 `--json`.help 是權威綱要;本技能是決策指南.

---

## CLI 機制(引擎層, 三種格式共用)

自原通用 `officecli` 技能併入, 使本技能自足.以上皆為 docx 工藝, 本節則是 CLI 本身的行為.

### 常駐模式與 flush

**每個指令於首次存取時會自動啟動常駐**(閒置 60 秒逾時)——自動避免檔案鎖衝突.明確 `open`/`close` 可把閒置窗口延長至 12 分鐘:

```bash
officecli open "$FILE"      # 保留於記憶體
officecli set "$FILE" ...   # 無檔案 I/O 負擔
officecli close "$FILE"     # 存檔並釋放
```

以 `OFFICECLI_NO_AUTO_RESIDENT=1` 停用自動啟動.**只在非 officecli 邊界才 flush**——officecli 自己的讀取(`get`/`query`/`view`/`dump`)一律看得到你的編輯, 故只有在 python-docx, Word, 渲染器或交付要讀該檔前才需 `save`/`close`.閒置階段會於數秒內自動 flush;`OFFICECLI_RESIDENT_FLUSH=each` 可強制每次變更都 flush.

### 穩定 ID 定址

具穩定 ID 之元素會回傳 `@attr=value` 路徑而非位置索引.**多步驟流程優先用它**——位置索引會因插入/刪除而位移, 穩定 ID 不會.

```
/body/p[@paraId=1A2B3C4D]          # Word 段落
/comments/comment[@commentId=1]     # Word 註解
```

run, 表格列與儲存格沒有穩定 ID, 退回位置索引.

### view 模式——完整表

| 模式 | 說明 | 常用旗標 |
|------|-------------|-------------|
| `outline` | 文件結構 | |
| `stats` | 統計(頁數, 字數) | |
| `issues` | 格式/內容/結構問題 | `--type format\|content\|structure`, `--limit N` |
| `text` | 純文字擷取 | `--start N --end N`, `--max-lines N` |
| `annotated` | 文字加格式標註 | |
| `html` | 靜態 HTML 快照——與 `watch` 同一渲染器, 免起服務 | `--browser`, `--page N` |
| `screenshot` / `pdf` / `forms` | 無頭瀏覽器 PNG / 匯出外掛 PDF / 格式處理外掛之表單欄位 JSON | `-o`, `--screenshot-width/-height`, `--grid N` |

一次性快照(CI 產物, 封存, 差異比對)用 `view html`;需要即時刷新或瀏覽器點選時用 `watch`.

### watch 與互動選取

```bash
officecli watch "$FILE" [--port N]        # 即時預覽服務(預設埠 26315)
officecli unwatch "$FILE"
officecli goto "$FILE" <path>             # 讓監看中的瀏覽器捲動至該元素(p / table / tr / tc)
officecli get "$FILE" selected [--json]   # 讀取使用者點選了什麼
```

點擊選取, shift/cmd/ctrl+click 多選, 自空白處拖曳框選.`get selected` 回傳目前瀏覽器選取之 DocumentNodes(未選取則為空;無 watch 執行中則 exit != 0)——適合[把這些變粗體]這類請求:

```bash
PATHS=$(officecli get "$FILE" selected --json | jq -r '.data.Results[].path')
for p in $PATHS; do officecli set "$FILE" "$p" --prop bold=true; done
```

選取狀態可跨檔案編輯保留(路徑用穩定 `@id=` 形式);所有連線之瀏覽器共用同一份選取;每個檔案只能有一個 watch.**docx 之涵蓋範圍僅限頂層段落與表格**——巢狀元素(表格儲存格, run 層級)不可定址.

### Marks——等待審查之編輯提案

當變更需要人工審查**才能**落到檔案時用 `mark`;marks 只存在於 watch 行程內.一次性變更用 `set`;要永久註記用 `add --type comment`(Word 原生).

```bash
officecli mark "$FILE" <path> [--prop find=... color=... note=... tofix=... regex=true]
officecli unmark "$FILE" [--path <p> | --all]
officecli get-marks "$FILE" [--json]
```

`color` 接受十六進位 / `rgb(...)` / 22 種具名值.**路徑必須是 watch HTML 之 `data-path` 格式.**

### batch 原子性, dump, refresh

**預設為原子操作(v1.0.137+):** 每個項目都會執行並回報, 但只要*任一*項目失敗, 整批回滾——檔案保持位元組完全相同.`--best-effort` 可還原[成功的就套用]之舊行為(適用於有損之 `dump→batch` 重播).`--stop-on-error` 只改變停止的早晚, 不影響已完成的工作是否保留——要[第一次失敗就停但保留已成功者]請與 `--best-effort` 併用.`--force` 與此無關(僅為 docx 保護之繞過).回滾之批次其 JSON 會帶 `"atomicRolledBack": true`.

```bash
officecli dump "$FILE" [<path>]      # 可重播之 batch JSON; docx 為完整涵蓋
officecli refresh "$FILE"            # 重播後重算目錄頁碼 / PAGE / 交叉參照
officecli plugins list               # 擴充支援 .doc, .hwpx, .pdf 匯出
```

`dump` 路徑預設 `/`;可用 `/body`, `/body/p[N]`, `/body/tbl[N]`, `/theme`, `/settings`, `/numbering`, `/styles` 縮限範圍.`refresh` 在 Windows 使用 Word 後端, 其他平台退回無頭 HTML.

### 複製, 移動, 交換

```bash
officecli add "$FILE" /body --from "/body/tbl[1]"   # 連同所有跨部件關聯一起複製
officecli move "$FILE" <path> [--to <parent>] [--index N] [--after <path>] [--before <path>]
officecli swap "$FILE" <path1> <path2>
```

使用 `--after`/`--before` 時可省略 `--to`——容器由錨點推導.

### 文字錨定插入(`--after find:X` / `--before find:X`)

以段落內文字比對定位插入點.行內類型(run, picture, hyperlink)插在段落內;區塊類型(table, paragraph)會自動切分該段落.

```bash
officecli add "$FILE" "/body/p[1]" --type run --after find:weather --prop text=" (sunny)"
officecli add "$FILE" "/body/p[1]" --type table --after "find:First sentence." --prop rows=2 --prop cols=2
```

### docx 元素類型(完整清單)

paragraph(direction/font.latin/ea/cs, bold.cs/italic.cs/size.cs, lang.latin/ea/cs, wordWrap, framePr.\*, tabs 捷徑), run(lang 槽位, direction, underline.color, position 半點, **revision.type=ins|del|format|moveFrom|moveTo + revision.action=accept|reject** 搭配 .author/.date——`set /revision[...]` 可用裸 `@author=`/`@type=` 選擇器做篩選式接受/拒絕, 但 `query 'revision[...]'` 需用點式 `revision.author=`/`revision.type=`;move+revision 僅支援 run 層級路徑;**range=START:END** 以 0 起算半開區間偏移量格式化字元範圍), table(direction=rtl, hMerge, 列之 cantSplit / 儲存格之 nowrap, **虛擬欄操作** 於 `/body/tbl[N]/col` 之 add/remove/move/copyfrom), row(tr), cell(td), image, header/footer(direction), section(pageNumFmt 完整列舉, direction=rtl, rtlGutter, pgBorders=box), bookmark, comment, footnote, endnote, formfield, sdt, chart, equation, field(28 種), hyperlink, style(direction, 縮排, pbdr, lineSpacing), toc, watermark, break, ole, **num/abstractNum/lvl**, **tab**, **textbox/shape**(以 add 為主——Get 只回原始 XML 預覽;Set 僅限 width/height/geometry/fill/line.\*;位置是 `anchor.x`/`anchor.y` 而非裸 x/y;**僅 textbox** 支援 textDirection/rotation/gradient/shadow), 嵌入式 **OLE 於 dump→batch 可往返**, **diagram**(僅 add, mermaid → 原生圖形或渲染影像, add 時無 x/y——請以 `set /body/group[N]` 重新定位).另有:`docDefaults.rtl`, `autoHyphenation`, `get /` 會揭露地區設定與 `/comments` `/footnotes` `/endnotes`, `create --minimal` 用於原始 OOXML 骨架.

### 格式別名與 MCP

格式別名:`word`→`docx`, `excel`→`xlsx`, `ppt`/`powerpoint`→`pptx`.動詞:`add`, `set`, `get`, `query`, `remove`.MCP 透過單一 `command` 字串參數暴露相同綱要——`{"command":"help docx paragraph"}`, 原樣傳給 CLI(不是結構化物件).

### 索引基準

- 路徑為 **1 起算**(XPath 慣例):`/body/p[3]` = 第三段
- `--index` 為 **0 起算**(陣列慣例):`--index 0` = 第一個位置

### 更專門之技能

`officecli load_skill <name>` 會印出一份 SKILL.md——依其規則執行.挑最貼近者;每個產出物**只載入一個**技能, 絕不疊加;已載入之規則跨回合持續有效.

| 名稱 | 使用時機 |
|------|-------------|
| `role-officecli-docx`(別名 `word`) | 本技能——報告, 信函, 備忘錄, 提案, 一般文件 |
| `academic-paper` | 期刊 / 研討會 / 學位論文:APA / Chicago / IEEE / MLA 引用, 方程式, SEQ + PAGEREF 交叉參照, 多欄期刊版面, 參考書目 |
| `officecli-word-form` | 資料蒐集型文件:可填寫表單, 含使用者填寫欄位之合約, 問卷, 郵件合併模板 |

`.pptx` 或 `.xlsx` 產出物請改載入 `role-officecli-pptx` / `role-officecli-xlsx`——各自皆為自足.
