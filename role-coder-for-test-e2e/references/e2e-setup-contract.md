# e2e-setup 落地契約：參考實作、最小可執行骨架、audit

對應 SKILL.md §3。**函式名可依專案慣例改，行為不可少**。以下片段中的 `$vo` / `csLogin` / WDrawer / ag-grid / eng-cht 為姊妹專案（Vue 2 + w-component-vue）**範例**；換框架時只替換「登入就緒條件」「settle 訊號」「表格 editor」三處 adapter。

## 0. 最小可執行骨架（clean-room 驗證過，2026-09-01）

[minimal-skeleton/](minimal-skeleton/) 內為一個不依賴任何業務專案的完整範例：靜態頁 + 靜態 server + 契約實作 + 一個雙語 case。在任何已安裝 `playwright`、`sharp`、`pixelmatch`、`pngjs`、`mocha` 的 Node 專案內：

```
minimal-skeleton/
  srv.mjs                    靜態服務 (port 18090; /health 回 { project } 供 reuse 辨識)
  app/index.html             輸入 + 按鈕 + 300ms 延遲顯示訊息 + CSS spinner
  test/e2e-setup.mjs         C1/C2/C5/C6/C7/C8/C9/C10/C11/C13/C14 實作 (約 220 行)
  test/e2e-hello.test.mjs    E2E-001 × eng/cht：真人輸入 → 點按鈕 → 偵測訊息 → 紅框截圖 + 遮罩 → 語意斷言 → 比對
```

```bash
npm i -D playwright sharp pixelmatch pngjs mocha && npx playwright install chromium
npx mocha test/e2e-hello.test.mjs --reporter list --timeout 60000 --baseline   # regen → test/pics/hello/hello-{eng,cht}-E2E-001-greet.png
npx mocha test/e2e-hello.test.mjs --reporter list --timeout 60000              # 比對 → 2 passing；cleanup 後 netstat 無 18090
```

