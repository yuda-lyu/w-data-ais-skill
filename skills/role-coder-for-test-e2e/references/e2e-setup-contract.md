# e2e-setup 落地契約：參考實作、最小可執行骨架、audit

對應 SKILL.md §3。**函式名可依專案慣例改，行為不可少**。以下片段中的 `$vo` / `csLogin` / WDrawer / ag-grid / eng-cht 為姊妹專案（Vue 2 + w-component-vue）**範例**；換框架時只替換「登入就緒條件」「settle 訊號」「表格 editor」三處 adapter。

## 0. 最小可執行骨架（clean-room 驗證過，2026-09-01）

[minimal-skeleton/](minimal-skeleton/) 內為一個不依賴任何業務專案的完整範例：靜態頁 + 靜態 server + 契約實作 + 一個雙語 case。在任何已安裝 `playwright`、`sharp`、`pixelmatch`、`pngjs`、`mocha` 的 Node 專案內：

```
minimal-skeleton/
  srv.mjs                    靜態服務 (port 18090; /health 回 { project } 供 reuse 辨識)
  app/index.html             輸入 + 按鈕 + 300ms 延遲顯示訊息 + CSS spinner
  test/tools/e2e-setup.mjs   C1/C2/C5/C6/C7/C8/C9/C10/C11/C13/C14 實作 (約 220 行；輔助工具放 test/tools/，不帶 .test.)
  test/e2e-hello.test.mjs    E2E-001 × eng/cht：真人輸入 → 點按鈕 → 偵測訊息 → 紅框截圖 + 遮罩 → 語意斷言 → 比對
```

```bash
npm i -D playwright sharp pixelmatch pngjs mocha && npx playwright install chromium
npx mocha test/e2e-hello.test.mjs --reporter list --timeout 60000 --baseline   # regen → test/pics/hello/hello-{eng,cht}-E2E-001-greet.png
npx mocha test/e2e-hello.test.mjs --reporter list --timeout 60000              # 比對 → 2 passing；cleanup 後 netstat 無 18090
```

要單獨跑某檔用自行編寫之指令：`npx mocha test/e2e-<flow>.test.mjs --reporter list --timeout N`；測試混雜或相依時由套件自建獨立程序／專用資料來源，逐檔隔離 runner（`node test/tools/run-e2e-isolated.mjs`）即其一。ESM：`"type": "module"` 或 `.mjs`。

## 0.5 參考實作套件：w-package-tools-e2e（2026-09-28 起四個姊妹專案共用）

下列各節之片段為**契約說明**；實際共用實作在 `w-package-tools-e2e/src/<模組>.mjs`（專案以 devDependency 安裝，1.0.2 起；規格與 API 見套件 `README.md`）。專案一律經 `test/tools/e2eLib.mjs` **單一橋接檔**轉出（升版只改 `package.json` 版號；套件新增模組時橋接檔補一行轉出，如 1.0.3 之 `probeStuckTooltip`。升版之差異清單要含套件之 `dependencies`：src 逐檔相同而 playwright 升版者，截圖用之 Chromium 即換版——比 `node_modules/playwright-core/browsers.json` 之 chromium revision 新舊，不同即全部標準圖比對；1.0.6 實例為 revision 1234 → 1243、Chromium 151 → 153），共用層 `test/tools/e2e-setup.mjs` 只保留專案組態（port、spawn、種子、settle 組合、夾邊方式）與專案專屬互動原語，匯出名稱與簽章維持不變。

