---
name: role-officecli-xlsx
description: 凡涉及 .xlsx 檔案之任務皆須使用本技能——不論該檔為輸入,輸出,或兩者皆是.包含:建立試算表,財務模型,儀表板或追蹤表;讀取,解析或擷取任何 .xlsx 之資料;編輯,修改或更新既有活頁簿;處理公式,圖表,樞紐分析表或模板;將 CSV/TSV 匯入 Excel 格式.凡使用者提及[試算表][活頁簿][Excel][財務模型][追蹤表][儀表板],或指名任一 .xlsx/.csv 檔名時即觸發.
---

# OfficeCLI XLSX 技能

## 安裝

若 `officecli` 不存在:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

以 `officecli --version` 驗證(若 PATH 尚未生效請開新終端機).安裝失敗時可自 https://github.com/iOfficeAI/OfficeCLI/releases 下載執行檔.

## ⚠️ Help 優先鐵則

**本技能教的是[好的 xlsx 長什麼樣], 不是每一個指令旗標.凡屬性名, 列舉值或別名不確定時, 一律先查 help, 不可用猜的.**

```bash
officecli help xlsx                         # 列出所有 xlsx 元素
officecli help xlsx <element>               # 完整元素綱要(如 pivottable, chart, cf)
officecli help xlsx <verb> <element>        # 依動詞篩選(如 add chart, set cell)
officecli help xlsx <element> --json        # 機器可讀綱要
```

help 反映已安裝之 CLI 版本.**本技能與 help 衝突時, 以 help 為準**.

## Shell 與執行紀律

**Shell 引號(zsh / bash).** Excel 路徑含 `[]`, 數值格式含 `$`, 兩者皆為 shell 元字元.規則:

- 元素路徑一律加引號:`"/Sheet1/row[1]"`, 不可寫 `/Sheet1/row[1]`.
- 任何含 `$` 之屬性值用**單引號**:`numFmt='$#,##0'`.
- 含跨工作表 `!` 參照之公式, 請用搭配 `<<'EOF'` heredoc 之 `batch`(見已知問題).
- 屬性值內之 `\n` 與 `\t` **會**被 CLI 解讀——`\n` 是儲存格內真正的換行(須搭配 `--prop wrapText=true`), `\t` 是定位, xlsx / docx / pptx 行為一致.要字面的反斜線 n 須寫兩次(`\\n`, 極少需要).(`$` 屬於上一層的 shell 層——用單引號.)

**逐步執行.** 指令一次跑一條並讀取各自的 exit code.`officecli` 每次呼叫都會變更檔案;50 條指令之腳本若第 3 條失敗會無聲連鎖崩壞.一條指令 → 檢查輸出 → 繼續.

## 產出品質要求

動手下指令前, 先知道好的 xlsx 長什麼樣.以下是每份活頁簿**必須**達到之交付標準.

### 所有 Excel 檔案

**零公式錯誤.** 每份交付的活頁簿**必須**有零個 `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.沒有例外——分母一律用 `IFERROR` 或 `IF(x=0,...)` 防護.

**要公式, 不要寫死的值.** 若某數字可由其他儲存格算出, 它就該是公式.在該寫 `=SUM(B2:B9)` 的地方寫死 `5000`, 就破壞了[輸入變動時活頁簿仍然活著]的契約.**這是本技能最重要的一條規則.**

**專業字型.** 整份活頁簿使用一致的專業字型(Arial / Calibri / Times New Roman).不要因為某張工作表來自 CSV 就混用四種字型.

**明確欄寬.** **沒有自動調整.** 使用者會讀到的每一欄都**必須**設 `width`——預設 8.43 字元會把一切截斷.合理起點:標籤 20-25, 數字 12-15, 日期 12, 短代碼 8-10.

**保留既有模板.** 編輯已有既定外觀之檔案時要配合它.既有慣例優先於本指引.

### 視覺交付底線(適用於每一份活頁簿)

宣告完成前, 執行 `officecli view "$FILE" html` 並讀取回傳之 HTML 路徑, 確認以下全部成立:

- **任何儲存格都不可出現 `###`.** `###` 代表該欄寬度容不下最寬的值.使用者會讀到的每一欄都要明確設 `width`.交付檔案裡的 `###` 是未完成的工作, **絕不是[小小的視覺瑕疵]**.
- **標題不可被截斷.** 工作表標題, 區段標頭, 長標籤都必須容得下.加寬該欄或對該儲存格套 `wrapText=true`.
- **不可有佔位符被當成資料渲染.** `$fy$24`, `{var}`, `<TODO>`, `xxxx` 絕不可出現於儲存格, 圖表標題, 系列名稱或圖例.那些是逃過替換的建置期標記.
- **圓餅 / 環圈的切片要有不同填色.** 若切片渲染成同色, 改用 `bar` / `column` 或明確設 `colors=...`.
- **不可有空白的尾頁 / 空的圖表錨點.** `anchor=D2:J18` 蓋在空的來源儲存格上, 看起來就是壞掉的圖表.

上述任一項不過, **停下來修好再宣告完成**.

**列印版面.** 使用者可能列印或當成董事會資料寄出的工作表都需要頁面設定.預設直向 + 不縮放會把寬表格與圖表從中間切斷.依工作表的形狀挑選縮放模式:

```bash
# 摘要 / 圖表 / 儀表板工作表(小, ≤ 約40列): 縮成單頁.
officecli set "$FILE" "/Summary" --prop orientation=landscape --prop fitToPage=true
# 長資料表(數十列以上): 只縮寬度, 高度讓它自然分頁.
# 此處若用 fitToPage=true 會把每一列擠進一頁 → 無法閱讀(### 日期, 5px 列高).
officecli set "$FILE" "/Data" --prop orientation=landscape --prop fitToPage=1x0
```

`fitToPage=true` == `1x1` == 兩軸都縮到一頁——只有在工作表本來就短時才正確.`1x0` = 寬度縮成 1 頁, 高度不限頁數.觸發條件:工作表含圖表, 或超過 8 欄, 或使用者提及列印 / 董事會 / 投資人.

