---
name: role-code-for-test-e2e
description: |
  E2E 測試規範技能：完整度 rubric（Case 對齊/Act 真實/Assert 完整/多語覆蓋/Cleanup）、標準圖（pixel baseline）管理與重產政策、captureStable 截圖穩定性、timing flake 處置、偵測 driven 步驟、act/assert 須走 user-facing 路徑（L1-L6 操作層級表、Pattern A/B/C/D 文字輸入）、mocha --reporter/--grep 陷阱、127.0.0.1 端點、高頻 API + X-Forwarded-For、w-screenctl 探索、lifecycle 對稱性（spawn server ↔ cleanup）。
  觸發條件：凡接觸 e2e 測試檔（檔名含 `e2e-`）的任務——寫/改/審/拆/移除/重構/完整度盤查——必先調用本技能，整篇入 context 逐項比對；不限於描述含「e2e」字眼的任務，看到 e2e 工件即觸發。亦適用：Playwright 測試、mocha e2e、pixel baseline/標準圖產製或重產、e2e flake 排查、e2e audit。
---

# E2E 測試規範

**觸發條件**：凡接觸 e2e 測試檔（檔名含 `e2e-`）的任務——寫/改/審/拆/移除/重構/盤查——本篇整篇入 context 逐項比對。

**完整度 rubric（任何 e2e 任務的審查基準）**：

| # | 維度 | 標準 | 失敗樣態 |
|---|---|---|---|
| 1 | Case 對齊 | spec 重要流程每 bullet 至少一個 it() | case 數少於 bullet 數 |
| 2 | Act 真實 | 走 user-facing input（鍵盤滑鼠真點擊） | `.fill()` / `vm.method()` / evaluate setValue |
| 3 | Assert 完整 | DB/state + UI 語意 + stable visual state 必加 pixel baseline | 只驗 DB / 只驗 innerText / modal 沒 baseline |
| 4 | 多語覆蓋 | UI 含 i18n 則所有語系都跑 | 只跑 eng 沒 cht |
| 5 | Cleanup 完整 | 測試創建的資料含 side effects 全清 | DB 殘留 / in-memory 殘留 / 孤兒 token |

Audit 硬規則：任一維度缺漏＝部分覆蓋，不能用「case 數對齊」就回報全覆蓋，回報必逐維度列。

Spec 撰寫紀律：spec「重要流程」段標題下緊接 `- **E2E-NNN**` bullets，不留 prose/blockquote/cross-ref；不獨立建 test 的議題寫進其他段落，不污染重要流程列表。

重要流程內每個項目，配合指定語系，需視為1個case，例如E2E-001+cht就是1個case，E2E-001+eng是另1個case。注意，每個case需各自創建瀏覽器去測試，避免多case之間或向後互相影響。此外，每個case內可有多階段截圖比對，使能讓較長流程之case有更完整的被測試覆蓋率。

## 標準圖管理

baseline 是「規格凍結點」，命名與編號讓「檔案排序 ≡ 測試執行順序 ≡ spec bullet 順序」三者一致。

**儲存政策**：像素比對的 e2e 僅建標準圖資料夾，測試當次截圖以 buffer 在記憶體比對不落地（截圖函式不帶 path 回傳 Buffer）；僅產製模式才寫檔。同測試的標準圖放同一資料夾（如 `test/pics/login/`）。**比對採反鋸齒感知容差，非 byte-exact**：本專案統一以 `test/e2e-setup.mjs` 的 `assertBaselineMatch(buf, baselinePath, label, opts?)` 實作 — pngjs 同步解碼 → **pixelmatch** 比對（`includeAA:false` 自動偵測並**忽略反鋸齒邊緣像素**，`threshold:0.1`）；**差異像素數 ≤ `maxDiffPixels`（預設 100）則視為通過**、靜默 return；超過才 fail；尺寸不同直接 fail；baseline 不存在則 throw。why 用容差不用 `buf.equals`：SVG icon / 字型邊緣之次像素 raster 跨 browser session 不決定性，byte-exact 會把這類「肉眼等同的反鋸齒 noise」當失敗 → 永無止境的 flake（殷鑑：icon 全面改 @mdi/js SVG 後 byte-exact 炸出大量次像素 flake，逼出 `--disable-gpu` 等 flag 體操仍殘留 register-014 等）；pixelmatch 的 AA 偵測專治此（YIQ 感知色差 + AA slope），真 regression（icon 換 / 版面位移 / 顏色變）動輒數百~數千 px 遠超 maxDiffPixels → 仍被抓到。業界標準同 Playwright 內建 `toHaveScreenshot`（maxDiffPixels/maxDiffPixelRatio/threshold）。**失敗證據保留（fail-dump）**：比對失敗時自動把「當次 capture」「對應 baseline」「diff 標紅圖」存到專屬目錄 `./testPending/<label>__<ts>__{capture,baseline,diff}.png`（檔名帶 ms timestamp + 撞檔 `-N` 後綴，**永不覆蓋**；`./testPending` 已 gitignore）供事後定位。why 不覆蓋 + 三存：偶發 flake 當次證據才不會被下次跑蓋掉（殷鑑：adduser E2E-003 drawer flake，dump 被覆蓋後重現不出根因）。pixel baseline 是補強層不是測試本體，每 case 須先有語意斷言（全域規範 §6.2）。

