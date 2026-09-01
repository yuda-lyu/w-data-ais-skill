# 超容差 pixel mismatch 診斷、守門與重產認證

本篇是 SKILL.md §7–§8 的深入層：baseline 比對超過容差（真差異）時怎麼查、查到什麼程度才算查完、根因修不了時怎麼守門、重產後怎麼認證。**先量後猜**——任何讀碼推測都不得先於量測公布（殷鑑：讀到 `barSize/2` 就公布「奇數 px 造成半像素」，量 6 輪 DOM 全整數，推測作廢）。調研方法、外部複審、業主裁示、反模式見 [research-review-discipline.md](research-review-discipline.md)。

## 1. 先分流：三種差異、三種處置

| 種類 | 徵狀 | 處置 |
|---|---|---|
| ① 反鋸齒次像素 noise | SVG icon / 字型邊緣，肉眼等同；色差分布集中 01–08 | pixelmatch `includeAA:false` + `maxDiffPixels` 自動吸收；不 chase、不遮罩、不做旗標體操 |
| ② 真會動的動態內容 | 資料 / 動畫 / canvas，怎麼等都不穩 | 遮罩該動態 block（SKILL §8.2）；優先讓資料確定性 |
| ③ 超容差真差異 | 差異像素 > `maxDiffPixels`；大量色差 > 100 | 照 §2 成因表 + §3 七步查具體成因；禁止放寬容差將就 |

## 2. 超容差真差異的五類成因（歷次逐一 diff 命中率 100%）

| # | 成因 | 徵狀 | 解法 |
|---|---|---|---|
| 1 | DB 內容不同 | 差異在資料區 | hermetic DB 重置；查跨流程殘留；先確認只有一個 backend 連這個 DB（多 backend 同連一 lmdb，其一握舊 snapshot） |
| 2 | 動畫未停 | 差異在會動的元件 | `animations:'disabled'` 凍 CSS；inline `<svg>` `pauseAnimations()`；`<img>` 內 SMIL 凍不到 → 遮罩 |
| 3 | 延遲特效（setTimeout reveal） | 忽有忽無某元素、寬度差幾 px | `captureStable` 的 `initialWaitMs`（`animations:'disabled'` 不 fast-forward `setTimeout`；retry 只保證某 state 穩定不保證 final） |
| 4 | hover / focus 殘留 | 點擊後拍進 hover 態 | 截圖前 `mouse.move(0,0)` + 等 chain animation（1500ms 級）；撞 byte 不穩第一直覺先試 mouse park |
| 5 | async 未 settle | 首次渲染整體微差 | `captureStable` retry；殘留次像素由 AA 吸收 |

先看 fail-dump 的 `__diff.png` 或自行 diff 出 bounding box，再對表。`--grep` 單跑與全跑不同，先查 1–4 類（尤其 DB state）。

## 3. 七步診斷流程（依序，不可跳號）

1. **diff 幾何特徵**：pngjs 逐像素比 RGB，輸出 `差異數 / inclusive bbox / maxΔ / avgΔ / 色差分布`。同簽名跨 case 跨日出現＝同一根因。逐欄 / 逐列直方圖可看出「五個垂直段恰對應五個選單項」＝整個子樹在動。
2. **是否剛性平移（shift 驗證器）**：掃 `d(dx,0)`，dx∈[-2,2]；對最佳 dx 做 `capture(x,y)==baseline(x+dx,y)` **零失配驗證**。驟降＋零失配＝同一份已光柵化 bitmap 被合成到偏移位置；位移後仍大量不符＝重新光柵化，機制不同。效力最強的單一實驗，第一天就做。
3. **位移量對應哪個幾何量（位移量＝懸出量方程式）**：量該層與裁切容器的寬度差（`scrollWidth / clientWidth / offsetWidth / getBoundingClientRect().width`、裁切祖先的 `overflowX`），`overhang = shell.w - wrap.w`，非零懸出都是嫌疑。機制：比裁切框寬 N px 的合成層有兩個合法對齊解（左緣貼齊＝正常；右緣貼齊＝整層左移 N px），軟體合成器於 launch 初始化二選一後鎖死。殷鑑：捲軸面板為藏原生捲軸把捲動殼做寬 `calc(100% + (nativeBarWidth+1)px)`，headless 下 overlay 捲軸 `nativeBarWidth=0`，懸出恰 1 = 位移 1（上游 2.5.4 起移除 `+1`，逐版 tarball 比對確認）；樹狀組件 6px 溢出 → ~6px 位移。推廣：「加寬藏捲軸 / 負 margin 藏邊界 / +1px fudge」在 headless 都退化成純懸出；原始碼註解自陳「因瀏覽器計算誤差需 +1px」是最強嫌疑訊號。bbox 邊界精確對應某一層的邊界，用 bbox 反推層級比讀碼快。
4. **骰子擲在什麼粒度**：「同 launch 連拍 N 張 hash」×「N 次 fresh launch 各拍 1 張」。同 launch 全同、跨 launch 分歧＝launch 級 → 所有 launch 內治癒（開合、重繪、語系重繪、scrollTop 微擾、`transform:none`）注定無效；同 launch 就分歧＝每拍級 → 往 settle / 時序修。統計單位：launch 級一 launch = 一樣本，連拍 10 張只算 n=1。
5. **baseline 是否已被污染（雙向）**：產圖時 launch 中獎 → 異態凍進 baseline → 每輪必敗，「再重產一次」是重擲骰子。判法：備份 baseline → 同一支產圖程式再跑一次 → 同一張翻面另一張 0px ＝ 產圖本身在擲硬幣；失敗現場 capture 全是正常態 → 毒在 baseline 側。用 §5 異態凍結掃描全庫抓。
6. **渲染設定一致性**：baseline 帶彩邊（如 `[255,186,207]`）vs capture 灰階 → baseline 產於無 `--disable-lcd-text` 之時，含文字截圖必敗。
7. **渲染環境指紋**：CDP `SystemInfo.getInfo` 之 `featureStatus`；A/B 態指紋一致＝決定點不在 GPU feature 層。`--disable-gpu` 在本已 `gpu_compositing=disabled_software` 之機器為 no-op。