### 僅限財務模型——若你在做模板, 追蹤表, CSV 匯入或營運用表, 請跳過本節

適用範圍:預算, 預測, 三表模型, 估值, 任何 `$` 密集的分析型活頁簿.客服追蹤表或到職模板不需要本節.

**顏色編碼——業界標準.** 五個核心顏色當成一種語言使用, 不是裝飾.審閱者應該光看顏色就知道某個儲存格**是什麼**——在讀公式之前.

| 顏色 | 角色 | 範例 |
|---|---|---|
| 藍字 `0000FF` | 寫死的輸入值, 情境變數 | `font.color=0000FF` |
| 黑字 `000000` | **所有**公式與計算 | 預設 |
| 綠字 `008000` | 本活頁簿內之跨工作表連結 | `font.color=008000` |
| 紅字 `FF0000` | 連到外部檔案 / 活頁簿 | `font.color=FF0000` |
| 黃底 `FFFF00` | 需要覆核的關鍵假設 | `fill=FFFF00` |

審閱者應該光看顏色就知道某個儲存格是什麼——在讀公式之前.這是溝通契約, 不是外觀偏好.

**數值格式——是標準, 不是偏好.**

- **年份**是文字不是數字.要顯示 `2026` 而非 `2,026`——用 `numFmt="@"` 或設 `type=string`.
- **貨幣**單位放在標頭(`Revenue ($mm)`), 不是每個儲存格.
- **零顯示為 `-`** 而非 `0`.用 `$#,##0;($#,##0);"-"`.
- **百分比**預設一位小數:`0.0%`.
- **負數用括號**:`(1,234)` 而非 `-1,234`.
- **估值倍數**用 `0.0x` 格式(EV/EBITDA, P/E 等).

**假設放在儲存格內, 不放在公式裡.** `=B5*(1+$B$6)` 正確;`=B5*1.05` 是 bug.每個藍色寫死輸入都要在鄰格或儲存格註解記錄來源:

```
Source: Company 10-K, FY2024, Page 45, Revenue Note
Source: Bloomberg, 2026-05-02, AAPL US Equity
Source: Management guidance, Q2 2026 earnings call
```

任何沒有來源的寫死數字, 就是未記錄的假設——審閱者無法稽核它.

## 標準工作流程

六步驟.每次非瑣碎的建置都照這個形狀走.

1. **開檔/存檔生命週期.** 開頭 `officecli open <file>`, 結尾 `officecli save <file>` 落地——`save` 只寫檔並保留常駐以利後續編輯;僅在一次性交付要釋放常駐時才用 `officecli close <file>`.兩者皆永遠安全(不會報錯或遺失工作).大量儲存格用 `batch`:**建議每批 ≤ 50 個操作;純值寫入之 payload 實測到每批 80+ 個操作零失敗.跨工作表公式批次是例外——那些請以非常駐, 單一 heredoc 執行(見已知問題)**.**只在非 officecli 邊界才 flush:** officecli 自己的讀取一律看得到你的編輯;僅於非 officecli 程式要讀該檔前才 `save`/`close`(openpyxl/pandas, Excel, 渲染器, 交付).
2. **建立或載入.** `officecli create "$FILE"`(新檔)或 `officecli view "$FILE" outline`(既有——先摸清全貌).
3. **逐步建置.** 一條指令, 讀輸出, 再繼續.任何結構性操作(新工作表, 圖表, 具名範圍, 樞紐)後, 對它跑 `get` 確認形狀再往上疊.
4. **套格式.** 欄寬, 數值格式, 凍結窗格, 索引標籤顏色, 標頭填色.格式不是可有可無的美化——依[產出品質要求]它是交付物的一部分.
5. **存檔, 然後正視快取問題.** `officecli save <file>` 寫入磁碟.新加入的公式不帶快取值;人類用試算表軟體開啟時, 軟體會重算並填入.**但你下游的 `INDEX/MATCH`, `SUMPRODUCT`, 或任何參照上游公式的公式, 會把上游在寫入當下所快取的值(往往是 `0` 或過時值)快取起來——而那個快取的謊言會一路存活到不會重算的讀取端.**凡多重公式建置且涉及陣列公式(`SUMPRODUCT`, 帶動態條件之 `SUMIFS`)或跨工作表鏈者, **請重新觸碰每一個下游儲存格**(用同一條公式再 `set` 一次), 使引擎依剛更新的上游快取重新計算.⚠️ 透過常駐對跨工作表鏈做重新觸碰並不可靠(見批次 / 常駐注意事項)——重新觸碰那一輪請優先用非常駐 `set`.之後 `officecli get` 幾個下游儲存格, 目視確認其 `cachedValue=` 合理.`validate` 在有常駐開啟時是安全的, 且它本身會把待寫編輯落地(與 docx / pptx 相同).
6. **QA——預設一定有問題.** 見 QA 章節.最後一條指令 exit 0 不代表完成;完成的定義是跑完一輪修正與驗證後找不到新問題.

## 快速上手

最小可用 xlsx:3 個月營收 + 一條合計公式 + 欄寬 + 貨幣格式.請改寫套用, 不要照抄——你的檔案, 你的資料.

```bash
officecli create "$FILE"
officecli open "$FILE"
officecli set "$FILE" /Sheet1/A1 --prop value=Month --prop bold=true
officecli set "$FILE" /Sheet1/B1 --prop value=Revenue --prop bold=true
officecli set "$FILE" /Sheet1/A2 --prop value=Jan
officecli set "$FILE" /Sheet1/A3 --prop value=Feb
officecli set "$FILE" /Sheet1/A4 --prop value=Mar
officecli set "$FILE" /Sheet1/B2 --prop value=42000 --prop numFmt='$#,##0'
officecli set "$FILE" /Sheet1/B3 --prop value=45000 --prop numFmt='$#,##0'
officecli set "$FILE" /Sheet1/B4 --prop value=48000 --prop numFmt='$#,##0'
officecli set "$FILE" /Sheet1/A5 --prop value=Total --prop bold=true
officecli set "$FILE" /Sheet1/B5 --prop formula="SUM(B2:B4)" --prop bold=true --prop numFmt='$#,##0'
officecli set "$FILE" "/Sheet1/col[A]" --prop width=12
officecli set "$FILE" "/Sheet1/col[B]" --prop width=15
officecli close "$FILE"
officecli validate "$FILE"
```