**檔名**：`<flow>-<lang>-<NNN>-<descriptive-kebab-name>.png`（flow 對應 spec 文件；lang＝eng/cht；NNN＝3 位數補零；kebab 名與 it() case 同字）。**編號錨點＝spec bullet 順序**（不是 mocha case index——spec 有「不測試」bullet 時 mocha index 會跳號對不上）。好處：ls 排序即執行順序、fail 直接定位 spec bullet、缺號即知漏 baseline。

**3 種合法 gap**（spec 提到但檔案不存在）：①case 共用其他 baseline（如防帳號列舉兩 case 畫面相同）；②spec 明標不測試；③純 API 驗證無 UI 終態——此類屬暫時狀態，spec 補了 UI 終態就應補 baseline。

**code 對齊**：產 baseline 的 cases 陣列、`writeBaseline()`、mocha `assertBaseline()` 三處字串須完全一致（含編號前綴）。

**重產政策**：UI 變更後重產須先詢問使用者授權，不可自行決定；針對性產製只產受影響的，除非使用者明確說全部重產；i18n 多語系每語系都涵蓋。why：無差別重產＝把當下行為（含 bug）凍結為真理。

**手術式重產（`--names` 指定單張）必須在「截圖前」gate**，不能只 gate 寫檔——要省的是截圖成本（每張數十秒）。正解：`shouldGen(lang, name)`（截圖前判斷）＋ `writeBaseline(...)`（寫檔 filter 安全網）並存且寫法統一。此屬靜態控制流（全域規範 §2.6 規則 6）：讀 regen 迴圈追到 file:line 就有答案。

**標注要求**：針對測試的展示或編輯區，需要繪製紅框用以標注。因 e2e 為瀏覽器截圖範圍大，要讓讀者或審查者方便知道是此測試主要是觀看哪個區域之內容，故需針對觀看區域（例如展示標題區或輸入文字方塊區等）繪製矩形紅框，顏色須用 #f26，線寬用 5px。

## 寫 e2e 前的思考起點

起點決定一切：問「**最簡單**怎麼推進系統到目標狀態」必然產出抄捷徑（改 DB / callFapi / vm.method）；必須改問「**一位真實使用者**會做什麼動作」。寫之前先展開動作清單：①user 從哪頁開始 ②點哪個元素（要能對應 production 的 @click handler）③看到什麼 ④輸入什麼 ⑤提交後看到什麼 ⑥後端 DB 副作用是什麼。每步對應一條真實 UI 互動，被 helper 抹平的步驟就是缺口。

三條硬規則：

1. 寫 e2e 前在註解/文件列出 6 步真實 user path；決定抹平的步驟明確標註「未走 UI」列為缺口。
2. **按鈕全清單比對（機械式可檢查）**：寫完後反查 production 所有可點擊元素（`@click`、`<button>`、可點 `<a>`），比對「測試裡點過哪些」，沒被點到的＝覆蓋缺口，輸出 covered/uncovered 清單。
3. setup helper（simulateXxx / seedDb）只能用於「不是本測試重點的 trigger」，且該 trigger 必須在別處有獨立真 UI e2e 補上；此依賴寫進 helper 註解。