**根因交付門檻**：指出哪個組件、哪一行、什麼幾何條件；「合成層位移 / 渲染問題」是現象不是機制。**介入性證明優先於一致性證據**：要有「改了 → 幾何歸零 → 現象消失」對照（暫改 node_modules 驗證可以但不是修法；自有套件走 upstream 統一改版並附建議文件：症狀 / 已驗證事實（每條標證據等級）/ 根因 / 主修法 / 過渡方案 / 影響面 / 驗證清單）。觸發外因陣發性、當下召喚不出時，誠實標注「量測證實異常幾何已移除；機制論述屬高信心假說」。

## 4. 根因修不了時的確定性守門（不是統計重跑）

根因層修法優先於測試層守門；守門是根因無法修時的退路，且必須是**機制對應的確定性檢查**，與被禁止的「多跑 N 輪 0 翻面算過」本質不同：

- **重產側**：launch 級異態分類器（同 §3 步 2 的 shift 驗證器，對已知穩定區域如側欄做 dx 掃描）→ 判為異態的 launch 整個作廢重來，不寫檔。
- **測試側**：`openApp` 後先偵測異態（同分類器對固定參考區）→ 異態即關閉 browser 重啟重試 N 次（N 明列、每次都是 fresh launch）→ 仍異態以**明確錯誤失敗**（不是靜默通過、不是放寬容差）。
- 守門必須寫進映射表「偏離與依據」並註明對應根因 ADR；根因修好後拆除。

## 5. 重產後認證掃描（certify）——產完不能當數

1. **渲染設定一致性**：全庫 baseline 不得有 LCD 次像素彩邊（偵測條件 `|R-B|>60 && |G-(R+B)/2|<40 && !(R>240&&G<80)`，窗口避開彩色 logo 與實色標題列，否則偽陽性）。
2. **異態凍結掃描**：同 flow 內共通區域（側欄 / 頁首）固定窗口逐位元 hash 分群；分群須少且兩語系分群結構對稱（差異只能來自 modal 遮罩 / 選單 active 等 UI 態）；孤立群或不對稱 → 用 shift 分類器確認。
3. **交叉驗證**：一張帶旗標的實測 capture 與新 baseline 比應 0 差異，同時驗證 baseline 與偵測器。

殷鑑：5 次重產有 2 次把異態凍進 baseline；LCD 不一致造成整輪 9 個 flow 全紅並差點誤指上游回歸。**上游套件改版後跑測失敗，第一件事是確認 baseline 產製條件與測試端一致。不憑記憶斷言 baseline 產製條件**：mtime 分群 + LCD 掃描 + 帶旗標 capture 逐位元比三者交叉（記憶是「已全量重產」，實際曾被中止只完成 1/9）。

## 6. 診斷閘門紀律

- 每處臨時分支標 `//【暫時診斷 XXX，根因鑑別完成後移除】`；收斂後全部移除（含 import 與 hooks），並在 ADR 補「最終收斂」段。
- regen 路徑絕不可在診斷 env 生效時執行：診斷對照圖寫 `./tmp/` 或獨立目錄；regen 入口硬 guard `if (REGEN && (env.E2E_BARE || env.E2E_DIAG)) throw`。殷鑑：`E2E_BARE=1 --baseline` 覆寫 46 張正式 baseline，上游修好後全套全掛，花一輪才查清失敗在自己的 baseline。
- fail-dump 是歷史證據：三聯組 + ms 時間戳 + 永不覆蓋；重產前確認被毒化的 baseline 證據已在 dump 內。

## 7. 實作級陷阱（會讓實驗靜默給錯答案）

1. 不可用 inline style 字串找元素——`overflow-x:hidden;overflow-y:scroll` 序列化成 `overflow: hidden scroll`、`margin-left:10px` 變 `margin-left: 10px`，正則 / 屬性選擇器永遠落空；用 `getComputedStyle` / `getByText`。
2. 組件庫按鈕常是 `div` 非 `<button>`；SVG path 一律 `import` 自 icon 套件。
3. 比對窗口避開紅框殘影（撞到紅框左邊框 → 分類器全程回 `other` 而不報錯）。
4. 選擇器命中數先斷言；偵測器上線前先跑已知答案樣本；命中時印實際 RGB 判偽陽性。