已驗證:`validate` 回 `no errors found`, `B5` 解析為 `135000`.每次建置的形狀都是:open → 設儲存格/公式 → 套格式 → close → validate.

## CSV / 大量匯入

**原生 `import` 指令(CSV/TSV 首選).** 最快路徑;一次呼叫把 CSV 載入工作表.`--header` 會設定自動篩選與第 1 列凍結窗格.欄寬與 `numFmt` 仍需後續處理(見儀表板技能之 D-12).

```bash
officecli import "$FILE" /Sheet1 --file data.csv --header
officecli import "$FILE" /Sheet1 --file data.tsv --format tsv --header
officecli import "$FILE" /Sheet1 --stdin --start-cell B2 < data.csv
```

**Python + batch 退路**——當你需要自訂型別轉換, 注入公式, 或該 CSV 存在於另一條資料管線內時使用.600-6000+ 儲存格之食譜:

```python
# gen_batch.py — 產生每批 80 個值寫入操作之 batch 區塊
import csv, json
ops = []
with open("data.csv") as f:
    reader = csv.reader(f)
    for r, row in enumerate(reader, start=1):
        for c, val in enumerate(row):
            col = chr(ord('A') + c)
            ops.append({"command":"set","path":f"/Data/{col}{r}",
                        "props":{"value": val}})
for i in range(0, len(ops), 80):
    print(json.dumps(ops[i:i+80]))
```

```bash
python gen_batch.py | while IFS= read -r chunk; do
  printf '%s\n' "$chunk" | officecli batch "$FILE"
done
```

結果:648 列零售 CSV(6490 儲存格)約 30 秒載入, 零失敗.調校:自每批 80 個操作起跳, 若有任何批次失敗就降到 40.數值型別推斷與公式之後再以針對性的 `set` 處理——本食譜中的 batch 是純值注入.

## 讀取與分析

先廣後窄.`outline` 先告訴你有哪些工作表, 資料在哪;確定該看哪裡後再切入 `view` / `get` / `query`.

**開啟渲染後的活頁簿, 親眼檢視自己的成果.**
- `officecli view $FILE html`——讀取回傳之 HTML 以稽核渲染輸出.每張工作表皆可定址, 圖表內嵌渲染.可抓出 `###`, 佔位符外洩, 樞紐版面, 列高截斷.
- `officecli watch $FILE` 會啟動即時預覽供人類使用者自行開啟.使用者想同步觀看時用它;代理自檢請用上面的 `view html`.

一批編輯後**第一次視覺檢查**請用 `view html`——並從源頭修正.最終視覺驗證是使用者在 Excel / WPS / Numbers 內開啟該 `.xlsx`.

**先摸清狀況.** 工作表, 維度, 公式數.

```bash
officecli view "$FILE" outline
```

**擷取.** 供內容 QA 或 LLM context 之純文字傾印;大檔案請以 `--start` / `--end` / `--cols` 縮限範圍.

```bash
officecli view "$FILE" text --start 1 --end 50 --cols A,B,C
```

其他值得知道的 `view` 模式:`annotated`(儲存格值 + 型別/公式 + 警告), `stats`(數值摘要), `issues`(壞掉的公式, 空工作表, 遺失參照).

**往返傾印.** `officecli dump "$FILE" [path]` 把活頁簿——或單一工作表(`/Sheet1`, `/sheet[N]`)——序列化為可重播之 batch JSON;`officecli batch new.xlsx --input dump.json` 重播它.可用於學習既有活頁簿之結構, 或複製/改編模板, 而不必去讀原始 OOXML.涵蓋範圍見 `dump --help`;子樹傾印不帶活頁簿層級資源(設定, 具名範圍)——重播目標必須已定義它們.

```bash
officecli dump "$FILE" -o blueprint.json            # 整份活頁簿
officecli dump "$FILE" /Sheet1 -o sheet.json        # 單一工作表
officecli batch new.xlsx --input blueprint.json
```

**檢視單一元素.** 使用 XPath 式路徑.一律加引號——shell 會 glob `[N]`.

```bash
officecli get "$FILE" "/Sheet1/A1"            # 單一儲存格
officecli get "$FILE" "/Sheet1/A1:D10"        # 範圍
officecli get "$FILE" "/Sheet1/chart[1]"      # 圖表
officecli get "$FILE" "/Sheet1/table[1]"      # ListObject
officecli get "$FILE" "/namedrange[1]"        # 活頁簿層級具名範圍
```

加 `--depth N` 展開子元素;加 `--json` 取得機器輸出.完整元素清單:`officecli help xlsx`.

**跨活頁簿查詢.** CSS 式選擇器.用於系統性檢查(公式覆蓋率, 錯誤儲存格, 空標頭)而非手動逐列走訪.

```bash
officecli query "$FILE" 'cell:has(formula)'       # 每個公式儲存格
officecli query "$FILE" 'cell:contains("#REF!")'  # 壞掉的參照
officecli query "$FILE" 'cell[type=Number]'       # 型別篩選
officecli query "$FILE" 'Sheet1!B[value!=0]'      # 限定工作表
```

運算子:`=`, `!=`, `~=`(包含), `>=`, `<=`, `[attr]`(存在).

**合併儲存格捷徑.** `officecli query $FILE merge` 或 `mergedrange`——兩者皆為 `mergeCell` 之別名.可回傳活頁簿內每一個合併範圍, 不必手動走訪 `<mergeCell>` 項目.

**當資料量大到逐列走訪已無意義時**, 改用 Excel 自身的分析型元素:

