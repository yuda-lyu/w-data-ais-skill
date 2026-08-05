# 用 C# 操作處理 docx 說明

> 本文說明如何以 C#（.NET 10 file-based app）透過 Open XML SDK 直接操作 docx 之 OOXML 結構，以「刪除表格區塊並於原位替換為文字段落」為實作案例，架構為三件式：核心 cs（單檔）＋ NativeAOT 免安裝 exe ＋ node 調用端。與 pptx 篇（COM 驅動 PowerPoint）不同，本篇走純結構操作路線，**免安裝 Office、無 COM 生命週期問題，執行機亦不需 .NET**。各項作法與陷阱均為實測結論。

## 1. 適用場景與技術選型

docx 為 zip 內含多份 XML（OOXML，主體為 `word/document.xml`）。操作技術三路線：

| 路線 | 原理 | 適用 | 限制 |
|---|---|---|---|
| node + pizzip 字串手術 | 直接改 `word/document.xml` 字串 | 輕量結構改動 | 頂層節點須手工深度計數切分，易錯；無 schema 保障 |
| **C# + Open XML SDK（本篇）** | 微軟官方 OOXML 物件模型（NuGet `DocumentFormat.OpenXml`） | 結構性增刪改：刪表格、插段落、搬移節點 | 編譯機需 .NET SDK；無渲染能力（不能轉 pdf、重算欄位） |
| C# + Word COM | 驅動本機 Word 實例 | 需渲染引擎之任務（轉檔、出圖、欄位重算） | 需裝 Word；COM 生命週期陷阱（見 pptx / vsdx 篇） |

- **officecli 調研結論（佐證選型）**：officecli（iOfficeAI/OfficeCLI，實測 1.0.143）之 csproj 實證其 docx 引擎**就是 `DocumentFormat.OpenXml`（3.4.1）**加 `System.CommandLine`，`net10.0` 以 `PublishSingleFile`＋`SelfContained`＋`PublishTrimmed` 出 33MB 單一執行檔——即「不開 Word、直接讀寫 OOXML」的免安裝路線；其 `/body/p[1]` 語意路徑只是 CLI 介面層設計，底層仍為官方 Open XML SDK。**自寫 cs 用同一個庫**，docx 操作層之穩定度與 officecli 同級。（來源：github.com/iOfficeAI/OfficeCLI 之 src/officecli/officecli.csproj）
- **與模板標籤取代套件（docxtemplater 系）之分工**：標籤取代（`[[key]]` / `[[%pic]]`）交由 docxtemplater 系模板引擎。實測 docxtemplater（3.69）之 section 標籤（`[[#k]]`…`[[/k]]` 與反向 `[[^k]]`）其實也能條件移除表格，但須於業主交付之模板內各受控表格前後插入控制標籤段落，污染模板且日後人工編修易破壞標籤配對，故**結構性刪改採產出後處理（cs），不採模板標籤**。

## 2. 環境需求

| 項目 | 編譯機（開發機） | 執行機（如線上伺服器） |
|---|---|---|
| .NET SDK | 10 以上（實測 10.0.301；file-based app 為 .NET 10 新功能） | **不需要**（跑 NativeAOT 編譯之免安裝 exe） |
| C++ 連結器 | NativeAOT 出 exe 須 VS 之 MSVC link.exe（見 §3 之 6） | 不需要 |
| NuGet 網路 | 首次編譯須下載 `DocumentFormat.OpenXml`（之後走本機快取） | 不需要 |
| Microsoft Word / Office | **不需要**（Open XML SDK 直接讀寫 zip 內 XML，全程無 COM、無 Word） | **不需要** |

## 3. file-based app 要點與陷阱（實測）

1. 檔首指示詞（同 pptx 篇之 `#:property` 機制，多了套件引用）：

   ```csharp
   #:package DocumentFormat.OpenXml@3.*
   #:property PublishAot=false
   ```

   `#:package` 支援 `@3.*` 萬用版本。