殷鑑：e2e-resetpassword 13 case 全走 simulateAdminReset，0 個走 admin 點按鈕的 UI 鏈條 → 永遠綠燈，掩蓋 2 個 production bug。

## 跑 mocha e2e 一律 `--reporter list` 且不接 pipe

`--reporter list` 每 case 立即印 ✓/✗，retry 的 console.warn 即時可見；`min` 只在跑完印 summary。pipe（`| tail` / `| grep`）會 buffer 到結束才釋放，即時訊息全卡住。搭 `run_in_background: true` 時 stdout 已落 output file，用 Read 看進度，不需 `| tee`。e2e 全跑 20+ 分鐘，沒進度雙方都不知是 stuck 還是進行中。

## `--grep` 過濾掉 outer `it` 時，nested describe 的 `before` 會在 DB 未 setup 前執行

Mocha hook 順序：outer.before → **nested.before** → outer.beforeEach → nested.beforeEach → it。若 outer 用 `beforeEach` 做 DB 初始化且 --grep 過濾掉 outer 所有 it，nested.before 跑時 DB 是空的 → fail。修法：(a) --grep 涵蓋 outer 至少一個 case（如 `--grep "notverify|E2E-001-ok"`）；(b) nested.before 自己做 DB setup（redundant 但 self-contained）；(c) outer 改 `before` 一次 setup。判別：--grep 跑 nested 出現「找不到 user / login fails / 30s timeout」等 DB 沒資料徵狀 → 先查此 artifact，搭 backend log `can not find the user` 是強指標，不是 production bug。

## 每個 case（E2E-NNN × 語系）都 new 一次 browser；DB 也每 case 重置（標準）

業主定義之標準（原話）：**「e2e 內，每個重要流程且單語系，就只能 new 一次瀏覽器去測試，期間會有可能多次截圖比對；之後不論是換重要流程或換語系，都要重新 new 一次瀏覽器去測試。」**
此處「每個重要流程」指**每個 E2E-NNN case（對應一個 `it()`）**，**不是**整份流程文件。故標準即 **per-case（每個 E2E-NNN/it() × 語系）fresh browser**。

落地：
- **browser = per-case**：`beforeEach` 內 `chromium.launch()` + `newContext()` + `newPage()`；`afterEach` `browser.close()`。**每個 `it()` 全新 browser/context/page**，cookie/localStorage/session 不跨 case 帶過。換下一個 E2E-NNN、或換語系（外層 `for (let lang)` 進下一圈），都重新 new。
- **單一 case 內可多次截圖**：一個 case 可在它那一個 browser 內做多次截圖比對；多次截圖屬「同一個 case」，不另 new browser。一個 case 可能只是一個瞬時畫面、也可能是一段需逐階段觀察的 journey。
- **DB = per-case**：`beforeEach` 重置（`deleteXxx()` + `insertXxx()` 重建 base seed），`afterEach` 再清一次。
- **「拆成多 case」vs「單一 case 多階段截圖」的判別（關鍵，別搞反）**：
  - **獨立情境** — 各自 seed、彼此無狀態依賴（如密碼錯誤 / 帳號停用 / 已過期 / 被封鎖，每個都是獨立一組前置）→ **各自一個 per-case it()**，各自 fresh browser。
  - **承接式 sequential journey** — 後段 state 承接前段真實副作用、無法乾淨 seed 中間點，或整段共用一次外部 round-trip（如 email 寄出→收信→開連結驗證）。典型：未驗證流程「登入失敗→點重寄→寄出信→收信開驗證連結→驗證後登入」。→ **這整段是「一個 case」**：用它自己的一個 browser 走完整段 journey，於每個階段做截圖＋語意比對（即上一條「單一 case 內可多次截圖」）。此 journey 沿用的多個 E2E-NNN 編號 = **同一 case 內的多個截圖點，不是多個 case**。
  - **不要把承接式 journey 硬拆成多個獨立 case**：中間階段（如「已收到信的驗證連結結果頁」）依賴前段真實副作用（後端剛寄出、信箱實收），硬拆需偽造 state（seed 假 token / 跳過寄信），反把整合驗證做成假測試（殷鑑：本要驗「真實信件內含可用連結」，硬拆後變成只驗「我自己塞的 token 能開頁」）。判別句：**「中間某階段的前置，是不是前一階段的真實副作用造成、且無法用 seed 乾淨複製？」是 → 同一 case 多截圖；否（每階段都能獨立 seed）→ 可拆獨立 case。**