- 以 `officecli add`(`--type pivottable`)建**樞紐分析表**做分組/彙總, 不必寫 20 個 SUMIFS.再掛一個**交叉分析篩選器**(`--type slicer`)給讀者一個篩選介面.
- 在列中放**走勢圖**(`--type sparkline`)顯示逐列趨勢——比每列一張折線圖便宜, 且可內嵌列印.`type` 是嚴格列舉:**`line | column | stacked`**(另有別名 `winloss` / `win-loss` → `stacked`).無效的 `type=` 會直接失敗——不再無聲退回 `line`.
- 執行 `officecli help xlsx pivottable`, `officecli help xlsx slicer`, `officecli help xlsx sparkline` 查確切屬性名.

## 建立與編輯

九成的建置就是儲存格, 公式, 格式, 以及一兩張圖表.動詞:`add`(新元素), `set`(改屬性), `remove`, `move`, `swap`, `batch`.

### 儲存格與公式

一次呼叫同時設定值與格式.**公式開頭絕不可寫 `=`**——CLI 會把它剝掉.

```bash
officecli set "$FILE" /Sheet1/B5 --prop formula="SUM(B2:B4)" --prop numFmt='$#,##0'
officecli set "$FILE" /Sheet1/C5 --prop formula="B5/A5" --prop numFmt="0.0%"
```

結構性屬性(width, height, freeze, tabColor)位於 row / col / sheet 節點:

```bash
officecli set "$FILE" "/Sheet1/col[A]" --prop width=20
officecli set "$FILE" "/Sheet1/row[1]" --prop height=22
officecli set "$FILE" "/Sheet1" --prop freeze=A2 --prop tabColor=1F4E79
```

### 具名範圍

公式內優先用具名範圍而非 `$B$6`.它們自我說明(`GrowthRate` 勝過 `$B$6`), 而且讓你搬動假設儲存格而不破壞公式.因為 `ref` 值同時含 `!` 與 `$`, 請透過 batch heredoc 新增:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"GrowthRate","ref":"Sheet1!$B$6"}}
]
EOF
```

完整綱要見 `officecli help xlsx namedrange`.

**Batch JSON 不接受 shell 別名.** 在 batch `props` 內一律用完整點式名稱——`"font.color": "FF0000"`, `"font.size": 14`, 絕不可寫 `"color": "FF0000"`(有歧義:文字 vs 填色).對裸儲存格而言, 連 shell 形式都會被拒:`--prop color=1F4E79` 會報 `ambiguous in cell context — use 'font.color' (text) or 'fill' (bg)`.規則:任何 batch JSON 或儲存格屬性, 明確寫 `font.color` / `fill`.活頁簿層級元素之 `parent` 用 `"/"`, 工作表層級用 `"/SheetName"`;空字串**不**等效.

### 圖表

圖表類型見 `officecli help xlsx chart`——列舉很長(20+).依訊息挑對的那個:類別比較用 column, 時間序列用 line, pie 只在切片本身就明顯成比例時用, 相關性用 scatter.除非能回答特定問題, 否則避免冷門類型.

**餵圖表資料有三種方式.每張圖只能挑一種——新增時混用是常見陷阱.**

| 形式 | 形狀 | 使用時機 |
|---|---|---|
| (a) 行內 `data` | `--prop data="Sales:100,200,300" --prop categories="Jan,Feb,Mar"` | 極小的示範圖, 不會再編輯的數字.真相來源在圖表 XML 內, 不在儲存格. |
| (b) 二維 `dataRange` | `--prop dataRange="Sheet1!A1:B4"`(首欄 = 類別, 首列 = 標頭 / 系列名) | 一般情形.**必須是二維**——單欄會以 "Chart requires data" 失敗. |
| (c) 點式逐系列 | `--prop series1.name=Sales --prop series1.values="Sheet1!B2:B4" --prop series1.categories="Sheet1!A2:A4"` | 多系列圖表, 各系列指向不連續範圍, 或你要明確命名系列.只給 `series1.values`(無 `categories`)會產出以 `1,2,3` 為 x 軸的圖表. |

**單欄陷阱.** `dataRange="Sheet1!B2:B13"` 看起來像[值欄], 但引擎會以 `Chart requires data` 拒絕.要嘛把範圍加寬以納入類別欄(`A2:B13`), 要嘛改用形式 (c) 並明確給 `series1.categories`.

**建立後搬移 / 調整圖表大小:** `set chart[N] --prop anchor="F5:N25"`(亦可用 `--prop x= --prop y= --prop width= --prop height=`).**系列仍不可變更**——要新增/修改系列, 請 `officecli remove` 該圖表再以完整系列清單 `officecli add`.注意 `remove chart[1]` 會使 `chart[2] → chart[1]`, 而重新加入是**附加在最後**——要維持圖表順序, 請全部移除後依序重建.

**錨點尺寸.** 沒有自動調整.5-6 個類別 + 2 個系列的直條圖大約需要 `A5:L22`(12 欄 × 18 列)才能完整顯示標籤.更窄則 X 軸標籤被截;更寬則列印/匯出時圖表可能跨頁斷開.拿不準時先設窄, 以 `view html` 預覽(讀取回傳之 HTML 路徑), 再逐步加寬.頁面版面(見下)是解法的另一半.

**圖表 `dataRange` 一律加工作表前綴.** 即使圖表就在同一張工作表, 也要寫 `dataRange="Summary!A17:C22"` 而非 `A17:C22`.無工作表前綴的形式行為不一致;有前綴則 100% 可靠.

officecli 提供傳統 Excel 物件模型所缺的擴充圖表類型:`boxWhisker`, `waterfall`, `funnel`, `histogram`, `treemap`, `sunburst`, `pareto`.資料需要時就用.

**圖表標題 / 系列名 / 圖例 / 座標軸標題內絕不可有未替換之模板標記.** `$fy$24`, `{var}`, `<TODO>`, `$VAR`, `{{placeholder}}` 會在圖例內**原樣**渲染——validate 會通過, 但財務長看到的是 `$fy$24` 出現在該寫 "FY2024" 的地方.一律綁定到最終文字或儲存格參照(`title="FY2024 Revenue"` 或 `series1.name="Sheet1!A1"`).

### 條件式格式設定

三種常見類型, 各有其屬性形狀(請查 `officecli help xlsx cf`):

- **色階**:依值以漸層著色——`type=colorscale` 搭配 `minColor` / `midColor` / `maxColor`.
- **資料橫條**:儲存格內顯示量值之橫條——`type=databar`.為使整欄縮放一致請明確設 `min` / `max`;省略時預設值亦有效.
- **公式規則**(`formulacf` 元素):條件成立時highlight整列——`type=formula` 搭配 `formula="$C2>1000"` 與填色/字型.

規則:條件式格式要節制使用.每個儲存格都著色的活頁簿等於什麼都沒告訴讀者.

### 資料驗證

追蹤表與模板內的輸入儲存格**必須**帶資料驗證.成本低廉, 卻能擋掉整類下游 bug.**三種清單來源模式**——依允許值存放位置挑選.

**(a) 行內清單**——允許值很短且固定在規則本身內.

```bash
officecli add "$FILE" /Sheet1 --type validation \
  --prop sqref="C2:C100" --prop type=list \
  --prop formula1="Yes,No,Maybe" \
  --prop showError=true --prop errorTitle="Invalid" --prop error="Select from list"