2. **陷阱：.NET 10 file-based app 預設 `PublishAot=true`**，連動把 `System.Text.Json` 之反射序列化停用——即使以 `dotnet run`（JIT）執行，一呼叫 `JsonSerializer.Deserialize<T>()` 即拋 `Reflection-based serialization has been disabled for this application`。編譯期之 IL2026/IL3050 警告即此問題的前兆。兩條解法（實測皆通）：
   - `#:property PublishAot=false`：反射 JSON 復活，但放棄 NativeAOT 出免安裝 exe 的能力；
   - **改用 JSON source generator（本案採用）**：宣告 `JsonSerializerContext` 部分類別＋`[JsonSerializable(typeof(T))]`，`Deserialize(json, AppJsonContext.Default.Config)` 走編譯期生成碼——`dotnet run` 與 NativeAOT publish 兩相宜。注意 source generator 之輸出預設把非 ASCII 轉 `\uXXXX`（中文變逸出序列），呼叫端 `JSON.parse` 可正常解回，無需處理。

3. 建置快取：首次執行含 NuGet 還原＋編譯約 **14s**；`.cs` 變更後重編約 **3.6s**；未變更走快取約 **1.2s**。建置產物放於使用者暫存區，**不會**在 `.cs` 所在資料夾產生 `bin/` `obj/`（實測保持乾淨），故 cs 檔可直接放專案資料夾隨 git 管理。

4. **陷阱：stdout 不可作為機器解析之結果通道**（實案 991 份文件全量批次炸 166 次）。兩段成因咬合：
   - node 端常用之 `execProcess` 類包裝（如 wsemi）會於**每個 stdout data chunk 後注入一個換行**（stderr 同）；
   - .NET `Console.Out` 之 StreamWriter 預設 **256 bytes 緩衝**，超過 256B 的單行 JSON 會分次 flush，pipe 未合併時 node 收到多個 data 事件 → 換行被注入在 JSON 內部 → 逐行解析炸於 256/512/768/1024 等位置（256 之倍數即此症狀之指紋）。閒置開發機實測 10 次即中 1 次，高負載伺服器中 17%；**單筆測試通過不代表通道可靠**。
   - 對策：**結果一律走中介檔案**（仿 w-kriging 模式）——argv 僅傳 `base64(JSON{fpIn,fpOut})`，cs 讀 `fpIn` 設定檔、把結果寫到 `fpOut` 結果檔，node 讀檔取回；stdout 僅供 log。結果檔寫出**必須 UTF-8 無 BOM**（`new UTF8Encoding(false)`；`File.WriteAllText` 給 `Encoding.UTF8` 會帶 BOM，node 端 `JSON.parse` 直接炸）。

5. 中文相容：中文路徑（實測含中文之專案根路徑）、中文檔名、config 內中文值皆正常。必設 `Console.OutputEncoding = Encoding.UTF8` 否則中文輸出亂碼；**中文參數走 UTF-8 設定檔傳遞**，不走 argv（跨 shell 傳遞有編碼風險，且 json 過長時 Windows 有命令列長度限制）。