| 契約 | 套件模組（皆 default export） | 專案組態點 |
|---|---|---|
| C1 | `launchBrowser`、`chromiumLaunchArgs`（六旗標） | 無 |
| C2 / C3 | `createServiceManager`（reuse 政策；`failureMode:'once'｜'sticky'`；`restart` 殺自建後等 port 釋放、殺後仍被佔或無自建而被佔時 `killForeignOnRestart` 才殺監聽者；服務之 `beforeSpawn({phase,hookArg})` 做「spawn 前必須完成」之前置如 build、重建資料庫）、`registerCleanupHooks`（root after＋exit／訊號備援，可給 `teardown` 與自訂訊號）、`createTempSettings`（`forbiddenKeys`）、`probeHttp`（`accept`、`identify`）、`killPortListeners`／`listenerPids`／`parseListenerPids`（port 政策原語，只可用於映射表登錄之專屬 port）、`killOwnTree`／`isChildAlive`／`waitChildExit`／`pidExists`／`sleepSync`（所有權原語） | 服務清單、探測判準、是否殺外部監聽者；own 政策（只用自建、port 被佔即拋錯、跨行程互斥）未入套件 v1，沿用專案自建 harness |
| C5 | `openCasePage(browser, { contextOptions, onDialog })` | viewport 等確定性參數 |
| C6 | `captureStable`（`settle[]`、`beforeShots[]`、`strict`／`strictDefault`、`maskImgSmil`、`imgSmilFill:'static'｜'black'`（`<img>` 內 SVG 動畫區貼去動畫之靜態影格，預設 static；black 僅供等價對照）、`smilRectBasis`、`shotOpts`）、`waitColResizeOverlay`、`waitDrawerReady`、`resetAgGridScroll`、`probeStuckTooltip(page, { rootSel, createError })`（1.0.3 起；`beforeShots` 掛鉤：游標已移開後仍顯示之 hover 型提示框（w-component-vue WTooltip `mode='tooltip'`）即拋錯，SKILL §10〈提示框／hover 殘留〉） | settle 組合、strict 來源、殘留時之錯誤訊息 |
| C7 | `captureStableWithBox`（`clampTo:'buffer'｜'viewport'`、`guardSmall`、`mask`、`capture` 注入；目標找不到／尺寸 0／夾邊後過小即**拋錯**，`allowNoBox:true` 才容許無框；**被蓋住檢查** `coverCheck:'throw'｜'warn'｜'off'`（預設讀 `E2E_COVER_CHECK`，未設為 throw）；target 另接受**量測型目標** `{ scroll, measure(page), label, probe }`，`probe` 供被蓋住檢查）、`gridContentBox(表格外框, { noRowsSel, noRowsPad })`（標頭∪可見資料列，空表為標頭∪「無資料」訊息；訊息為無邊界文字，1.0.3 起其矩形外擴 `noRowsPad`＝`INK_PAD` 後取聯集（原以元素矩形為界，字形距框內緣僅 3–4px，低於 SKILL §7.3-8 約 5px 之要求；空表截圖之框底因此下移 4px，`noRowsPad:0` 為舊行為））、`itemsUnionBox(項目選擇器或 Locator, { within, scroll, fit, inkPad })`（可見項目聯集；fit 依元素有無可見邊界：有者量元素本身，無者量可見內容（有邊界之子元素與文字）並整體外擴 inkPad＝4（恰為單一有邊界元素者視同框該元素），免紅框壓字，SKILL §7.3-8；fit 另使框線不蓋框外內容——框線置於與相鄰項目**可見範圍**之間隙正中（鄰項有邊界者取元素框，否則取子元素與文字之聯集；空白間隔不算鄰項；四向各取最近一層）；position:fixed 浮層外之內容以命中測試找，框線置於浮層內容與浮層外內容之間隙正中（四周空白照常外擴），SKILL §7.3-9）、`inkRect(矩形, { pad, neighbors })`／`INK_PAD`（canvas 等無 DOM 之緊貼墨跡矩形外擴；neighbors 為鄰項之可見矩形，框線不越過間隙正中）、`canvasInkRects(page, 矩形陣列, { canvas, alpha, bg, trimY })`（讀 canvas 像素把圖表庫回報之寬鬆矩形收斂到實際墨跡，無墨跡回 null；交 inkRect 前用）、`composeBox` 匯出 `BOX_PAD`／`BOX_STROKE`（框幾何常數，量測端據以置中框線）、`composeBox`（`onSkip` 回呼）、`rowBoxSel(i, { order, scope })`、`stepShots`（每步兩張之單步：框目標 → 操作 → 等反應 → 框反應；`before:null`＝兼任） | 夾邊方式（映射表登錄偏離）、整列容器順序 |
| C8 | `maskRegions`、`overlayRegions`、`overlayImageAt`、`cropRegion` | 不可固定之值（產製時間、耗時等）之矩形量測與比對端覆蓋函式（下方 C8 之 `coverUnfixableForCompare`，放專案共用層一處） |
| C9 | `assertBaselineMatch`（只比對不寫檔：原 `regen` 旁路 2026-09-28 移除、傳入即拋錯；計數逾上限 `headroomRatio`（0.5）印 `[baseline-headroom]`） | — |
| C10 / C11 | `typeIntoInput`、`typeIntoNthInput`、`waitUntilExist` | 預設逾時 |
| C12 | `waitGridIdle`（ag-grid：列內容＋容器／標頭／列幾何＋捲動量簽章連續穩定） | 範圍、必要選擇器 |
| C13 | `runBaselineCase`（1.0.3 起產製端逐張印 `[write]`／`[keep]` 與原因，如 `diff=8343px`、`withinTolerance(diff=0px)`）、`createBaselineGate`（全部案例模式含 compareOnly；`finalize()` 孤兒檢查）、`findOrphanBaselines`、`normalizeShots`、`createKnownDefect`、`getE2eMode` | cases 宣告 |
| 驗證 | `compareImageDirs`（另報 `rgbaDiff`／`rgbaDiffBox`；`equivalent`＝RGBA 相同或只差登錄漂移點 `drift`）、`snapshotBaselines`、`diffBaselineSnapshots`、`runIsolatedE2e`（1.0.3 起 `targets: [{ file, grep }]` 只重跑受影響案例，每檔仍換新後端並自動加 `--fail-zero`（grep 對不到任何案例即失敗）；有本地 mocha（`mochaBin`，預設 `node_modules/mocha/bin/mocha.js`，以 `projRoot` 解析，明確給定而不存在即拋錯）時以 node 直接執行、不經 shell，參數原樣送達；無本地 mocha 時退回 `npx`，Windows 下經 cmd.exe 重新解析——`\|` `&` 切出另一指令、`<` `>` 轉向、`^` `"` 被吃、空白拆開、`%名稱%` 展開（多數 exit 0，靜默改變篩選），故參數含空白或 `" & \| < > ^ %` 即於執行前拋錯；括號與 `[ ]` 不受影響）、`assertTextSpec`／`pageHasText`／`collectDomText` | 登錄漂移點 |