```

**(b) 具名範圍(跨工作表查找首選)**——允許值在另一張工作表且可能增長.先定義具名範圍再參照它.因 `ref` 含 `!` 與 `$`, 請用 batch heredoc:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"StatusList","ref":"Lookups!$A$2:$A$4"}},
  {"command":"add","parent":"/Sheet1","type":"validation","props":{"sqref":"B2:B100","type":"list","formula1":"=StatusList"}}
]
EOF
```

**(c) 直接跨工作表範圍**——不用具名範圍, 在 `formula1` 內直接寫 `Lookups!$A$2:$A$4`.同樣需要 batch heredoc 以保全 `!` 與 `$`:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/Sheet1","type":"validation","props":{"sqref":"C2:C100","type":"list","formula1":"Lookups!$A$2:$A$4"}}
]
EOF
```

若你在 shell 上以 `--prop formula1=...` 寫跨工作表版本, `!` 會被 shell 弄成 `\!`, 下拉選單會無聲退化成沒有清單.以 `officecli get "$FILE" /Sheet1/validation[N]` 驗證——`formula1=` 必須顯示乾淨的 `!`, 不可有反斜線.

其他常見 `type` 值:`decimal`, `whole`, `date`, `textLength`, `custom`.運算子與完整屬性清單見 `officecli help xlsx validation`.

### 其他元素(單行說明)

- **表格**(ListObjects)——`add --type table` 加一個範圍;提供自動篩選 + 結構化參照.`officecli help xlsx table`.
- **註解**——`add --type comment`;用於記錄寫死的假設.`officecli help xlsx comment`.
- **工作表重新排序**——用 `officecli move`, **不是** `swap`.`swap` 只適用於 row/cell 路徑.

## 依角色定址圖表座標軸

就地編輯圖表座標軸比重建整張圖表便宜.以**角色**定址座標軸(`value` = Y, `category` = X), 不要用索引——XML 順序並不穩定.

```bash
officecli get "$FILE" "/Sheet1/chart[1]/axis[@role=value]"
officecli set "$FILE" "/Sheet1/chart[1]/axis[@role=value]" --prop min=0 --prop max=100000
officecli set "$FILE" "/Sheet1/chart[1]/axis[@role=category]" --prop title="Month"
```

安全屬性:`title`, `min`, `max`, `majorGridlines`, `visible`, `labelRotation`.

## QA(必要)

**預設一定有問題.你的工作就是找出它們.**

你的第一份活頁簿幾乎不可能正確.把 QA 當成抓蟲, 不是確認儀式.若第一次檢查就零問題, 代表你看得不夠仔細.公式看起來沒事——**直到**你拿其中兩條去對照來源儲存格.

### 宣告完成前之最低循環

1. `officecli view "$FILE" issues`——空工作表, 壞掉的公式, 遺失參照.
2. `officecli view "$FILE" annotated`(抽樣範圍)——值 + 型別 + 警告.
3. 每一種 Excel 錯誤類型都查一次:
   ```bash
   officecli query "$FILE" 'cell:contains("#REF!")'
   officecli query "$FILE" 'cell:contains("#DIV/0!")'
   officecli query "$FILE" 'cell:contains("#VALUE!")'
   officecli query "$FILE" 'cell:contains("#NAME?")'
   officecli query "$FILE" 'cell:contains("#N/A")'
   ```
4. `officecli validate "$FILE"`——有常駐開啟時亦安全;`validate` 本身會把待寫編輯落地.
5. **視覺檢查——透過 HTML 預覽走過每一張工作表.** 執行 `officecli view "$FILE" html` 並讀取回傳之 HTML 路徑.每張工作表連同內嵌圖表一起渲染.掃描 `###`, 被截斷的標題, 佔位符標記(`$fy$24`, `{var}`, `<TODO>`), 被切開的圖表, 全白切片的圓餅圖, 空的圖表錨點——**停下來修好再宣告完成**.[validate 通過]不是交付;[預覽看起來像一份真實的活頁簿]才是交付.要給人看時用 `officecli watch "$FILE"`(使用者自行開啟即時預覽), 或請他們直接在 Excel / WPS / Numbers 內開啟該 `.xlsx`.
6. **列印版面修正(寬表格 / 多圖表工作表).** 當某工作表含圖表或寬表格且使用者會列印它時, 逐表設定頁面版面——但縮放模式要配合該表的高度:
   ```bash
   # 短的摘要 / 圖表工作表 → 縮成一頁.
   officecli set "$FILE" "/Summary" --prop orientation=landscape --prop fitToPage=true
   # 長的資料表 → 只縮寬度(fitToPage=true 會把所有列擠成無法閱讀的一頁).
   officecli set "$FILE" "/Data" --prop orientation=landscape --prop fitToPage=1x0
   ```
   結果:圖表/寬表格列印時不會從中間切斷;長表格在自然分頁下仍可閱讀.凡含圖表或超過 8 欄表格的工作表都要套用.
