# 用 C# 操作處理 vsdx 說明

> 本文說明如何以 C#（.NET 10 file-based app）驅動 Microsoft Visio COM 自動化，批次將 `.vsdx` 轉出 `.png`。內容整理自本專案實作 `_docs/src/convert_vsdx/convertVsdxToPng.cs`，所有行號引用皆指向該檔；各項作法與陷阱均為實測結論，可直接沿用至其他專案。

## 1. 適用場景與整體做法

- **場景**：Windows 環境、本機已安裝 Microsoft Visio，需程式化將 vsdx 匯出為點陣圖（png），且要能控制解析度（dpi）、白底、批次處理與驗證輸出。
- **做法**：不經任何第三方套件，直接以 COM 自動化驅動一個「另起的隱藏 Visio 實例」開檔並逐頁 `Export()`。C# 端用 `dynamic` 晚綁定呼叫，免安裝 interop assembly（PIA）。
- **形式**：採 .NET 10 的 file-based app——單一 `.cs` 檔即可 `dotnet run`，不需 `.csproj`。

## 2. 環境需求

| 項目 | 需求 |
|---|---|
| 作業系統 | Windows（COM 僅 Windows 可用） |
| Microsoft Visio | 2010 以上（使用 `ApplicationSettings` 之 raster export API） |
| .NET SDK | 10 以上（file-based app 與 `#:property` 指令） |

## 3. file-based app 的三行 `#:property`（關鍵，缺一不可）

檔案最上方（`convertVsdxToPng.cs:1-3`）：

```csharp
#:property TargetFramework=net10.0-windows
#:property PublishAot=false
#:property BuiltInComInteropSupport=true
```

- **`PublishAot=false`**：file-based app 預設 `PublishAot=true`，而 AOT 會停用 Built-in COM interop——不關掉的話 `Activator.CreateInstance` 建 COM 物件直接失敗。這是最容易踩到的一雷。
- **`BuiltInComInteropSupport=true`**：.NET（Core 系）預設不啟用內建 COM interop，須顯式開啟。
- **`TargetFramework=net10.0-windows`**：COM 需要 windows TFM，必須鎖定。

## 4. 執行方式

於任意 cwd 皆可執行（pics 位置以 `.cs` 檔所在位置為錨點自動定位，見 §7.1）：

```bash
dotnet run ./_docs/src/convert_vsdx/convertVsdxToPng.cs                    # 掃描 _docs/pics，轉出各系列最高版次（預設 200dpi）
dotnet run ./_docs/src/convert_vsdx/convertVsdxToPng.cs -- --dpi 300      # 指定解析度
dotnet run ./_docs/src/convert_vsdx/convertVsdxToPng.cs -- --only 市佔率  # 只處理路徑含關鍵字者（測試用）
dotnet run ./_docs/src/convert_vsdx/convertVsdxToPng.cs -- --force        # png 已存在且較新者也強制重轉
```

注意 `--` 之後才是傳給程式的參數（`dotnet run` 慣例）。

## 5. COM 自動化核心流程

### 5.1 啟動隱藏實例（`convertVsdxToPng.cs:85-95`）

```csharp
Type? tVisio = Type.GetTypeFromProgID("Visio.Application");
dynamic app = Activator.CreateInstance(tVisio)!;
app.Visible = false;
app.AlertResponse = 7; //IDNO：自動回應對話框，避免隱藏實例卡住
```

- 以 ProgID 取型別後 `Activator.CreateInstance`，**每次另起新實例**，不用 `GetActiveObject` 附掛使用者已開啟的 Visio——避免干擾使用者的操作與文件。
- 全程用 `dynamic` 晚綁定：不需引用 Visio PIA，跨 Visio 版本可用。
- **`AlertResponse = 7`（IDNO）必設**：隱藏實例一旦跳對話框（相容性、字型、巨集詢問等）就會永久卡住，此設定讓 Visio 自動以「否」回應所有對話框。

### 5.2 匯出參數（`convertVsdxToPng.cs:96-101`）

```csharp
app.Settings.SetRasterExportResolution(3, dpi, dpi, 0); //visRasterUseCustomResolution=3，單位 visRasterPixelsPerInch=0
app.Settings.SetRasterExportSize(2, 0.0, 0.0, 0);       //visRasterFitToSourceSize=2（依來源頁面實際尺寸，寬高參數忽略）
app.Settings.RasterExportUseTransparencyColor = false;
app.Settings.RasterExportBackgroundColor = 0xFFFFFF;    //白底
```

raster export 設定掛在 `Application.Settings`（全域），設一次後所有 `Page.Export()` 沿用。`dynamic` 呼叫下 enum 直接以整數常數傳入。

### 5.3 唯讀開檔（`convertVsdxToPng.cs:107-109`）

```csharp
doc = app.Documents.OpenEx(fp, (short)458);
```