**遷移協定（證明零標準圖變動）**：①遷移前 `snapshotBaselines('./test/pics')`；②以現行碼產到暫存目錄（`E2E_BASELINE_OUT_DIR=./test/_tmp/eqv-0`，舊碼無此支援時先只補寫出路徑一行）得對照組；③只換原語（共用層）再產；④換管線（測試檔）再產；各與標準圖以 `compareImageDirs` 分層比對（位元組相同 ⊂ RGBA 相同 ⊂ 容差內），不同者逐張定位差異並歸因；⑤`--write-mode changed` 實跑須零寫出；⑥mocha 全跑＋`--grep` 單跑、逐檔 runner 全跑；⑦`diffBaselineSnapshots` 須 unchanged 且 `git status --porcelain -- test/pics` 為空。**參考片段自舉（`_ref` 類）不經管線、不受暫存目錄影響**，遷移前須確認該類檔案皆已存在，否則等價驗證會寫進正式目錄。

## C1 launchBrowser

```js
import { chromium } from 'playwright'
const chromiumLaunchArgs = [
    '--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text',
    '--disable-font-subpixel-positioning', '--disable-skia-runtime-opts', '--disable-partial-raster',
]
export async function launchBrowser() { return await chromium.launch({ headless: true, args: chromiumLaunchArgs }) }
```

測試端、regen 端、探查腳本全部走 wrapper。旗標組改動＝全量重產，先授權。

## C2 startServersOnce / cleanup

```js
let spawned = [], startedBackend = false, startedFrontend = false
function httpOk(url, timeoutMs = 2500) {            //health 應回專案識別（如 { project:'w-web-xxx' }），reuse 才不會認錯服務；認不出 → 不 reuse，另選 port 或 fail-fast
    return new Promise((resolve) => {
        const req = http.get(url, (res) => { let s = ''; res.on('data', (d) => { s += d }); res.on('end', () => resolve(res.statusCode === 200 && s.includes(PROJECT_ID))) })
        req.on('error', () => resolve(false)); req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
    })
}
async function waitPort(url, label, timeoutMs) { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { if (await httpOk(url)) return; await new Promise((r) => setTimeout(r, 500)) } throw new Error(`等待 ${label} 逾時`) }
function spawnSrv(name, cmd, args, opts = {}) { const child = spawn(cmd, args, { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], ...opts }); child.stdout.on('data', () => {}); child.stderr.on('data', () => {}); spawned.push({ name, child }); return child }
export async function startServersOnce({ backendOnly = false } = {}) {
    if (!startedBackend) { startedBackend = true; if (!(await httpOk(`${apiBaseUrl}/health`))) { await seedDb(); spawnSrv('backend', 'node', ['srv.mjs']); await waitPort(`${apiBaseUrl}/health`, 'backend', 60000) } }
    if (backendOnly) return                                                     //單一 started 旗標會讓前端永遠沒被 spawn
    if (!startedFrontend) { startedFrontend = true; if (!(await httpOk(baseUrl))) { spawnSrv('frontend', 'npm', ['run', 'serve', '--', '--port', String(FRONTEND_PORT)], { shell: isWin }); await waitPort(baseUrl, 'frontend', 180000) } }
}
export function cleanup() {                          //同步殺：exit handler 內非同步 spawn 不會被等待
    for (const { child } of spawned) { try { isWin ? execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' }) : child.kill('SIGKILL') } catch (e) {} }
    spawned = []
}
if (typeof globalThis.after === 'function') { globalThis.after(function() { this.timeout(20000); cleanup() }) }
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130) }); process.on('SIGTERM', () => { cleanup(); process.exit(143) })
```

前端服務模式二選一並寫進映射表：(a) dev server（port 與他專案錯開）+ proxy `/api`；(b) 先 `npm run build`，由後端同時 serve `dist` 與 API（server 注入語系類測試須此模式）。api 測試層若第三方 client 無法 close（內部 `setInterval`）→ root `after` 註冊 `process.exit()` 並註解原因。hermetic seed：初始化腳本為 upsert 時先刪整個 DB 目錄再跑，偵測 stdout 完成訊號（如 `finish.`）才視為 ready。

## C3 restartBackend + genTempSettings（條件式）

```js
let tmpSettingsFiles = []                                  //本進程建立者, cleanup() 逐一刪除（測完即刪）
export function genTempSettings(overrides = {}) {
    const base = JSON5.parse(fs.readFileSync(join(projRoot, 'settings.json'), 'utf8'))   //原檔含註解/單引號
    const p = join(testDir, '_tmp', `settings-e2e-${process.pid}-${seq++}.json`)        //test/_tmp/（gitignore）, 絕不放專案 ./tmp/（AI 暫存區隨時清）；testDir 見 C14
    fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify({ ...base, ...overrides }, null, 2)); tmpSettingsFiles.push(p); return p
}
function cleanupTempSettings() {                            //由 cleanup() 呼叫
    for (const p of tmpSettingsFiles) { try { fs.rmSync(p, { force: true }) } catch (e) {} }
    tmpSettingsFiles = []
    try { const d = join(testDir, '_tmp'); if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d) } catch (e) {}
}
export async function restartBackend(pathSettings = './settings.json', envOverride = null) {
    //1. 殺自己 spawn 的 backend  2. port 仍被佔（reuse 或手動啟動之同專案後端）→ OS 層 netstat/taskkill（posix lsof/kill）——明文例外，前提：該 port 專屬本專案
    //3. 等 port 真釋放（≤5s）  4. spawn 帶 settings 路徑，env 淺合併 envOverride（讓 .env 同名鍵失效）  5. waitPort
}
```