7. 若有任何失敗, 修正後**重跑整個循環**.一個修正常會引發另一個問題.

`officecli view issues` + `view html` 是結構性 QA 的搭檔:`issues` 抓壞掉的公式與空工作表;`view html`(讀取回傳之 HTML 路徑)抓 `###`, 截斷與標記外洩.圖表填色 / 佈景色調在各檢視器可能不同——顏色保真度重要時請於使用者的目標檢視器抽查.

### 公式驗證檢查清單

- [ ] 隨機挑 2-3 條公式.對每一條跑 `officecli get`.確認公式字串符合你的意圖, **且** `cachedValue=` 符合你的預期——心算驗證.
- [ ] **每個彙總儲存格都要做快取值合理性檢查.** 任何做彙總的儲存格(COUNTA / COUNTIF / SUMPRODUCT / INDEX&MATCH)都必須有合理的 `cachedValue`.若一份空白模板的進度追蹤顯示 `199 / 199 / 100%`, 就是快取在說謊——用 `set` 重新觸碰該公式(強制重算)或手動設定正確的快取值.**絕不可交付[validate 通過但數字是虛構]的檔案.**
- [ ] **每個數值欄抽查一格.** 整欄 `%` 都顯示整數 `0.0%` 代表分母錯誤或分子快取過時——查一格, 修整個模式.
- [ ] 範圍要涵蓋每一列:資料到 `B13` 卻寫 `SUM(B2:B12)` 的差一錯誤是最常見的 bug.
- [ ] 跨工作表公式(`Sheet1!A1`)內不可有 `\!`.若 `officecli get` 顯示 `Sheet1\!A1`, 代表 `!` 被 shell 破壞了——刪掉並透過 batch/heredoc 重新輸入.
- [ ] 具名範圍(`officecli get "$FILE" "/namedrange[1]"`)指向的確實是其名稱所宣稱的.
- [ ] 每一個 `/` 分母都有防護——`IFERROR(x/y, 0)` 或 `IF(y=0, 0, x/y)`.
- [ ] 圖表資料 vs 來源儲存格:每張使用行內資料的圖表, 都要拿資料點對照來源儲存格的 `officecli get` 結果抽查.
- [ ] 圖表標題 / 系列名 / 圖例內**沒有**未替換的標記(`$...$`, `{var}`, `<TODO>`).用 `officecli get /Sheet1/chart[N]` 檢查該圖表.

### 模板 QA

編輯模板時, 檢查是否有殘留佔位符——它們看起來像內容, 且能躲過 `validate`:

```bash
officecli query "$FILE" 'cell:contains("{{")'
officecli query "$FILE" 'cell:contains("xxxx")'
officecli query "$FILE" 'cell:contains("TBD")'
```

### 換新眼睛

活頁簿做完後, 重新開啟它.把 `view text` / HTML 預覽從頭到尾讀一遍, 像個新的審閱者——找公式, 看起來不對的數字, 格式不一致, 遺漏的資料.

### 誠實的限制

`validate` 抓的是綱要錯誤, 不是設計錯誤.一份每個數字都錯的活頁簿也能通過 `validate`.上面的檢查清單——尤其是拿公式對照來源儲存格抽查——才是抓出驗證抓不到之問題的方法.

## 已知問題與陷阱

### 跨工作表 `!` 陷阱(精簡版)

Shell(bash 歷史展開, zsh 分詞)與 CLI 參數解析會把 `Sheet1!A1` 內的 `!` 弄成 `\!`.含 `\!` 的公式會無聲損壞——它會渲染成字面文字且不參照任何東西.

**修法.** 使用單引號界定符之 batch heredoc(`<<'EOF'`), 它會停用所有 shell 展開:

```bash
cat <<'EOF' | officecli batch "$FILE"
[{"command":"set","path":"/Summary/B2","props":{"formula":"Revenue!B13"}}]
EOF
```

**驗證.** 寫入後對該儲存格 `officecli get`;`formula=` 必須顯示乾淨的 `!`, 不可有反斜線.

### CLI 待處理問題(精簡版)

以下是需要繞道的 CLI 限制與缺口——不是輸出檔案的缺陷.

- **圖表系列建立後不可變更**——要新增/修改系列:`remove` + 以完整系列清單 `add`.(位置是可變的:`set chart[N] --prop anchor=` / `x/y/width/height`.)`remove chart[N]` 會使後續索引下移;重新加入是附加在最後.
- **跨工作表公式批次透過常駐執行沒問題**——先前[即使 3-5 個操作也會死鎖]的警告已無法重現.純值寫入批次在 50-80+ 個操作下同樣可靠.若真的遇到卡住, 退回非常駐的單一大批次或逐條 `set`.**同一檔案/機器上有多個常駐行程仍可能互相競爭**——若另一個代理/工作階段持有同一檔案之常駐, 要預期非決定性的卡住.
- **條件式格式命名不對稱**——`--type` 用的元素名是 `conditionalformatting`;路徑後綴是 `/cf[N]`.查綱要用 `officecli help xlsx conditionalformatting`, 走路徑用 `/cf[N]`.
- **新增工作表時之 `position` 屬性**——help 說 Add 會處理 `position`, 但該屬性常被忽略.請於建立工作表後以 `officecli move --index` / `--after` / `--before` 重新排序.
- **`remove /sheet[N]` 之級聯防護**——當該工作表被其他工作表之驗證 / 條件式格式 / 走勢圖 / 超連結 / 具名範圍參照時, 會拒絕移除或重新命名.請先移除那些相依元素, 再移除該工作表.
- **Batch JSON 拒絕儲存格之 `color` 別名**——在 batch `props` 內 `"color": "FF0000"` 會報 `ambiguous in cell context — use 'font.color' (text) or 'fill' (bg)`.CLI 在 shell 層對非儲存格元素接受 `--prop color=...` / `--prop size=14` 這類別名, 但在 batch JSON 內對儲存格一律要寫完整點式名稱:`"font.color"`, `"font.size"`, `"font.name"`.