why 每 case new（而非用 `before` per-lang/per-describe 共用一個 browser 跑完整段）：①單 `--grep "E2E-NNN"` 跑單一 case 也能獨立成立（共用 browser 時單跑與全跑行為易不一致）；②共用 browser 需在 helper 內手動清 localStorage/狀態，易漏、前一 case 殘留會污染後一 case；③某 case fail 的殘留狀態不會傳染下一個。fresh launch 每 case ~1-2s 成本可接受，**不要為省時間改用 per-lang `before` 共用一個 browser 跑完整段**。

**診斷推論（重要）**：若 browser 已 per-case fresh、DB 也 per-case 重置，卻仍見「跨 case 資料殘留」（list 多一筆、看到別的 flow 建的資料）——**這不是測試設計或瀏覽器殘留問題**，要查 **backend/DB 服務層**：最常見是**多個 backend process 同連一個 lmdb**（某 flow 的 restartBackend spawn 了新 backend、手動多開、或中途砍 mocha 留孤兒），其中一個握著舊的 lmdb snapshot/快取，瀏覽器請求打到它就回舊資料。屬 pixel-mismatch 表成因 #1（DB 內容不同）的延伸：先確認「只剩一個 backend 連這個 DB」。

## e2e 連線端點一律 `127.0.0.1` 不用 `localhost`（Windows IPv6 Happy-Eyeballs 陷阱）

瀏覽器解析 `localhost` 先試 IPv6 `::1`；dev-server 常只綁 IPv4 → 每新連線多 ~150-200ms 回退。node fetch 不走 Happy-Eyeballs 所以 node 打不慢（誤判陷阱）。「請求慢」先做四象限隔離再決定要不要往 server 追：

| 對照 | 中招特徵 |
|---|---|
| browser → localhost vs 127.0.0.1 | 前者慢後者快 → 就是這問題 |
| browser vs node 打同一 localhost | browser 慢 node 快 → 確認 Happy-Eyeballs |
| `netstat -ano \| grep :PORT` | 只有 `0.0.0.0` 沒 `[::]` → server 純 IPv4 |

修法：baseUrl/apiUrl 集中在 `test/e2e-setup.mjs` export（值用 127.0.0.1）共用；DB 種子的 redir URL 用 `${baseUrl}` 衍生——頁面 origin 與 redir origin 必須一致，否則 localStorage token 跨 origin 不帶、登入態斷。殷鑑：曾把 e2e 每請求 186ms 當 server 瓶頸追鬼一整個 session，改 127.0.0.1 後 186ms→15ms。

## 截圖穩定性：截圖前必須達到 final stable state

穩定態被破壞有兩條獨立成因，分開治：①「還沒 settle」（冷啟 paint / CJK glyph lazy 光柵化 / GPU warm-up）→ retry-until-stable；②「settle 到錯的 state」（setTimeout delayed-reveal、hover/focus 殘留）→ 額外等 timer / park mouse。

**captureStable helper**（所有 pixel baseline 截圖——測試端＋regen 端——都用它，不用裸 `page.screenshot()`；放共用模組）：

```js
async function captureStable(page, opts = {}) {
    let { maxRetries = 8, intervalMs = 200, initialWaitMs = 500 } = opts
    let shotOpts = { fullPage: true, animations: 'disabled' }
    await page.waitForTimeout(initialWaitMs)  //等 setTimeout-based delayed-reveal 已 fire
    let prev = await page.screenshot(shotOpts)
    for (let i = 0; i < maxRetries; i++) {
        await page.waitForTimeout(intervalMs)
        let curr = await page.screenshot(shotOpts)
        if (curr.equals(prev)) return curr  //連續兩張一致 = settled
        prev = curr
    }
    return prev  //未 settle 回最後一張, 讓 byte-equal fail 揭露真 flake
}
```

負面斷言（已驗證無效的土辦法，別重走）：warmup dummy screenshot（打破其他 baseline）、`document.fonts.ready`（只保證 layout 不保證 paint）、拉長固定 waitForTimeout、雙重 rAF 偵測（對 paint/GPU 冷啟無效）。直接從 retry-until-stable 起跳。

