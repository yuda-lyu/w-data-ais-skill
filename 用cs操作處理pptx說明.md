# 用 C# 操作處理 pptx 說明

> 本文說明如何以 C#（.NET 10 file-based app）驅動 Microsoft PowerPoint COM 自動化，將 pptx 內之圖形（shape）放大後轉存高解析 png。內容整理自本專案「指針.pptx」實作經驗（測試碼於 `tmp/pptx/scalePptxShapeToPng.cs`），各項作法與陷阱均為實測結論。COM 啟動、釋放與 file-based app 之通則與 vsdx 篇相同，本文著重 PowerPoint 特有行為。

## 1. 適用場景與整體做法

- **場景**：Windows 環境、本機已安裝 PowerPoint，需程式化將 pptx 內之向量圖形放大 N 倍後輸出透明背景 png，且放大後視覺比例（浮凸邊框、線寬）須與原圖一致。
- **做法**：以 COM 自動化驅動隱藏之 PowerPoint 實例，開啟 pptx 副本，對 shape 做幾何縮放＋效果參數補償，再以 `Shape.Export()`（隱藏方法）輸出 png。C# 端用 `dynamic` 晚綁定，免安裝 PIA。
- **形式**：.NET 10 file-based app，單一 `.cs` 檔 `dotnet run`，檔首三行 `#:property` 同 vsdx 篇（`TargetFramework=net10.0-windows`、`PublishAot=false`、`BuiltInComInteropSupport=true`）。

## 2. 環境需求

| 項目 | 需求 |
|---|---|
| 作業系統 | Windows（COM 僅 Windows 可用） |
| Microsoft PowerPoint | 本次實測 PowerPoint.Application.16 |
| .NET SDK | 10 以上（本次實測 10.0.301） |

## 3. 先讀懂 pptx 內的「向量圖」是什麼

pptx 為 zip，解開檢查 `ppt/media/` 與 `ppt/slides/slide1.xml` 再決定做法：

- `ppt/media/` 內有 `.emf`/`.wmf`/`.svg` → 圖是嵌入之向量圖檔，可直接抽檔另行處理。
- `ppt/media/` 不存在、slide xml 內有 `<p:sp>`/`<p:grpSp>` → 圖是**原生 PowerPoint 圖形**（本案即此類：一個 `grpSp` 群組內含手繪多邊形＋橢圓），只能經 PowerPoint 物件模型操作與輸出。

## 4. 核心問題：幾何縮放不連動「絕對值」效果參數

### 4.1 根因

PowerPoint 縮放 shape（UI 拖拉或 `ScaleWidth`/`ScaleHeight`）只縮放幾何路徑，以下兩類參數為**絕對值**（單位 pt / EMU，12700 EMU = 1 pt），不隨幾何縮放：

1. **3D 浮凸（bevel）**：slide xml 之 `<a:sp3d><a:bevelT w="12700" h="25400"/>`。本案圓圈的「邊框」其實不是框線（兩個 shape 之 `<a:ln>` 皆 `noFill`），而是 bevel 渲染出的立體環；放大 10 倍後 bevel 尺寸不變，環相對變細 10 倍——即「放大後圓圈邊框未同比例放大」的直接原因。
2. **線寬**：`Shape.Line.Weight`（pt），有框線的 shape 同理。

### 4.2 對策：縮放後逐 shape 補償

COM 屬性與 xml 對應（實測值互相印證）：`ThreeD.BevelTopInset` ↔ `bevelT@w`、`ThreeD.BevelTopDepth` ↔ `bevelT@h`、`BevelBottomInset`/`BevelBottomDepth` ↔ `bevelB@w/h`，單位 pt。