### 渲染器注意事項(跨檢視器之顏色保真度)

`officecli view html` 是結構性 QA(溢出, 截斷, 佔位符外洩, 版面)的正確工具——請讀取回傳之 HTML 路徑.部分圖表渲染細節會因終端使用者開啟檔案所用的檢視器而異.已觀察到的差異:

- **圓餅 / 環圈填色在某些檢視器可能塌成單一佈景色調**(切片看起來[全白]或[全同色]).該檔案在使用者的目標檢視器內可能是正常的.
- **折線圖 / 直條圖之系列顏色在某些檢視器可能偏離**活頁簿佈景主題.
- **表單控制項核取方塊在某些檢視器可能渲染成雙框.**

在斷定某個顏色或圖表[壞掉]之前, 先在使用者實際的目標檢視器內開啟.若在那裡是正確的, 問題就是檢視器渲染而非資料——不要追它.CLI 的結構性檢查(`###`, 截斷, 佔位符文字, 版面)仍為權威.

### 跳脫層級(shell 引號在前面已述, 這裡是額外的)

`$` 屬於 shell 層(用單引號, 見前).屬性值內之 `\n` / `\t` **會**被 CLI 解讀成真正的換行 / 定位.另外還有兩層:

- **JSON 層(batch).** 標準 JSON 跳脫——`"\n"`, `"\t"`, `"\""`.最終字串內要有一個真正的反斜線則寫 `"\\\\"`.
- **Excel 層.** 儲存格內之 `\n` 是真正的換行——請搭配 `--prop wrapText=true` 讓 Excel 顯示換行.在 shell 加引號的屬性內可直接使用(`--prop value='a\nb'`);batch JSON 內之 `"\n"` 效果相同.拿不準時, 對該儲存格 `officecli get` 並逐字元比對.

### 其他常見陷阱

| 陷阱 | 修法 |
|---|---|
| `--name "foo"` | 所有屬性都走 `--prop`:`--prop name="foo"` |
| 猜屬性名 | `officecli help xlsx <element>`——不要即興發揮 |
| 對儲存格用 `--prop color=...` | 有歧義——用 `font.color`(文字)或 `fill`(背景).batch JSON 內同樣適用:一律用完整點式名稱, 絕不用 shell 別名 |
| `#FF0000` 十六進位顏色 | 去掉 `#`:`FF0000` |
| `--index` vs `[N]` | `--index` 0 起算(陣列);`[N]` 路徑 1 起算(XPath) |
| zsh/bash 未加引號之 `[N]` | 每個路徑都加引號:`"/Sheet1/row[1]"` |
| 工作表名稱含空白 | 整個路徑加引號:`"/My Sheet/A1"` |
| 年份顯示為 `2,026` | `--prop type=string` 或 `numFmt="@"` |
| 修改正在 Excel 內開啟之檔案 | 先在 Excel 內關閉該檔 |
| `swap` 無法重新排序工作表 | `swap` 用於列/儲存格.工作表請用 `move --after` / `--before` / `--index` |
| 寫入後缺少快取值 | 新公式會在人類開啟檔案時取得快取值;`validate` 兩種情況都接受 |

---

## CLI 機制(引擎層, 三種格式共用)

自原通用 `officecli` 技能併入, 使本技能自足.以上皆為活頁簿工藝, 本節則是 CLI 本身的行為.

### 常駐模式與 flush

**每個指令於首次存取時會自動啟動常駐**(閒置 60 秒逾時)——自動避免檔案鎖衝突.明確 `open`/`close` 可把閒置窗口延長至 12 分鐘:

```bash
officecli open "$FILE"      # 保留於記憶體
officecli set "$FILE" ...   # 無檔案 I/O 負擔
officecli close "$FILE"     # 存檔並釋放
```

以 `OFFICECLI_NO_AUTO_RESIDENT=1` 停用自動啟動.**只在非 officecli 邊界才 flush**——officecli 自己的讀取(`get`/`query`/`view`/`dump`)一律看得到你的編輯, 故只有在 openpyxl, Excel, 渲染器或交付要讀該檔前才需 `save`/`close`.閒置階段會於數秒內自動 flush;`OFFICECLI_RESIDENT_FLUSH=each` 可強制每次變更都 flush.**這對 xlsx 最為重要**——大量 CSV 匯入會跑數百個操作, 保持單一常駐開啟遠勝於每條指令都重新解析活頁簿.

### 穩定 ID 定址

具穩定 ID 之元素會回傳 `@attr=value` 路徑而非位置索引;位置索引會因插入/刪除而位移, 穩定 ID 不會.

```
/Sheet1/namedrange[@name=TaxRate]     # 具名範圍
```

**xlsx 主要依賴原生定址**(`/Sheet1/A1`, `/Sheet1/A1:D100`, `Sheet1!row[Salary>5000]`)而非穩定 ID——列與儲存格退回位置 / A1 參照.

### view 模式——完整表

| 模式 | 說明 | 常用旗標 |
|------|-------------|-------------|
| `outline` | 活頁簿結構(工作表, 表格, 圖表) | |
| `stats` | 統計 | |
| `issues` | 格式/內容/結構問題 | `--type format\|content\|structure`, `--limit N` |
| `text` | 純文字擷取 | `--start N --end N`, `--max-lines N` |
| `annotated` | 值加格式標註 | |
| `html` | 靜態 HTML 快照——與 `watch` 同一渲染器, 免起服務 | `--browser` |
| `screenshot` / `pdf` | 無頭瀏覽器 PNG / 匯出外掛 PDF | `-o`, `--screenshot-width/-height` |

一次性快照(CI 產物, 封存, 差異比對)用 `view html`;需要即時刷新時用 `watch`.

### watch 與互動選取