**超出容差的 pixel 差是決定性的——永遠有具體成因，禁止歸「warm-state 微差/已知限制」收尾**（反鋸齒次像素已由 `assertBaselineMatch` 的 pixelmatch AA 偵測 + `maxDiffPixels` 自動吸收、不算 fail；會 fail 的是「真不同像素數 > maxDiffPixels」的真差異）。先看 `./testPending` 的 `__diff.png`（pixelmatch 已標出真差異區）或自行 diff 定位（sharp/imagemagick 框 bounding box），再對照下表；歷次逐一 diff 命中率 100% 都是具體成因：

| # | 成因 | 徵狀 | 解法 |
|---|---|---|---|
| 1 | DB 內容不同 | 差異落在資料區（列數/欄值/統計） | hermetic DB 重置；查跨流程殘留 |
| 2 | 動畫未停（CSS/SVG SMIL/canvas） | 差異在會動的元件 | pauseAnimations；SMIL 凍不到→遮黑；動態數據→遮罩 |
| 3 | 延遲特效（setTimeout reveal） | 同畫面忽有忽無某元素、寬度差幾 px | captureStable `initialWaitMs` 等 timer fire |
| 4 | hover/focus 殘留 | 點擊後滑鼠停在元件上拍進 hover 態 | 截圖前 `page.mouse.move(0,0)` + 等動畫 |
| 5 | async 未 settle（font/paint/glyph） | 首次渲染整體微差 | captureStable retry 等 settle；settle 後殘留的反鋸齒次像素由 pixelmatch AA 偵測吸收（非盲目接受微差） |

分流（取代舊「不接受 N bytes 微差」一刀切）：**①反鋸齒次像素 noise**（SVG icon / 字型邊緣，肉眼等同，跨 session raster 不決定性）→ 由 `assertBaselineMatch` 的 pixelmatch `includeAA:false` + `maxDiffPixels` 容差**自動吸收**，不必 chase、不必遮罩、不必 `--disable-gpu` 等 flag 體操；**②真會動的動態內容**（資料/動畫/canvas 怎麼等都不穩）→ **遮罩**該區域；**③超容差的真差異**（>maxDiffPixels）→ 照上表查**具體成因**，不是放寬 maxDiffPixels 將就。

`animations: 'disabled'` 只 fast-forward CSS animations/transitions，**不會 fast-forward `setTimeout`**——retry 只保證「某 state 穩定」不保證是 final state（timer 前後兩個 state 各自都穩定 → 隨機收斂），故 `initialWaitMs=500` 必要（對 300ms 級 timer 給 1.6× buffer）。

**點擊後 capture 前必 park mouse**（canonical，經驗證）：

```js
await page.mouse.move(0, 0)        //park 到左上角離開所有互動區
await page.waitForTimeout(1500)    //等 hover-leave + chain animation settle (500ms 對 chain 不夠)
return await captureStable(page)
```

撞 byte 不穩第一直覺別猜花俏機制（mount race / ResizeObserver），先試 mouse park——hover 殘留是最常見最易解成因。

操作規矩：baseline 產製順序與 mocha 全跑順序一致、regen 用 fresh-per-lang browser；case 順序變動須完整 regen 該 lang。「同序」是防禦性對齊，不是「不同序就不用查」的藉口——--grep 單跑與全跑結果不同先照表查 1-4 類（尤其 DB state）。

## Timing flake 是 e2e 範疇內的工程問題，自己 iterate 修

分流問句：「給它無限時間，這 case 會穩定通過嗎？」會 → 純 timing flake 自己修（加 wait → 改 wait-for-stable 等具體 ready 訊號 → 連續兩 rAF layout 不變 → 加到 5 秒還 flake 才隔離為真問題找使用者）；不會 → 真問題（spec 不確定 / production bug）才問使用者。反模式：把 timing flake 包裝成「要試 A 還是 B」的設計選擇拋給使用者；為規避 flake 拿掉 pixel 斷言層級。

## 偵測 driven 的步驟流程（取代 fixed sleep 猜時序）

每步驟先偵測對象存在/就緒才進下一步。fixed sleep 太短點空 body、太長浪費時間、跨環境 flake。標準 helper：