用法：`before: await restartBackend(genTempSettings({ language: 'cht' }))`；`after`（`try/finally`）：`await restartBackend('./settings.json')`。

## C4 DB 重置（條件式，兩種合法作法）

```js
export async function resetToBaseSeed() { await clearTables([...]); await insertBaseSeed() }          //(a) 直接 DB API
export async function resetDb(browser, seed) {                                                          //(b) throwaway page，不在 case page 上做
    const page = await openApp(browser)
    await page.evaluate((s) => window.$vo.$fapi.updateItems(s), seed)
    await page.waitForFunction((n) => window.$vo.$store.state.items.length === n, seed.length, { timeout: 15000 })
    await page.context().close()
}
```

`resetDb` 須放 setup 模組共用（七個測試檔各自複製一份＝補丁堆積）。

## C5 openApp / setLang（條件式）

```js
export async function openApp(browser, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
    await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {   //【adapter】登入態 + 譯文就緒；換框架改此條件
        const vo = window.$vo, st = vo && vo.$store && vo.$store.state
        return !!(st && st.connState === 'csLogin' && st.webInfor && st.syncState === true && vo.$t && vo.$t('mmUsers') !== 'mmUsers')
    }, null, { timeout: 60000 })
    return page
}
export async function setLang(page, lang) {
    if (lang !== DEFAULT_LANG) { await page.evaluate((l) => window.$vo.$ui.setLang(l, 'e2e'), lang) }   //setup 例外
    await page.waitForTimeout(600)   //預設語系也補等量 settle
}
```

## C6 captureStable

```js
export async function captureStable(page, opts = {}) {
    const { maxRetries = 8, intervalMs = 200, initialWaitMs = 1500, strict = false } = opts
    const shotOpts = { fullPage: true, animations: 'disabled' }
    await page.mouse.move(0, 0); await page.waitForTimeout(initialWaitMs)
    await waitOverlayOpacity(page)         //【adapter】抽屜拖曳分隔條 opacity=1（≤5s），無此元件可省
    await waitDrawerReady(page)            //【adapter】[state] 全為 opened/hidden
    await page.evaluate(() => { document.querySelectorAll('svg').forEach((s) => { try { s.pauseAnimations(); s.setCurrentTime(0) } catch (e) {} }) })
    await page.evaluate(() => document.fonts && document.fonts.ready)
    await page.evaluate(() => { document.querySelectorAll('.ag-body-horizontal-scroll-viewport').forEach((e) => { e.scrollLeft = 0 }) })   //【adapter】表格水平捲軸歸零
    const rects = await detectImgSmilRects(page)
    let prev = await maskRegions(await page.screenshot(shotOpts), rects)
    for (let i = 0; i < maxRetries; i++) {
        await page.waitForTimeout(intervalMs)
        const curr = await maskRegions(await page.screenshot(shotOpts), rects)
        if (curr.equals(prev)) return curr //settle 判斷刻意 byte-exact
        prev = curr
    }
    if (strict) throw new Error(`captureStable ${maxRetries} 次仍未 settle（regen 拒絕寫入未穩定畫面）`)
    return prev
}
async function waitOverlayOpacity(page) {   //【adapter】WDrawer 拖曳分隔條：以 inline style 之 cursor 辨識（Vue 正規化後冒號後有空格，兩種寫法都要），opacity 以數值比較
    await page.evaluate(async () => {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
            const bars = Array.from(document.querySelectorAll('[style*="cursor:col-resize"], [style*="cursor: col-resize"]'))
            if (bars.length === 0 || bars.every((b) => parseFloat(getComputedStyle(b).opacity) === 1)) return
            await new Promise((r) => setTimeout(r, 50))
        }
    })
}
async function waitDrawerReady(page) {
    await page.waitForFunction(() => { const ss = Array.from(document.querySelectorAll('[state]')).map((e) => e.getAttribute('state')).filter((s) => ['hidden','opening','opened','hiding'].includes(s)); return ss.length === 0 || ss.every((s) => s === 'opened' || s === 'hidden') }, null, { timeout: 10000, polling: 100 }).catch(() => {})
}
async function detectImgSmilRects(page) {   //頁面座標（視窗座標＋捲動量）＝全頁截圖之座標系；src 可能是 base64 或 URL 編碼兩種
    return await page.evaluate(() => Array.from(document.querySelectorAll('img')).filter((i) => {
        const src = i.src || ''
        if (!src.startsWith('data:image/svg+xml')) return false
        let d = ''
        try { d = src.startsWith('data:image/svg+xml;base64,') ? atob(src.slice(26)) : decodeURIComponent(src) } catch (e) {}
        return /<animate/i.test(d)
    }).map((i) => { const r = i.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } }))
}
```

**`<img>` 動畫區必須用頁面座標**（2026-09-28 查得之潛在缺陷，四個姊妹專案原皆用視窗座標）：頁面捲動後以視窗座標遮罩會落在錯的位置，動畫本身露出；且 Chrome 會暫停視窗外 `<img>` 之動畫，連拍因此「穩定」於一個不固定之影格——截圖看似 settle、跨執行卻不同。頁高不超過視窗之頁面兩者等價，故多年未被觀察到。套件 `captureStable` 之 `smilRectBasis` 預設 `'page'`（`'viewport'` 只供重現舊行為做等價對照）。

## C7 captureStableWithBox（紅框後合成）