```bash
officecli watch "$FILE" [--port N]   # 即時預覽服務(預設埠 26315)
officecli unwatch "$FILE"
officecli goto "$FILE" <path>        # 讓監看中的瀏覽器捲動至該元素
```

Excel 使用原生風格的綠色選取:雙擊儲存格可就地編輯, 拖曳圖表可重新定位.

**xlsx 之重要限制:** `.xlsx` **不會**輸出 `data-path`, 故整個選取/marks 家族——`get <file> selected`, `mark`, `unmark`, `get-marks`——在活頁簿上一律解析為 `stale=true`(v2 候選項目).點選對人類使用者視覺上有效, 但代理無法讀回該選取——請改用明確路徑 / 選擇器.在 `.docx` / `.pptx` 上選取往返則正常運作.

### batch 原子性, dump, refresh

**預設為原子操作(v1.0.137+):** 每個項目都會執行並回報, 但只要*任一*項目失敗, 整批回滾——檔案保持位元組完全相同.`--best-effort` 可還原[成功的就套用]之舊行為(適用於有損之 `dump→batch` 重播).`--stop-on-error` 只改變停止的早晚, 不影響已完成的工作是否保留——要[第一次失敗就停但保留已成功者]請與 `--best-effort` 併用.`--force` 與此無關(僅為 docx 保護之繞過).失敗項目會帶機器可讀之 `code`;回滾之批次其 JSON 會帶 `"atomicRolledBack": true`.

```bash
officecli dump "$FILE" [<path>]      # 可重播之 batch JSON; 可用 /SheetName 或 /sheet[N] 縮限範圍
officecli plugins list               # 擴充支援 .pdf 匯出
```

**xlsx 之 `dump` 涵蓋範圍:** 儲存格 / 公式 / 樣式, 以及表格, 條件式格式, 驗證, 註解, 圖表, 走勢圖, 圖片, 圖形與樞紐分析表;交叉分析篩選器, chartEx 與 OLE 透過原樣載體往返.

### 複製, 移動, 交換

```bash
officecli add "$FILE" / --from "/Sheet1"                      # 連同關聯複製整張工作表
officecli add "$FILE" /Sheet1 --type row --from "/Sheet1/col[B]"
officecli move "$FILE" <path> [--to <parent>] [--index N] [--after <path>] [--before <path>]
officecli swap "$FILE" <path1> <path2>
```

使用 `--after`/`--before` 時可省略 `--to`.重新排序**工作表**要用 `move`, 不是 `swap`.

### xlsx 元素類型(完整清單)

sheet(visible/hidden/veryHidden, 列印邊界, printTitleRows/Cols, rightToLeft sheetView, 級聯感知之重新命名), row(`c{N}=` 儲存格內容捷徑;add 接受 `--from /Sheet/col[L]`;插入時改寫公式參照), col(改寫公式參照, 移動時具名範圍跟隨), cell(type=richtext+runs, merge=range/sweep, direction=rtl, phonetic;**remove 時 `--shift left|up`, add 時 `shift=right|down`**——與 Excel UI 對話框對等;公式自動偵測;計算支援 OFFSET/INDIRECT), chart(逐軸 RTL/標題, anchor=x,y,w,h, pareto), image(SVG), comment(direction=rtl), table(listobject), namedrange(definedname, volatile, `[@name=X]`;解析時內聯公式本體), pivottable(快取 CoW + 跨樞紐共用, labelFilter=field:type:value 僅限新增時, topN=integer 僅限新增時, `fillDownLabels` 是 `repeatLabels` 之別名而非獨立功能, calculatedField), sparkline, validation, autofilter, shape, textbox, CF(databar / colorscale / iconset / formulacf / cellIs / topN / aboveAverage), ole, csv.Query 支援 `merge` / `mergedrange`.活頁簿層級:password.Shape 選擇器會列舉 `grpSp` 內之葉節點.

### 排序

```bash
officecli set "$FILE" /Sheet1 --prop sort="C desc" --prop sortHeader=true
officecli set "$FILE" "/Sheet1/A1:D100" --prop sort="A asc" --prop sortHeader=true
```

格式:`COL DIR[, COL DIR ...]`.**含合併儲存格或公式之範圍會被拒絕.**附屬資料(超連結, 註解, 條件式格式, 繪圖)會自動跟著列走.

### find / replace 限制

xlsx 僅支援 `--find` + `--replace`——**find 加格式屬性是 docx/pptx 專屬**:

```bash
officecli set "$FILE" / --find draft --replace final
```

### 格式別名與 MCP

格式別名:`excel`→`xlsx`, `word`→`docx`, `ppt`/`powerpoint`→`pptx`.動詞:`add`, `set`, `get`, `query`, `remove`.MCP 透過單一 `command` 字串參數暴露相同綱要——`{"command":"help xlsx pivottable"}`, 原樣傳給 CLI(不是結構化物件).

### 索引基準

- 路徑為 **1 起算**(XPath 慣例):`/Sheet1/row[3]` = 第三列
- `--index` 為 **0 起算**(陣列慣例)——**但** `add --type row` 與 `add --type col` **例外**, 其 `--index N` 為 **1 起算**以對應 OOXML RowIndex / 欄字母索引(`--index 5` 插入於第 5 列 / 第 5 欄)

### 更專門之技能

`officecli load_skill <name>` 會印出一份 SKILL.md——依其規則執行.挑最貼近者;每個產出物**只載入一個**技能, 絕不疊加;已載入之規則跨回合持續有效.

| 名稱 | 使用時機 |
|------|-------------|
| `role-officecli-xlsx`(別名 `excel`) | 本技能——一般活頁簿, 公式, 樞紐, 追蹤表 |
| `financial-model` | 財務模型, 情境分析, 預測.一般資料分析不適用 |
| `data-dashboard` | CSV/表格資料 → KPI / 分析 / 高階儀表板, 含圖表與走勢圖.純資料追蹤不適用 |

`.docx` 或 `.pptx` 產出物請改載入 `role-officecli-docx` / `role-officecli-pptx`——各自皆為自足.