6. **編譯免安裝 exe（NativeAOT）**：`dotnet publish <file>.cs -o <dist>` 即可（file-based app 直接 publish，免 csproj；預設 `PublishAot=true` 正好出原生 exe）。實測陷阱與數據：
   - **`vswhere.exe` 不在 PATH 會失敗**：NativeAOT 連結需 MSVC link.exe，其定位靠 `vswhere.exe`（位於 `C:\Program Files (x86)\Microsoft Visual Studio\Installer\`）。Git Bash 下 PATH 未含該目錄時，錯誤訊息為 `'vswhere.exe' 不是內部或外部命令` 混入 link 命令列後以 MSB3073 收場。解法：將該目錄加入 PATH 再 publish。另需本機裝有 VS C++ 工具鏈（實測 VS2022 Community MSVC 14.35）。
   - 產物：exe 約 **30MB**（含 OpenXml＋runtime，單一檔零依賴）；同時產出之 `.pdb`（約 119MB）為除錯符號，**不需佈署可刪**。
   - 時間：原生碼生成約 1 分鐘；之後僅重連結約 6s。
   - exe 執行速度：處理 4.3MB docx 刪 44 表約 **185ms**（由 node 調用實測），遠快於 `dotnet run`（1.2s）。

7. 執行：`dotnet run <file>.cs -- <args>`（`--` 之後才是程式參數，同 pptx 篇）；或直接跑 publish 出的 exe：`xxx.exe <args>`。

## 4. Open XML SDK 操作 docx 核心概念

```csharp
//AutoSave=false: 失敗中止時dispose不寫回半成品, 全部成功才明確Save(), 保證失敗不動檔
using (var doc = WordprocessingDocument.Open(fp, true, new OpenSettings { AutoSave = false })) {
    var docPart = doc.MainDocumentPart.Document;
    var body = docPart.Body;
    //...增刪改...
    docPart.Save();
}
```

- **陷阱：`Open(fp, true)` 預設 autosave**——多項目逐一處理時若中途失敗 `return`，`using` dispose 仍會把已處理項目之部分變更寫回，就地修改場景下原檔被弄髒且無聲無息。**一律 `AutoSave=false`＋成功才 `Save()`**。
- **body 直屬子節點即頁面頂層序列**：段落 `Paragraph`（`w:p`）與表格 `Table`（`w:tbl`）平行排列。「表格上方標題」即表格前面的兄弟段落。
- **`InnerText` 自動合併跨 run 文字**：Word 會把一句話拆成多個 `w:r`（rsid、proofErr、拼字檢查邊界等），`p.InnerText` 直接回傳整段純文字，**免處理 run 拆分**——這正是 CLI 工具逐字搜尋 0 matched 與字串手術須手工 merge run 的老問題，SDK 一個屬性解決。同理，**驗證產出時勿以原始 XML 子字串搜尋文字**（run 拆分會造成假陰性），應逐節點取 `InnerText` 比對。
- 以 `body.ChildElements.OfType<Paragraph>()` 只取**直屬**段落，天然排除表格格內段落之誤中。
- 節點操作三板斧：`node.NextSibling()` 走兄弟鏈、`elem.Remove()` 刪除、`anchor.InsertBeforeSelf(newElem)` 插入，已足支「刪表格換文字」。
- 建構段落：`new Paragraph(pPr, run)`。**`pPr` 子元素順序須依 OOXML schema**（如 `snapToGrid` 先於 `spacing`，`rPr` 於最末），順序錯誤 Word 開啟可能觸發修復。字級單位為半點（`sz=24` 即 12pt）。
- `Text` 須設 `Space = SpaceProcessingModeValues.Preserve` 保留前後空白。

## 5. 實作案例：整份無數據時刪除表格區塊改為替代文字

**需求情境**：報告由模板產出，但某些情況下整份數據表格全空（如監測系統之地震速報，無任何測站綁定該事件），業主要求將各數據表格改為一句說明文字。模板標籤引擎只能取代不能刪表格，故以本篇技術對產出之 docx 後處理。

**三件式架構**：

- **核心 cs（單檔）**：argv 收 `base64(JSON{fpIn,fpOut})` → 讀 `fpIn` 設定檔（UTF-8：`{fpSrc, fpOut, items}`，此 fpSrc/fpOut 為 docx）→ 逐項處理 → 結果寫 `fpOut` 結果檔（UTF-8 無 BOM）；失敗不寫結果檔，訊息走 stderr＋非 0 退出，且因 `AutoSave=false` 保證不動檔。JSON 走 source generator 故可 NativeAOT。
- **免安裝 exe**：`dotnet publish` 產出，隨程式碼佈署至執行機（執行機免 .NET、免 Office）。
- **node 調用端**：中介檔模式仿 w-kriging——寫出唯一 id 之 `fpIn`/`fpRes` 暫存檔 → 執行 exe（無 exe 時退回 `dotnet run` 跑 cs 原始碼，開發機用）→ 讀 `fpRes` 結果檔 → 清理中介檔 → 檢核。內建重試（預設 3 次、遞增延遲，對應防毒/索引服務短暫佔用檔案），且**重試一律先備份原檔、每次自備份重來**——避免「exe 已成功改檔、僅結果回傳失敗」時對已處理檔二次處理。
- **產線接入**：於「整份無數據」條件成立時，在模板引擎產出 docx 之後、轉 pdf 之前就地後處理。

**items 介面**（每項一個刪除區塊）：

```js
let r = await replaceDocxTablesWithText(fpSrc, fpOut, [ //fpSrc===fpOut時為就地修改
    { caption: '表名段落全文', count: 1, text: '替代文字' },
    { caption: '歷時圖群之表名', count: 10, text: '...' },                    //1個表名後接多個表格之群組
    { caption: '成果表表名', count: 1, text: '...', notes: ['表下註解全文'] }, //表下連帶補充註解一併刪
])
//r = { ok: true, items: [{ caption, removedTables, removedSeparators, removedNotes }] }
```

**定位與刪除設計**：

- caption 以「body 直屬段落全文**完全相符**」定位（`InnerText.Trim()` 比對），不用 Contains 避免誤中。
- **刪除範圍＝表名（caption 本身）＋表格群＋表下註解**：自 caption 往後掃兄弟節點收集第 1 至第 count 個表格，caption 與表格間、表格之間的分隔段落（模板為避免相鄰表格被 Word 合併而加的空段）一併刪除；`notes` 宣告表下連帶補充註解（自末表格往後逐字相符掃描，遇表格或非宣告段落即止）；末表格（或註解）之後的段落**保留**（維持與後續內容間距）。
- 替代文字若含各區塊主題（如「針對『某某主題』，因…無相關事件紀錄。」），由呼叫端逐項給 text，cs 不做字串組裝。
- 於表名原位 `InsertBeforeSelf` 插入替代段落（字型字級與段落屬性比照模板內文），再統一 `Remove()`。
- **fail loud**：caption 找不到、表格數不足、宣告之 note 找不到 → stderr 明確訊息＋exit 1 → node 端 reject。模板改版導致定位失效時第一時間發現，不會靜默出殘缺報告。附帶效果：表名已刪，對已處理檔誤跑第二次會於第 1 項即報 `caption not found`，天然防重複處理。

**踩過的坑（皆已內建對策，供同型實作借鑑）**：

- **二次處理之簽名**：早期版本僅刪表格保留表名，兩個產製實例並行（同事件同秒同時間戳同檔名）互踩時，同檔被後處理兩次——第二次首項會「吃掉」文件後段不相干的表格（靜默誤刪），至某項才報 `expects N tables but only M found`（M＝該表名之後全文件僅剩的表格數）。批次產線務必**單一實例**；連表名一併刪除後此情境改為 fail fast。
- **中途失敗留半成品**：見 §4 之 `AutoSave=false`。
- **重試放大災情**：對就地修改之檔案重試，若前次其實已改檔成功，重試即二次處理——重試必須自原檔備份重來。

**實測**（53 表之實案模板，8 組刪除區塊）：刪 44 表（4×1＋4×10）＋1 註腳＋8 表名，表格數 53→9，8 句替代文字各落於原表名位置；未列入之表格及其註腳、說明區塊完好；`officecli validate` 通過；迴圈 30 次全數成功（平均 203ms/次；stdout 解析之舊法於同機約 1/10 失敗）。

## 6. 驗證（不依賴 Word）

- `officecli validate`：OOXML 合規。
- pizzip 結構斷言：表格數對帳、逐頂層節點列出確認替代文字位置與保留區塊完整；**文字比對走逐節點 `InnerText`，勿搜原始 XML 子字串**（run 拆分假陰性，見 §4）。
- `officecli get` 檢查替代段落之字型、字級、`snapToGrid` 等屬性與模板內文一致。
- 單筆通過不算數：批次通道類問題（§3 之 4）須迴圈多次驗證。
- 最終交付前仍以 Word / WPS 人工開啟確認視覺。

## 7. 已知限制

- Open XML SDK 純結構操作，**無渲染**：轉 pdf 須另以 LibreOffice / Word 系工具處理；TOC / PAGE 欄位重算不在此路線。
- caption / notes 採完全相符比對：模板改文字須同步改呼叫端 items（fail loud 會擋下，不會靜默錯位）。
- NativeAOT exe 為單一平台產物（實測 win-x64）；他平台或無 exe 時退回 `dotnet run`（需 .NET 10 SDK）。
- 編譯免安裝 exe 需編譯機具 VS C++ 工具鏈（MSVC link.exe）；`dotnet run` 開發模式則只需 .NET SDK。
- 首次編譯須可連 NuGet；之後離線亦可（本機快取）。