```csharp
shp.ScaleWidth((float)scale, 0);   //0=msoFalse, 相對當前尺寸
shp.ScaleHeight((float)scale, 0);

int n = Convert.ToInt32(shp.GroupItems.Count);
for (int i = 1; i <= n; i++) {
    dynamic it = shp.GroupItems[i];
    dynamic td = it.ThreeD;
    double bti = (double)td.BevelTopInset, btd = (double)td.BevelTopDepth;
    double bbi = (double)td.BevelBottomInset, bbd = (double)td.BevelBottomDepth;
    if (bti > 0) { td.BevelTopInset = (float)(bti * scale); }
    if (btd > 0) { td.BevelTopDepth = (float)(btd * scale); }
    if (bbi > 0) { td.BevelBottomInset = (float)(bbi * scale); }
    if (bbd > 0) { td.BevelBottomDepth = (float)(bbd * scale); }
    if (Convert.ToInt32(it.Line.Visible) != 0) {       //noFill線勿讀寫, 避免誤開框線
        it.Line.Weight = (float)((double)it.Line.Weight * scale);
    }
}
```

實測對照（指針.pptx，放大 10 倍）：未補償 → 圓圈邊環細如髮絲、指針立體感消失（使用者原始症狀）；補償後 → 與原圖比例一致。

## 5. PowerPoint COM 與 Visio 的差異陷阱

| # | 雷 | 對策 |
|---|---|---|
| 1 | **`app.Visible = false` 直接拋錯**（Invalid request），PowerPoint 不允許隱藏 Application | 不設 Visible，改以 `Presentations.Open(fp, 0, 0, 0)` 之第 4 參數 `WithWindow=0` 開檔不開視窗 |
| 2 | 無 Visio 之 `AlertResponse` | `app.DisplayAlerts = 1`（ppAlertsNone） |
| 3 | 關檔時詢問存檔會卡住隱藏實例 | 關閉前設 `pres.Saved = -1`（msoTrue）騙過 dirty check，再 `pres.Close()` |
| 4 | 修改動作會污染原檔 | 一律複製副本再開，轉完刪副本 |
| 5 | `Shape.Export` 為**隱藏（undocumented）方法**，PIA/智能提示看不到 | `dynamic` 晚綁定可直接呼叫：`shp.Export(路徑, 2)`，2=ppShapeFormatPNG |
| 6 | 殘留背景 POWERPNT.EXE | 同 vsdx 篇：`Quit()` + `Marshal.FinalReleaseComObject(app)` + 兩段 GC |

## 6. Shape.Export 輸出行為（實測）

- **透明背景**：輸出 png 為 RGBA（IHDR colorType=6），shape 以外全透明——指針類疊圖素材必要特性。極小圖（如 27×15px）會退化為 palette（colorType=3）。
- **原生解析度**：約以 96dpi 渲染 shape 之旋轉後外接框。本案群組原尺寸僅 15.1×6.2pt，直接輸出僅 27×15px；放大 10 倍後輸出 219×104px。
- **後兩個參數（ScaleWidth/ScaleHeight + ExportMode）可再提高解析度，但有變形陷阱**，見 §7。

## 7. 高解析輸出：`Export(fp, 2, SW, SH, 4)` 之實測語意

`ppScaleXY=4` 模式下 SW/SH 有效，但行為**無文件記載且不直覺**，實測結論：

1. **線性**：`(6000,2600)` 輸出恰為 `(3000,1300)` 之 2 倍（675×264 → 1345×523），是可用的解析度槓桿。
2. **要求值≠輸出像素**：要求 3000×1300 只得 675×264，內部換算係數不透明。
3. **X/Y 係數不同 → 內容會變形**：native 內容長寬比 2.684，要求 3000×1300（比 2.31）→ 3.154；即使 SW:SH 給到 shape 原生比 2.106 仍得 2.992。**不能假設等比要求就等比輸出**。
4. `ppScaleToFit=3` 亦變形（拉成非原始比例），避免使用。
5. **對策：迭代校正**——輸出後量測 png 內容（alpha>200 之 bbox）長寬比，依偏差調整 SH 重輸出，2 輪即收斂。本案 `(9000, 4274→4764→5113)` 使內容比 2.992→2.809→**2.688**（目標 2.689，誤差 0.04%），得 2015×940px 無變形高解析圖。