`package.json` 建議 scripts：`"test:e2e": "node test/run-e2e-isolated.mjs"`（有 runner）或逐檔 `npx mocha test/e2e-<flow>.test.mjs --reporter list`；`"test"` 不含 e2e。ESM：`"type": "module"` 或 `.mjs`。

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
    const p = join(__dir, '_tmp', `settings-e2e-${process.pid}-${seq++}.json`)          //test/_tmp/（gitignore）, 絕不放專案 ./tmp/（AI 暫存區隨時清）
    fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify({ ...base, ...overrides }, null, 2)); tmpSettingsFiles.push(p); return p
}
function cleanupTempSettings() {                            //由 cleanup() 呼叫
    for (const p of tmpSettingsFiles) { try { fs.rmSync(p, { force: true }) } catch (e) {} }
    tmpSettingsFiles = []
    try { const d = join(__dir, '_tmp'); if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d) } catch (e) {}
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
async function waitOverlayOpacity(page) { await page.waitForFunction(() => Array.from(document.querySelectorAll('.w-drawer-bar')).every((e) => getComputedStyle(e).opacity === '1'), null, { timeout: 5000 }).catch(() => {}) }
async function waitDrawerReady(page) {
    await page.waitForFunction(() => { const ss = Array.from(document.querySelectorAll('[state]')).map((e) => e.getAttribute('state')).filter((s) => ['hidden','opening','opened','hiding'].includes(s)); return ss.length === 0 || ss.every((s) => s === 'opened' || s === 'hidden') }, null, { timeout: 10000, polling: 100 }).catch(() => {})
}
async function detectImgSmilRects(page) {
    return await page.evaluate(() => Array.from(document.querySelectorAll('img')).filter((i) => (i.getAttribute('src') || '').startsWith('data:image/svg+xml') && decodeURIComponent(i.getAttribute('src')).includes('<animate')).map((i) => { const r = i.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } }))
}
```

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
    const rects = await resolveRects(page, items)
    const env = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, sx: scrollX, sy: scrollY }))
    let buf = await captureStable(page, opts)
    if (opts.mask) { buf = await maskRegions(buf, await resolveMaskRects(page, opts.mask, env)) }   //sel 或 { sel, fixedWidth }
    if (rects.length > 0) {
        const M = 3
        const left = Math.min(...rects.map((r) => r.x)) + env.sx, top = Math.min(...rects.map((r) => r.y)) + env.sy
        const right = Math.max(...rects.map((r) => r.x + r.width)) + env.sx, bottom = Math.max(...rects.map((r) => r.y + r.height)) + env.sy
        const bl = Math.max(env.sx + M, left - 6), bt = Math.max(env.sy + M, top - 6), br = Math.min(env.sx + env.vw - M, right + 6), bb = Math.min(env.sy + env.vh - M, bottom + 6)
        const meta = await sharp(buf).metadata()
        const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${bl + 2.5}" y="${bt + 2.5}" width="${br - bl - 5}" height="${bb - bt - 5}" fill="none" stroke="#f26" stroke-width="5" rx="4" ry="4"/></svg>`
        buf = await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()   //疊圖在遮罩之後
    }
    return buf
}
```

表格整列紅框需聯集 center + pinned 兩容器；對話框內的列 scope 到 modal。從 DOM 注入版遷移：幾何一致（±6、M=3、5px 內縮），煙霧截圖目視後，與既有 baseline 交叉比對 0 差異即免重產。

## C8 遮罩（條件式）

```js
export async function maskRegions(buf, rects, color = { r: 0, g: 0, b: 0 }) {
    const composite = rects.filter((r) => r.w > 0 && r.h > 0).map((r) => ({ input: { create: { width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)), channels: 3, background: color } }, left: Math.max(0, Math.round(r.x)), top: Math.max(0, Math.round(r.y)) }))
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
```

## C9 assertBaselineMatch

```js
export function assertBaselineMatch(buf, baselinePath, label, opts = {}) {
    const { maxDiffPixels = 100, threshold = 0.1 } = opts
    if (REGEN) { fs.mkdirSync(path.dirname(baselinePath), { recursive: true }); fs.writeFileSync(baselinePath, buf); return }   //C13-b 模式；直跑模式由 generateBaseline 寫檔
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
    const { timeout = 15000, arg = null } = opts
    try { await page.waitForFunction(fn, arg, { timeout }) } catch (err) { throw new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`) }
}
```

## C12 settle 訊號（條件式）

`waitDrawerReady`（見 C6）；表格 mutation 簽章：

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

## C13 regen 入口骨架

(a) 直跑：

```js
const isBaseline = process.argv.includes('--baseline')
const onlyNames = argList('--names'), onlyLangs = argList('--langs')
async function generateBaseline() {
    await startServersOnce()
    for (const lang of LANGS) {
        if (onlyLangs && !onlyLangs.includes(lang)) continue
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue     //gate 在 launch/截圖之前
            const browser = await launchBrowser()
            try {
                await resetDb(browser, BASE_SEED); const page = await openApp(browser); await setLang(page, lang)
                let shots = await c.run(page, lang, { strict: true }); if (Buffer.isBuffer(shots)) shots = [{ name: c.name, buf: shots }]
                if (c.semantic) await c.semantic(page, lang)               //語意斷言先過才寫檔
                for (const s of shots) fs.writeFileSync(picPath(lang, s.name), s.buf)
            }
            finally { await browser.close() }
        }
    }
    cleanup()   //【必】非 mocha 環境須顯式呼叫
}
if (isBaseline) { generateBaseline().catch((err) => { console.log(err); cleanup(); process.exit(1) }) }
else { for (const lang of LANGS) describe(`flow (${lang})`, function() { /* before/beforeEach/it 同一套 CASES 與 helper */ }) }
```

(b) mocha REGEN：`REGEN = argv.includes('--baseline') || env.E2E_REGEN === '1'`；`it()` 內語意斷言 → 比對函式（REGEN 時寫檔）；個別檔不得自行 spawn / 判讀 REGEN。regen 入口硬 guard：`if (REGEN && (env.E2E_BARE || env.E2E_DIAG)) throw`。

## C14 端點

```js
const BACKEND_PORT = 11006, FRONTEND_PORT = 8090   //與他專案錯開；映射表載明
export const apiBaseUrl = `http://127.0.0.1:${BACKEND_PORT}`, baseUrl = `http://127.0.0.1:${FRONTEND_PORT}`
export const projRoot = join(dirname(fileURLToPath(import.meta.url)), '..')   //相對路徑一律由此解析
```

## Audit 指令（改一檔就掃全部 `test/e2e-*.mjs`）

```bash
grep -rn "chromium.launch" test/ | grep -v launchBrowser                                        # 應為空
grep -lE "process\.argv\.includes\('--baseline'\)" test/e2e-*.test.mjs | while read f; do grep -q "cleanup()" "$f" || echo "MISSING cleanup(): $f"; done
grep -rln "spawn(" test/e2e-*.test.mjs                                                           # 個別檔不得自行 spawn server
grep -rn "\.fill(\|vm\.\|\$store\.commit" test/e2e-*.test.mjs                                   # act 階段不得出現（setup 例外須註解）
grep -rn "async function typeInto\|async function waitUntilExist\|async function resetDb" test/e2e-*.test.mjs   # 應只在 e2e-setup.mjs
grep -rn "__e2e_box__\|createElement('div')" test/e2e-*.mjs                                     # 紅框不得注入 DOM（含測試檔內自訂 capture helper）
grep -rn "localhost" test/e2e-*.mjs                                                              # 端點應為 127.0.0.1
```