```js
//每步驟先偵測對象出現再操作, 超時拋錯 = 真實異常. fn 跨 process 序列化執行不能 closure, 傳值用 arg.
async function waitUntilExist(page, label, fn, opts = {}) {
    let { timeout = 10000, arg = null } = opts
    try { await page.waitForFunction(fn, arg, { timeout }) }
    catch (err) { throw new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`) }
}
//用例: waitUntilExist(page, 'login inputs', () => document.querySelectorAll('input').length >= 2)
```

**跨頁 redirect 場景：固定 buffer + 偵測 target，缺一不可**——舊頁殘留 DOM 不會立刻清空，直接偵測 target marker 會 false-positive 或 race：先 `waitForTimeout(10000)` 等 redirect 啟動（跨頁 redirect + mount + hydration 鏈的安全 margin，他專案重新校準；SPA 內部 navigation 不需這麼長），再 `waitUntilExist` 偵測 target 頁確定 marker。

可單獨用 `waitForTimeout` 的場景僅：跨頁 redirect 前 buffer、input 出現後 type 前 1s settle buffer（Pattern D）、截圖前 final settle（captureStable 已含）。其餘都用 waitUntilExist，不為保險加 fixed sleep。

## e2e 的 act 階段必須走 user-facing input

e2e 的 act 起點是鍵盤滑鼠，不是 JS API——否則 framework state mutation 讓 input 永遠拿到 value、測試永遠綠燈，真實使用者可能連 focus 都拿不到，production bug 永遠 hide。檔名叫 `e2e-xxx` 但 act 用 evaluate + vm.method → 正名為 integration test 或重寫。

**操作層級表（L1-L3 允許，L4-L6 禁用）**：

| 層級 | API | act 階段 |
|---|---|---|
| L1 真鍵盤 | `keyboard.type` / `pressSequentially` / `keyboard.press` | ✅ 文字輸入正解 |
| L1.5 IME 注入 | `keyboard.insertText`（1 個 input event） | ✅ Vue v-model / React controlled 解 race 用 |
| L2 真滑鼠 | `page.mouse.click(x, y)` | ✅ 絕對座標（特殊情境） |
| L3 Locator | `locator.click()` / `dblclick()` / `check()` | ✅ 點擊預設 |
| L4 偷工 | `locator.fill(v)`（直接設 value，跳過 focus/mousedown/keydown） | ❌ hide 一整類 focus bug |
| L5 | `page.evaluate(el.value=X)` / `dispatchEvent` | ❌ 純 DOM 操作不算 e2e |
| L6 | `vm.method()` / `vm.field = X` | ❌ 框架 state 直改不算 e2e |

**文字輸入 Patterns**：

- **Pattern A（input 常駐頁面）**：`inp.waitFor({state:'visible'})` → `inp.click()` → `waitForFunction(activeElement 是 INPUT)` 驗 focus → `keyboard.type(value)`。
- **Pattern B（ag-grid cell editor）**：cell `scrollIntoViewIfNeeded` → `dblclick()` 啟動 editor → editor `waitFor visible` → `waitForTimeout(1000)` settle → 清空（End + Backspace × N，不用 Ctrl+A）→ `keyboard.type` → Enter 提交。
- **Pattern C（最推薦簡寫）**：`inp.pressSequentially(value)`（不自動清空，需先 clear）。
- **Pattern D（Vue v-model / React controlled——A/B/C 在此會漏字，必用 D）**：`keyboard.type` 逐字觸發 re-render，DOM input 可能被替換 → 焦點瞬間離開 → 後續 keystroke 落到 body → 漏字（觀察過 11 字只進 1 字；`delay:50` 仍漏，加 pre-buffer 也不治逐字 race）。

```js
//Pattern D: 偵測 → 1s pre-buffer → insertText 一次 inject → 驗證 → retry × 3
async function typeIntoInput(page, locator, value) {
    await locator.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(1000)  //editor mount / focus settle
    for (let attempt = 1; attempt <= 3; attempt++) {
        await locator.click()
        await page.waitForFunction((el) => document.activeElement === el, await locator.elementHandle(), { timeout: 3000 })
        let cur = await locator.inputValue()
        if (cur) { await page.keyboard.press('End'); for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace') }
        await page.keyboard.insertText(value)  //1 個 input event 1 次 re-render, 從根避開逐字 race
        await page.waitForTimeout(200)
        if ((await locator.inputValue()) === value) return
        await page.waitForTimeout(400)
    }
    throw new Error(`typeIntoInput 3 次仍漏字`)
}
```

`insertText` 對應「貼上/IME 確認」的真實 user input 路徑（經 input pipeline、需 click+focus 在前），不是 `.fill()` 那種直接設 value。選擇：純 HTML input → A/B/C；Vue v-model / React controlled → D；應用程式 hook `@keydown` 逐字驗證 → A/B/C（必須走真 keydown）。判斷：grep 該 input 有無 `@keydown` 監聽。

**焦點驗證**：click 後驗 `activeElement`，把「焦點被 `@mousedown.prevent` 攔截」的 silent fail 從最後比對提早到 click 後立刻發現；內建進每個 fillX helper。

**setup 階段例外（L4-L6 唯一合法用途）**：`before()` 準備前置資料（DB users/tokens）可用直接 API——那是「假設世界已是某狀態」；進到 `it()` 的 act 階段必須切回真實 UI input。`.fill()` 唯一合法用途也在 setup 預填。

**UI 元件難操作**：①查官方 e2e 範例/playwright recipe ②grep 既有專案處理範例 ③真不行 → 停下討論換元件/降級手動 UAT，不偷工降級 L4-L6。

## Assert 階段必須走 user-facing observation，不能退回 DB-only

與 act 對稱：assert 以「使用者實際觀察得到的觀察點」為主，DB/內部 state 只能補強不能取代。

Reflex check 5 條：①這條 assert 是 spec 要求的還是我選最容易驗的？②spec 內 UI 描述我有翻成 assert 嗎？③我是否把 DB 寫入當最終真相（它只是 trigger 結果）？④spec 的多 step 動作鏈我有走完嗎？⑤assert 規範比 act 稀薄不代表 assert 可以隨便。

三條硬規則：

1. **spec 含「畫面/顯示/轉跳/卡/出現/看到/跳轉/進入/看不到」等觀察字眼，必須有對應 UI 斷言**：「顯示帳號已被封鎖」→ `pageText.includes(...)`；「轉跳使用者資訊頁」→ url match + 頁面內容；「看不到 X」→ `includes('X') === false`；「成功登入後…」→ 真走完登入動作鏈再驗。spec 沒提 UI 觀察（純後端 trigger）才能 DB-only。
2. **每條 assertion 加註解標明對應 spec 哪一句**；對應不到的＝現狀指紋，刪或回 spec（全域規範 §6.2）。
3. **spec 描述「N step 後 → 觀察 M」的動作鏈，e2e 必走完整鏈條**：先把 spec 句子拆成動作清單，e2e 步驟須等於或多於 spec 動作數，不可在某 step 提早停手（如「成功登入後於 IPs 表可查到」＝登入動作鏈 + 跳轉驗證 + 查表四步，不能只做第一與最後）。

回查 checklist：圈出 spec 所有觀察字眼逐一對 assertion；後續動作（「再進」「等 N 秒」）都有對應步驟；DB-only case 補 UI 斷言；步驟少於 spec 動作數的補完。

## 高頻 API 調用 + 模擬連線 IP

- **高頻調用走 browser 的 networking stack**（`page.evaluate` 內 `Promise.allSettled` 並行 fetch），不從 test runner 直接打（跳過 browser stack 屬 integration 不算 e2e）。allSettled 不因中途被封鎖 reject 而中斷。browser 同 origin 最多 6 連線會 queue 但仍比序列快；rate limit 是 in-memory 計數不會打爆 DB；門檻太高可暫調小 settings 加速。
- **模擬不同 client IP 用 `page.setExtraHTTPHeaders({ 'X-Forwarded-For': '1.2.3.4' })`，絕不直接封 127.0.0.1**（會自鎖：test runner 自己被擋，後續清理全失效）。page-level 設定影響該 page 後續所有 request，不同 page 互不影響。
- **fail-closed（IP 取不到）場景 e2e 層級無法觸發**（任一 fallback 都有值），降到 unit test mock req 物件。

## 用 w-screenctl 探索 e2e 卡點

e2e 測試本體永遠用 Playwright；w-screenctl（port 7000）只是探索工具。第三方/自訂元件難找穩定 selector 時禁止偷工改 vm.method，先用 w-screenctl 探索。**探索時 image 輸出優先於 text 輸出**——LLM 偏好 text 會漏掉只有視覺層才看得到的訊號（警告 icon、tooltip 殘留、console 錯誤、破版）。

流程鐵律：①`curl :7000/health` 確認啟動 → ②**第一個動作必須 navigate + screenshot**（screenshot 端點回 JSON wrapper，須 `jq -r .image | base64 -d` 解出再 `file` 驗 magic number，詳全域規範 §5.5——偽圖檔 Read 進 API 會讓 session 永久 400 變磚）→ ③視覺確認後才 evaluate 查 DOM → ④試點擊/鍵盤驗證互動 → ⑤穩定 selector 寫回 Playwright。**連續 evaluate 三次以上沒截圖 = 立刻停下截圖**。

Selector 優先序：①語意（getByRole/getByLabel/getByText）→ ②data-fmid（在 .vue 加，非侵入）→ ③結構 selector（nth-child/xpath，fragile）→ ④坐標。**降級到 2/3/4 必須經使用者同意**：先窮盡①的變體（含 i18n 字串、巢狀組合），告知試過哪些與 fail 原因，使用者同意才動手；不默默 fallback。

## E2E test 的 lifecycle 對稱性：進場自動啟動 ↔ 離場 cleanup

任何「進場 spawn 依賴資源」的 script，離場就 cleanup 自己 spawn 的（不誤殺別人手動啟動的）。e2e 常有「框架測試」與「直跑產 baseline」兩種出口模式，共用同一 setup+cleanup lifecycle。

**進場**：偵測 port——已被佔用 → reuse；沒人 → spawn 等 ready。內部 flag 防多次呼叫。框架/直跑共用同一啟動函式。

**離場死結機制**：spawn 的 child 預設 hold parent event loop ref，而 `process.on('exit', cleanup)` 要等 event loop 清空才觸發 → 互鎖 → 主邏輯跑完 process 永不 exit。`beforeExit` 同問題；單獨 `unref()` 會讓 cleanup 沒人觸發變孤兒；`process.exit(0)` 掩蓋問題——都不要用。

**正解：cleanup 同一函式、兩個觸發來源都到位**：

1. 框架環境——共用 setup 模組註冊框架 root teardown hook：

```js
if (typeof globalThis.after === 'function') {
    globalThis.after(function() { this.timeout(20000); cleanup() })
}
```

2. 非框架直跑（`node test/xxx.test.mjs --flag`）——`globalThis.after` 是 undefined，每個有直跑分支的檔須 import cleanup 並在主函式末尾顯式呼叫 `cleanup()`。

保留 `process.on('exit')` / SIGINT / SIGTERM handlers 當 Ctrl+C 備援。

**診斷順序（先實測再推論，不先拋「應該是 unref 缺漏」這類猜測）**：①`wmic process where parentprocessid=<pid>` / `pgrep -P` 看 spawn 了哪些子進程 → ②冷啟 vs 熱啟差異實驗（port 已佔用時 reuse 不 spawn → 乾淨退；冷啟才卡，CI 必冷啟所以 CI 才踩到）→ ③grep spawn 位置 → ④看 cleanup 註冊位置。

**Audit checklist**（任何 import 啟動函式的檔）：①共用 setup 是否含框架 root teardown hook？②有直跑分支的檔主函式結尾是否呼叫 cleanup？**Audit 時 grep 整個 e2e 目錄一次，不是修一個檔就罷手**：

```bash
grep -lE "process\.argv\.includes" <test-dir>/*.test.mjs | while read f; do
  if ! grep -q "cleanup()" "$f"; then echo "MISSING cleanup(): $f"; fi
done
```

**規則須 artifact-anchored（本技能自身設計原則，必留）**：同款 hang 曾一個 session 內累犯 3 次，根因是規則標題寫「框架跑完不退」→ 直跑模式時觸發詞沒命中。修法：規則錨定 artifact（「接觸 spawned server 的 script」）、明列兩條觸發來源、Audit 強制掃全部同類檔。行為層教訓：發現 recurring bug，第一動作是 grep 全 repo 找同 pattern 所有檔一起修，不是只修當下檔。