替代路徑「加大幾何倍率、用原生解析度輸出」雖無此陷阱，但受 **PowerPoint shape 尺寸上限 4032pt（56 吋）**限制：本案 151pt 寬最多放大 26 倍（約 580px），不夠高清時仍須走 SW/SH 校正。

## 8. 驗證（不依賴影像庫）

- **尺寸與透明**：讀 png bytes，IHDR 之寬（offset 16-19）、高（20-23）big-endian，colorType（offset 25）＝6 即 RSBA 含透明。
- **比例（防變形）**：掃描 alpha 通道取內容 bbox，比較放大前後長寬比；此步驟是發現 §7 變形問題的手段，凡用 SW/SH 參數輸出必做。

## 9. 完整流程範例

```csharp
#:property TargetFramework=net10.0-windows
#:property PublishAot=false
#:property BuiltInComInteropSupport=true
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

Console.OutputEncoding = Encoding.UTF8;
string src = Path.GetFullPath(args[0]);      //來源pptx
string dst = Path.GetFullPath(args[1]);      //輸出png
double scale = double.Parse(args[2]);        //放大倍率

string work = Path.Combine(Path.GetDirectoryName(dst)!, "work.pptx");
File.Copy(src, work, true);                  //開副本, 不動原檔

Type? t = Type.GetTypeFromProgID("PowerPoint.Application");
dynamic app = Activator.CreateInstance(t!)!;
app.DisplayAlerts = 1;                       //ppAlertsNone; 勿設Visible=false(會拋錯)
dynamic? pres = null;
try {
    pres = app.Presentations.Open(work, 0, 0, 0); //WithWindow=0
    dynamic shp = pres.Slides[1].Shapes[1];
    shp.ScaleWidth((float)scale, 0);
    shp.ScaleHeight((float)scale, 0);
    int n = Convert.ToInt32(shp.GroupItems.Count);
    for (int i = 1; i <= n; i++) {           //bevel與線寬為絕對值, 須同步補償
        dynamic td = shp.GroupItems[i].ThreeD;
        double v;
        if ((v = (double)td.BevelTopInset) > 0) { td.BevelTopInset = (float)(v * scale); }
        if ((v = (double)td.BevelTopDepth) > 0) { td.BevelTopDepth = (float)(v * scale); }
        if ((v = (double)td.BevelBottomInset) > 0) { td.BevelBottomInset = (float)(v * scale); }
        if ((v = (double)td.BevelBottomDepth) > 0) { td.BevelBottomDepth = (float)(v * scale); }
        dynamic it = shp.GroupItems[i];
        if (Convert.ToInt32(it.Line.Visible) != 0) {
            it.Line.Weight = (float)((double)it.Line.Weight * scale);
        }
    }
    shp.Export(dst, 2);                      //2=ppShapeFormatPNG, 透明背景
    //更高解析: shp.Export(dst, 2, SW, SH, 4) 並依§7迭代校正SH
}
finally {
    if (pres != null) { pres.Saved = -1; pres.Close(); }
    app.Quit();
    Marshal.FinalReleaseComObject(app);
    GC.Collect();
    GC.WaitForPendingFinalizers();
    try { File.Delete(work); } catch { }
}
```

執行：`dotnet run ./scalePptxShapeToPng.cs -- "指針.pptx" "out.png" 10`（`--` 之後才是程式參數）。

## 10. 已知限制

- 僅 Windows 且須本機安裝 PowerPoint。
- `Shape.Export` 為隱藏 API，行為（特別是 SW/SH 語意）可能隨 Office 版本變動，換版後須重跑 §8 驗證。
- 幾何放大受 shape 尺寸上限 4032pt 限制。
- bevel 補償僅處理 `BevelTop*`/`BevelBottom*` 四參數；若 shape 另有 `Depth`（3D 深度）、陰影 `Shadow.Blur/OffsetX/OffsetY`、光暈 `Glow.Radius` 等絕對值效果，放大時同理須補償（本案無，未實測）。