`458 = visOpenRO(2) + visOpenDontList(8) + visOpenHidden(64) + visOpenMacrosDisabled(128) + visOpenNoWorkspace(256)`——唯讀、不進最近清單、隱藏、停用巨集、不還原工作區。flags 須以 `(short)` 傳入。

### 5.4 逐頁匯出（`convertVsdxToPng.cs:118-128`）

```csharp
for (int i = 1; i <= nPages; i++) {           //Pages 為 1-based
    dynamic pg = doc.Pages[i];
    if (Convert.ToBoolean((object)pg.Background)) { continue; } //背景頁不匯出
    pg.Export(png);                           //副檔名 .png 即匯出 PNG
}
```

- `Page.Export(路徑)` 依副檔名決定格式，配合 §5.2 的全域設定產出指定 dpi 之 PNG。
- 多個前景頁時：第 1 頁輸出 `{同名}.png`，第 2 頁起輸出 `{同名}_p2.png` 並提示。

### 5.5 收尾釋放（`convertVsdxToPng.cs:135-148`）

```csharp
finally {
    if (doc != null) { doc.Close(); }         //每檔轉完即關
}
...
finally {
    app.Quit();
    Marshal.FinalReleaseComObject(app);
    GC.Collect();
    GC.WaitForPendingFinalizers();
}
```

**不做完整釋放會殘留背景 `VISIO.EXE` 程序**。`FinalReleaseComObject` + 兩段 GC 是 COM 自動化的標準收尾。

## 6. 實測踩雷與對策

| # | 雷 | 對策 | 位置 |
|---|---|---|---|
| 1 | file-based app 預設 `PublishAot=true` → Built-in COM 被停用 | `#:property PublishAot=false` | L2 |
| 2 | 隱藏實例跳對話框永久卡住 | `AlertResponse = 7`（IDNO） | L95 |
| 3 | 原檔正被使用者之 Visio 鎖定編輯 → `OpenEx` 拋 `COMException` | 複製到暫存區開副本（內容＝磁碟上最後存檔版本）轉出，轉完即刪 | L111-117、L137 |
| 4 | `Page.Background` 經 typelib 可能回 `short` 而非 `bool`，直接 cast 會炸 | `Convert.ToBoolean((object)pg.Background)` | L122 |
| 5 | Visio 開啟中會產生 `~$` 開頭之鎖定暫存檔，會被 `*.vsdx` 萬用字元掃到 | 檔名 `StartsWith("~$")` 即略過 | L55 |
| 6 | 匯出「成功」不代表結果正確（dpi 未生效、檔案未落地） | 匯出後回讀 PNG 之 IHDR（寬高）與 pHYs（dpi）逐檔驗證，不符即計失敗 | L150-162、L172-180 |
| 7 | COM 物件未釋放 → 殘留背景 VISIO.EXE | `Quit` + `FinalReleaseComObject` + GC 收尾 | L141-148 |

其中第 6 點的 PNG 驗證不依賴任何影像庫：直接讀 bytes 找 `IHDR` chunk 取寬高（big-endian）、找 `pHYs` chunk 取 pixels/meter 換算 dpi（×0.0254）。

## 7. 週邊工程細節（可選用）

### 7.1 以 `.cs` 檔位置為錨點定位資料夾（`convertVsdxToPng.cs:44-45、166`）

```csharp
static string thisFile([CallerFilePath] string p = "") => p;
string srcDir = Path.GetDirectoryName(thisFile())!;
```

`[CallerFilePath]` 於編譯期寫死本檔絕對路徑，因此**於任意 cwd 執行皆可正確定位**相對於腳本的資料夾（本專案為 `_docs/src/convert_vsdx → ../../pics`）。

### 7.2 版次挑選與增量轉檔（`convertVsdxToPng.cs:50-79`）

- 檔名尾碼 `RNN.NN`（如 `系統功能架構圖R00.09.vsdx`）視為同系列版次，以 regex `^(?<base>.*?)R(?<maj>\d{2})\.(?<min>\d{2})$` 解析，同資料夾同系列只取版次最高者轉出。
- 同名 `.png` 已存在且比 vsdx 新 → 跳過（`--force` 強制重轉），達成增量轉檔。

### 7.3 中文輸出

`Console.OutputEncoding = Encoding.UTF8`（L27），避免主控台中文亂碼。

## 8. 已知限制

- 僅 Windows 且須本機安裝 Visio；無 Visio 的環境（CI、Linux）不可用此法。
- `Export()` 之 dpi、尺寸、背景等由 `Application.Settings` 全域控制，無逐頁覆寫；如需不同頁不同參數，須於頁與頁之間重設 Settings。
- 被鎖定檔案之副本轉出內容為「磁碟上最後存檔版本」，使用者未存檔之編輯不會反映在輸出。