```js
async function resolveRects(page, items) {   //Locator → boundingBox；CSS 字串 → getBoundingClientRect
    const rects = []
    for (const it of items) {
        if (it && typeof it.boundingBox === 'function') { const bb = await it.first().boundingBox(); if (bb) rects.push(bb) }
        else { const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const rc = e.getBoundingClientRect(); return { x: rc.left, y: rc.top, width: rc.width, height: rc.height } }, it); if (r) rects.push(r) }
    }
    return rects
}
export async function captureStableWithBox(page, target, opts = {}) {
    const items = Array.isArray(target) ? target : [target]
    const first = items[0]; await (typeof first === 'string' ? page.locator(first).first() : first.first()).scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300); await page.mouse.move(0, 0)
    //目標、遮罩、捲動量「皆在截圖之前」量（同一時點，截圖後再量會量到截圖期間之變動）
    const rects = await resolveRects(page, items)
    const env = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, sx: scrollX, sy: scrollY }))
    const maskRects = opts.mask ? await resolveMaskRects(page, opts.mask, env) : []   //sel 或 { sel, fixedWidth }
    let buf = await captureStable(page, opts)
    if (maskRects.length > 0) { buf = await maskRegions(buf, maskRects) }
    if (rects.length > 0) {
        const M = 3
        const left = Math.min(...rects.map((r) => r.x)) + env.sx, top = Math.min(...rects.map((r) => r.y)) + env.sy
        const right = Math.max(...rects.map((r) => r.x + r.width)) + env.sx, bottom = Math.max(...rects.map((r) => r.y + r.height)) + env.sy
        //夾邊：技能 §8.3 規定夾在截圖當下之視窗內（clampTo:'viewport'）；夾在整張 buffer 內（clampTo:'buffer'）為合法偏離，須登錄映射表（頁高 ≤ 視窗時兩者等價）
        const bl = Math.max(env.sx + M, left - 6), bt = Math.max(env.sy + M, top - 6), br = Math.min(env.sx + env.vw - M, right + 6), bb = Math.min(env.sy + env.vh - M, bottom + 6)
        const meta = await sharp(buf).metadata()
        const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${bl + 2.5}" y="${bt + 2.5}" width="${br - bl - 5}" height="${bb - bt - 5}" fill="none" stroke="#f26" stroke-width="5" rx="4" ry="4"/></svg>`
        buf = await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()   //疊圖在遮罩之後
    }
    return buf
}
```

表格整列紅框需聯集 center + pinned 兩容器（**順序不中性**：只有第一個目標會被捲入視窗，改順序可能改變截圖；套件 `rowBoxSel` 以 `order` 指定）；對話框內的列 scope 到 modal。從 DOM 注入版遷移：幾何一致（±6、M=3、5px 內縮），煙霧截圖目視後，與既有 baseline 交叉比對 0 差異即免重產（但若同時加旗標或 strict 等，屬全量重產，見 SKILL §7.9）。

## C8 遮罩（條件式）

```js
export async function maskRegions(buf, rects, color = { r: 0, g: 0, b: 0 }) {   //夾在 buffer 內：超出邊界之矩形 sharp composite 會拋「Image to composite must have same dimensions or smaller」
    const { width: W, height: H } = await sharp(buf).metadata()
    const composite = rects.filter((r) => r.w > 0 && r.h > 0).map((r) => {
        const left = Math.max(0, Math.round(r.x)), top = Math.max(0, Math.round(r.y))
        return { left, top, width: Math.min(Math.round(r.w), W - left), height: Math.min(Math.round(r.h), H - top) }
    }).filter((c) => c.width > 0 && c.height > 0).map((c) => ({ input: { create: { width: c.width, height: c.height, channels: 3, background: color } }, left: c.left, top: c.top }))
    return composite.length ? await sharp(buf).composite(composite).png().toBuffer() : buf
}
async function resolveMaskRects(page, mask, env) {   //'sel' → 元素 rect；{ sel, fixedWidth } → 錨右緣往左固定寬
    const out = []
    for (const m of mask) { const sel = typeof m === 'string' ? m : m.sel; const r = (await resolveRects(page, [sel]))[0]; if (!r) continue; const w = typeof m === 'string' ? r.width : m.fixedWidth; out.push({ x: r.x + r.width - w + env.sx, y: r.y + env.sy, w, h: r.height }) }
    return out
}
export async function overlayRegions(buf, rects, refBuf) {   //貼圖覆蓋：ref 與 buf 尺寸須一致
    const parts = []; for (const r of rects) parts.push({ input: await sharp(refBuf).extract({ left: r.x, top: r.y, width: r.w, height: r.h }).png().toBuffer(), left: r.x, top: r.y })
    return await sharp(buf).composite(parts).png().toBuffer()
}
//per-item ref：test/pics/<flow>/_staref-<lang>-<case>-<key>.png。只在 REGEN 自舉（不存在 → 裁切存 ref）；非 REGEN 缺檔 → throw，不得靜默自舉

//比對端覆蓋不可固定之值（建置時寫入之產製時間、耗時；unfixable-values-masking.md）：以「標準圖自身」同座標之內容蓋上當次截圖再比對；
//產製端不呼叫（原樣寫出，標準圖保留真實畫面供手冊）。rectFns 各回傳該值於頁面座標之矩形（外擴數 px）或 null（不在畫面），
//與截圖同一畫面狀態下量；集中於共用層一處，各流程之比對端呼叫同一個，被覆蓋之值另以語意斷言驗證
export async function coverUnfixableForCompare(page, buf, baselinePath, rectFns) {
    const { width: W, height: H } = await sharp(buf).metadata()
    const rects = []
    for (const fn of rectFns) {
        const r = await fn(page); if (!r) continue
        const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y))
        const w = Math.min(Math.ceil(r.w), W - x), h = Math.min(Math.ceil(r.h), H - y)
        if (w > 0 && h > 0) rects.push({ x, y, w, h })
    }
    if (rects.length === 0 || !fs.existsSync(baselinePath)) return buf   //首次產製尚無標準圖：原樣
    const refBuf = fs.readFileSync(baselinePath), ref = await sharp(refBuf).metadata()
    if (ref.width !== W || ref.height !== H) return buf                   //尺寸不同交由比對報錯，不在此遮掩
    return await overlayRegions(buf, rects, refBuf)
}
```

不可固定之值之差異不得以重產吸收：重產只把問題延到下一次建置或執行（SKILL §7.9）。

## C9 assertBaselineMatch

```js
export function assertBaselineMatch(buf, baselinePath, label, opts = {}) {
    const { maxDiffPixels = 100, threshold = 0.1, headroomRatio = 0.5, warn = console.warn } = opts
    //只比對不寫檔：標準圖寫檔一律經 C13 之 runBaselineCase（全部斷言通過才寫）。2026-09-28 前之 regen 旁路（比對函式兼寫檔）已移除——
    //它是第二條寫檔路徑，mocha REGEN 型專案曾以之「每階段當場寫圖、後段斷言失敗時已寫入半套新圖」
    if (opts.regen !== undefined) throw new Error('assertBaselineMatch: opt.regen 已移除，寫檔請經 runBaselineCase')
    if (!fs.existsSync(baselinePath)) throw new Error(`標準圖不存在: ${baselinePath}（請先執行對應 e2e --baseline 產製）`)
    const baselineBuf = fs.readFileSync(baselinePath), cap = PNG.sync.read(buf), base = PNG.sync.read(baselineBuf)
    const dump = (diffPng) => {   //三聯組、ms 時間戳、撞檔 -N、永不覆蓋
        const dir = path.join(projRoot, 'testPending'); fs.mkdirSync(dir, { recursive: true })
        const safe = (label || path.basename(baselinePath, '.png')).replace(/[^\w.-]/g, '_')
        let stem = path.join(dir, `${safe}__${new Date().toISOString().replace(/[:.]/g, '-')}`), n = 0
        while (fs.existsSync(`${stem}__capture.png`)) stem = `${stem}-${++n}`
        fs.writeFileSync(`${stem}__capture.png`, buf); fs.writeFileSync(`${stem}__baseline.png`, baselineBuf); if (diffPng) fs.writeFileSync(`${stem}__diff.png`, PNG.sync.write(diffPng))
        return stem
    }
    if (cap.width !== base.width || cap.height !== base.height) { const s = dump(null); throw new Error(`${label}: 尺寸不同，證據 ${s}`) }
    const diff = new PNG({ width: cap.width, height: cap.height })
    const numDiff = pixelmatch(cap.data, base.data, diff.data, cap.width, cap.height, { threshold, includeAA: false })
    if (numDiff > maxDiffPixels) { const s = dump(diff); throw new Error(`${label}: 差異像素 ${numDiff} > ${maxDiffPixels}，證據 ${s}__{capture,baseline,diff}.png`) }
}
```

## C10 typeIntoInput（Pattern D）與表格 cell 版

```js
export async function typeIntoInput(page, locator, value) {
    await locator.waitFor({ state: 'visible', timeout: 5000 }); await page.waitForTimeout(1000)
    for (let attempt = 1; attempt <= 3; attempt++) {
        await locator.click()
        await page.waitForFunction((el) => document.activeElement === el, await locator.elementHandle(), { timeout: 3000 })
        const cur = await locator.inputValue(); if (cur) { await page.keyboard.press('End'); for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace') }
        await page.keyboard.insertText(value); await page.waitForTimeout(200)
        if ((await locator.inputValue()) === value) return
        console.warn(`typeIntoInput 第 ${attempt} 次漏字，重試`); await page.waitForTimeout(400)
    }
    throw new Error('typeIntoInput 3 次仍漏字')
}
export async function typeIntoCell(page, rowIndex, colId, value) {   //【adapter】ag-grid
    const cell = page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`).first()
    await cell.scrollIntoViewIfNeeded(); await cell.dblclick()
    const inp = page.locator('.ag-cell-editor input, .ag-cell-edit-wrapper input').first(); await inp.waitFor({ state: 'visible' }); await page.waitForTimeout(800)
    await typeIntoInput(page, inp, value); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
}
```

## C11 waitUntilExist

```js
export async function waitUntilExist(page, label, fn, opts = {}) {
    const { timeout = 15000, arg = null, polling = 100 } = opts
    const fail = () => new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`)
    //async 判斷: waitForFunction 會把回傳之 Promise 當 truthy 立即放行(不重試、逾時無效)——改以逐次 evaluate 輪詢並 await 結果
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) { if (await page.evaluate(fn, arg).catch(() => false)) return; await new Promise((r) => setTimeout(r, polling)) }
        throw fail()
    }
    try { await page.waitForFunction(fn, arg, { timeout }) } catch (err) { throw fail() }
}
```

**`page.waitForFunction` 之判斷函數不可為 async**（Playwright 1.62 `coreBundle.js` 之輪詢以 `const success = predicate(); if (success) fulfill(success)` 同步判斷）；手寫 `waitForFunction(async () => { ...await 兩次 rAF... })` 之「表格靜止」等待實際只評估一次即放行。audit 見末節。

**瀏覽器外之非同步結果用測試行程端輪詢（套件 `pollUntil(label, fn, { timeout, interval })`）**：後端週期計時器寫資料庫（封鎖、補登記）、背景程序產檔等不在頁面內，`waitUntilExist` 等不到；`fn` 於測試行程執行、可用閉包、可 async，拋錯視為未成立，回傳 truthy 值即為結果（例：`let ips = await pollUntil('ips 補登記', async () => { let rs = await woItems.ips.select({ ip }); return rs.length ? rs : null }, { timeout: 60000 })`）。取代「固定等 N 秒再讀 DB」——計時器於負載高時延遲（SKILL §4.4）。

## C12 settle 訊號（條件式）

`waitDrawerReady`（見 C6）。表格載入／重排之 idle：**雙重 rAF 無效**（SKILL §8.1 負面斷言：只等兩幀、且多以純文字或格數為簽章，抓不到 1px 位移與 transient 空白態）；改用「列內容＋容器／標頭／列之幾何＋捲動量」簽章連續穩定 ≈1s（套件 `waitGridIdle(page, { stableMs, scope, requireSelector, minCells })`；頁面無表格即放行，逾時拋錯）。表格 mutation 簽章（存檔／新增／刪除後）：

```js
export async function waitMutationSettled(page, { n = 10, timeout = 15000 } = {}) {   //連續 n 筆（polling 200ms ≈ 2s）簽章全同才放行
    await page.evaluate(() => { window.__sigs = [] })
    await page.waitForFunction((need) => {
        const t = document.querySelector('.op-title'), r = t && t.getBoundingClientRect()
        const sig = [t ? t.textContent.slice(0, 60) : '', r ? `${r.x},${r.y}` : '', document.querySelectorAll('.ag-cell').length, (document.querySelector('.ag-row[row-index="0"]') || {}).outerHTML || '', document.body.innerText.length].join('|')
        const w = window; w.__sigs.push(sig); if (w.__sigs.length > need) w.__sigs.shift()
        return w.__sigs.length === need && w.__sigs.every((s) => s === w.__sigs[0])
    }, n, { timeout, polling: 200 })
}
```

## C13 regen 入口骨架：兩端呼叫同一個單一案例管線

**原則**：產製端與比對端呼叫**同一個函數**（套件 `runBaselineCase`），順序固定為 prepare（開瀏覽器前，DB 重置、換設定）→ launch（每案 fresh）→ openPage → beforeRun → run（流程中每階段截圖後**當場**語意斷言，狀態仍在畫面上）→ 正規化截圖 → stages 檢查（產出圖鍵＝宣告）→ semantic → verify（DB／端到端不變式）→ 產製端逐張依篩選寫檔（**全部斷言通過才寫、任一失敗一張不寫**）／比對端逐張比對 → finally 關瀏覽器 → afterCase。只能在 mocha 行程內執行之檢查（例如會拖住事件迴圈之 node 端 API client）以 `ctx.mode === 'compare'` 分流並於檔頭註明依據。手寫兩份流程（產製一份、比對一份）＝補丁；「產製端不跑語意斷言」＝缺陷。

(a) 直跑（sso／perm／task 慣例）：

```js
let cases = [   //順序＝mocha it 順序；title＝it 標題（--grep 依之）；stages＝該案產出之全部圖鍵
    { name: 'E2E-001-list-loaded', title: '...', run: runList, stages: ['E2E-001-list-loaded'] },
    { name: 'E2E-002-delete', title: '...', run: runDelete, stages: ['E2E-002-1-row-selected', 'E2E-002-2-deleted'], verify: async (ctx) => { /* DB 不變式 */ } },
    { name: 'E2E-003-shared', title: '...', run: runShared, stages: ['E2E-002-2-deleted'], compareOnly: true },   //共用他案標準圖：產製端照跑斷言、一張不寫；run 回傳 { 'E2E-002-2-deleted': buf }（裸 Buffer 會以案例鍵命名而與宣告不符）
]
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({ mode, lang, name: c.name, run: c.run, stages: c.stages, verify: c.verify, compareOnly: !!c.compareOnly,
        launch: launchBrowser, openPage: (b) => openCasePage(b, { contextOptions: { viewport: { width: 1440, height: 900 } } }),
        prepare: async () => { await resetToBaseSeed() }, pathOf: (lg, key) => `test/pics/<flow>/<flow>-${lg}-${key}.png`, ...extra })
}
async function generateBaseline() {
    process.env.E2E_STRICT_CAPTURE = '1'
    let gate = createBaselineGate({ langs, cases })   //截圖「之前」解析 --names / --langs / --write-mode / E2E_BASELINE_OUT_DIR；不符即拋錯
    console.log(gate.describe())
    await startServersOnce()
    for (let lang of gate.langs) for (let c of gate.casesFor(lang)) await runCase('regen', lang, c, { gate })
    gate.finalize()   //--names 任一項未產出即拋錯（不靜默略過）；另依宣告靜態檢查標準圖目錄之孤兒圖（runBaselineCase 經 gate.usePathOf 告知 pathOf），有即拋錯列出
    cleanup()         //【必】非 mocha 環境須顯式呼叫
}
if (process.argv.includes('--baseline')) { generateBaseline().catch((err) => { console.error(err); process.exit(1) }) }
else { for (let lang of langs) describe(`<flow> [${lang}]`, function() { for (let c of cases) it(c.title, async function() { await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) }) }) }
```

(b) mocha REGEN（api 慣例：同一個 `it()` 在 `--baseline`／`E2E_REGEN=1` 時寫圖）：`it()` 內同樣呼叫 `runBaselineCase({ mode: REGEN ? 'regen' : 'compare', gate: REGEN ? createBaselineGate({ langs, cases }) : null, ... })`——**不可**在流程中逐階段「比對函式兼寫檔」（先寫圖後斷言，後面斷言失敗時已寫入半套新圖）；兩案共用同一張圖者其一宣告 `compareOnly`（否則同一張被兩案重寫）。個別檔不得自行 spawn / 判讀 REGEN。

**篩選語意（`createBaselineGate`）**：`--names` 每項可帶 `<語系>-` 前綴；解析順序①完全等於已宣告之階段圖鍵→只寫該張 ②案例鍵之完全或**邊界**前綴（`E2E-005` 命中 `E2E-005-x`、不命中 `E2E-0051-x`）→該案全部階段 ③階段圖鍵之邊界前綴 ④案例未宣告 stages 時依編號執行、執行後未產出由 `finalize()` 拋錯；命中只比對之案例、不符任何鍵、旗標缺值或值以 `--` 開頭一律拋錯並列出可用鍵；`--langs` 完全比對；`--write-mode all｜missing｜changed`（missing＝追加案例只補缺圖；changed＝只寫超過容差或尺寸不同者，機械化「不重寫已審過之圖」）；`E2E_BASELINE_OUT_DIR` 只改寫出路徑（等價驗證用），比對端讀取不受影響。自檢：`node test/e2e-<flow>.test.mjs --baseline --names __none__` 須於啟動任何服務之前報錯並列出可用鍵。

regen 入口硬 guard：`if (REGEN && (env.E2E_BARE || env.E2E_DIAG)) throw`（套件 `getE2eMode()`）。

## C14 端點

```js
const BACKEND_PORT = 11006, FRONTEND_PORT = 8090   //≥ 8000、與他專案錯開、寫死不隨機；映射表載明
export const apiBaseUrl = `http://127.0.0.1:${BACKEND_PORT}`, baseUrl = `http://127.0.0.1:${FRONTEND_PORT}`
export const projRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')   //本模組位於 test/tools/，上兩層為專案根；相對路徑一律由此解析
export const testDir = join(projRoot, 'test')                                        //test/_tmp、test/pics 由此衍生，不用 __dir（那是 test/tools）
```

## Audit 指令（改一檔就掃全部 `test/e2e-*.test.mjs` 與 `test/tools/*.mjs`）

```bash
grep -rn "chromium.launch" test/ | grep -v launchBrowser                                        # 應為空
grep -lE "process\.argv\.includes\('--baseline'\)" test/e2e-*.test.mjs | while read f; do grep -q "cleanup()" "$f" || echo "MISSING cleanup(): $f"; done
grep -rln "spawn(" test/e2e-*.test.mjs                                                           # 個別檔不得自行 spawn server
grep -rn "\.fill(\|vm\.\|\$store\.commit" test/e2e-*.test.mjs                                   # act 階段不得出現（setup 例外須註解）
grep -rn "async function typeInto\|async function waitUntilExist\|async function resetDb" test/e2e-*.test.mjs   # 應只在 test/tools/e2e-setup.mjs
grep -rn "__e2e_box__\|createElement('div')" test/e2e-*.test.mjs test/tools/*.mjs               # 紅框不得注入 DOM（含測試檔內自訂 capture helper）
grep -rn "localhost" test/e2e-*.test.mjs test/tools/*.mjs                                        # 端點應為 127.0.0.1
grep -rn "function writeBaseline\|function argList\|function nameMatch\|baselineNamesFilter\|function shouldGen" test/e2e-*.test.mjs   # 手寫篩選／寫檔應為空（改 createBaselineGate＋runBaselineCase）
grep -rn "writeFileSync" test/e2e-*.test.mjs                                                     # 只容參考片段自舉（_ref 類）；標準圖寫檔一律經管線
grep -rn "requestAnimationFrame(() => requestAnimationFrame" test/e2e-*.test.mjs test/tools/*.mjs   # 雙重 rAF 為無效 settle，改 waitGridIdle 類內容＋幾何簽章
grep -rnE "waitForFunction\((\s)*async" test/                                                    # 應為空：async 判斷會被當 truthy 立即放行；需 await 者改 waitUntilExist（套件版自行輪詢）
grep -rn "from 'w-package-tools-e2e/src/" test/e2e-*.test.mjs test/tools/e2e-setup.mjs            # 應為空：一律經 test/tools/e2eLib.mjs 單一橋接
node node_modules/w-package-tools-e2e/tools/auditWaits.mjs --only C,E,R .                                                # 固定等待候選：逐一判讀有無非同步來源（SKILL §4.4），有則改偵測／pollUntil
```
