//dry run: 依技能 references/e2e-setup-contract.md 之「最小可執行骨架」建立 (核心契約 C1/C2/C6/C7/C8/C9/C10/C11/C13/C14)
import { spawn, execSync } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'

const __dir = path.dirname(fileURLToPath(import.meta.url))
export const projRoot = path.join(__dir, '..')
const isWin = process.platform === 'win32'

//C14 端點
const PORT = 18090
export const baseUrl = `http://127.0.0.1:${PORT}`

//C13 regen 旗標 (mocha 模式)
export const REGEN = process.argv.includes('--baseline') || process.env.E2E_REGEN === '1'
if (REGEN && (process.env.E2E_BARE || process.env.E2E_DIAG)) {
    throw new Error('拒絕在診斷 env 下寫入正式 baseline')
}

//C1 launch wrapper (唯一 chromium.launch)
const chromiumLaunchArgs = [
    '--disable-gpu',
    '--force-color-profile=srgb',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
    '--disable-skia-runtime-opts',
    '--disable-partial-raster',
]
export async function launchBrowser() {
    return await chromium.launch({ headless: true, args: chromiumLaunchArgs })
}

//C2 server lifecycle
let spawned = []
let startedBackend = false
function httpOk(url, timeoutMs = 2500) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let s = ''
            res.on('data', (d) => { s += d })
            res.on('end', () => { resolve(res.statusCode === 200 && s.includes('"project":"e2e-dryrun"')) }) //health 回專案識別, reuse 才不會認錯服務
        })
        req.on('error', () => resolve(false))
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
    })
}
async function waitPort(url, label, timeoutMs = 30000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
        if (await httpOk(url)) return
        await new Promise((r) => setTimeout(r, 300))
    }
    throw new Error(`等待 ${label} (${url}) 逾時 ${timeoutMs}ms`)
}
function spawnSrv(name, cmd, args, opts = {}) {
    const child = spawn(cmd, args, { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})
    spawned.push({ name, child })
    return child
}
export async function startServersOnce() {
    if (startedBackend) return
    startedBackend = true
    if (!(await httpOk(`${baseUrl}/health`))) {
        spawnSrv('backend', 'node', ['srv.mjs', String(PORT)])
        await waitPort(`${baseUrl}/health`, 'dryrun backend')
    }
}
export function cleanup() {
    //同步殺 (exit handler 內非同步 spawn 不會被等待)
    for (const { child } of spawned) {
        try {
            if (isWin) execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' })
            else child.kill('SIGKILL')
        }
        catch (e) {}
    }
    spawned = []
}
if (typeof globalThis.after === 'function') {
    globalThis.after(function() { this.timeout(20000); cleanup() })
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

//C5 進站 (本 fixture 無登入; 等 window.ready)
export async function openApp(browser, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, ...opts })
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(() => window.ready === true, null, { timeout: 10000 })
    return page
}
export async function setLang(page, lang) {
    if (lang !== 'eng') await page.evaluate((l) => window.setLang(l), lang) //setup 例外: 語系切換為前置狀態
    await page.waitForTimeout(300) //eng 亦等量 settle
}

//C11 偵測 driven 等待
export async function waitUntilExist(page, label, fn, opts = {}) {
    const { timeout = 15000, arg = null } = opts
    try { await page.waitForFunction(fn, arg, { timeout }) }
    catch (err) { throw new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`) }
}

//C10 真人輸入 Pattern D
export async function typeIntoInput(page, locator, value) {
    await locator.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(300)
    for (let attempt = 1; attempt <= 3; attempt++) {
        await locator.click()
        await page.waitForFunction((el) => document.activeElement === el, await locator.elementHandle(), { timeout: 3000 })
        const cur = await locator.inputValue()
        if (cur) { await page.keyboard.press('End'); for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace') }
        await page.keyboard.insertText(value)
        await page.waitForTimeout(100)
        if ((await locator.inputValue()) === value) return
        await page.waitForTimeout(300)
    }
    throw new Error('typeIntoInput 3 次仍漏字')
}

//C8 遮罩
export async function maskRegions(buf, rects, color = { r: 0, g: 0, b: 0 }) {
    const composite = rects.filter((r) => r.w > 0 && r.h > 0).map((r) => ({
        input: { create: { width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)), channels: 3, background: color } },
        left: Math.max(0, Math.round(r.x)), top: Math.max(0, Math.round(r.y)),
    }))
    return composite.length ? await sharp(buf).composite(composite).png().toBuffer() : buf
}

//C6 captureStable (本 fixture 無 WDrawer/ag-grid, 保留通用步驟; CSS 動畫由 animations:'disabled' 凍結)
export async function captureStable(page, opts = {}) {
    const { maxRetries = 8, intervalMs = 200, initialWaitMs = 600, strict = false } = opts
    const shotOpts = { fullPage: true, animations: 'disabled' }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(initialWaitMs)
    await page.evaluate(() => { document.querySelectorAll('svg').forEach((s) => { try { s.pauseAnimations(); s.setCurrentTime(0) } catch (e) {} }) })
    await page.evaluate(() => document.fonts && document.fonts.ready)
    let prev = await page.screenshot(shotOpts)
    for (let i = 0; i < maxRetries; i++) {
        await page.waitForTimeout(intervalMs)
        const curr = await page.screenshot(shotOpts)
        if (curr.equals(prev)) return curr
        prev = curr
    }
    if (strict) throw new Error(`captureStable ${maxRetries} 次仍未 settle (regen 拒絕寫入未穩定畫面)`)
    return prev
}

//C7 紅框後合成
async function resolveRects(page, items) {
    const rects = []
    for (const it of items) {
        if (it && typeof it.boundingBox === 'function') {
            const bb = await it.first().boundingBox()
            if (bb) rects.push(bb)
        }
        else {
            const r = await page.evaluate((s) => {
                const e = document.querySelector(s)
                if (!e) return null
                const rc = e.getBoundingClientRect()
                return { x: rc.left, y: rc.top, width: rc.width, height: rc.height }
            }, it)
            if (r) rects.push(r)
        }
    }
    return rects
}
export async function captureStableWithBox(page, target, opts = {}) {
    const items = Array.isArray(target) ? target : [target]
    await page.mouse.move(0, 0)
    const rects = await resolveRects(page, items)
    const env = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, sx: scrollX, sy: scrollY }))
    let buf = await captureStable(page, opts)
    if (opts.mask) {
        const mrs = await resolveRects(page, opts.mask)
        buf = await maskRegions(buf, mrs.map((r) => ({ x: r.x + env.sx, y: r.y + env.sy, w: r.width, h: r.height })))
    }
    if (rects.length > 0) {
        const M = 3
        const left = Math.min(...rects.map((r) => r.x)) + env.sx, top = Math.min(...rects.map((r) => r.y)) + env.sy
        const right = Math.max(...rects.map((r) => r.x + r.width)) + env.sx, bottom = Math.max(...rects.map((r) => r.y + r.height)) + env.sy
        const bl = Math.max(env.sx + M, left - 6), bt = Math.max(env.sy + M, top - 6)
        const br = Math.min(env.sx + env.vw - M, right + 6), bb = Math.min(env.sy + env.vh - M, bottom + 6)
        const meta = await sharp(buf).metadata()
        const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${bl + 2.5}" y="${bt + 2.5}" width="${br - bl - 5}" height="${bb - bt - 5}" fill="none" stroke="#f26" stroke-width="5" rx="4" ry="4"/></svg>`
        buf = await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()
    }
    return buf
}

//C9 比對 (REGEN 時寫檔)
export function assertBaselineMatch(buf, baselinePath, label, opts = {}) {
    const { maxDiffPixels = 100, threshold = 0.1 } = opts
    if (REGEN) {
        fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
        fs.writeFileSync(baselinePath, buf)
        console.log('wrote', baselinePath, buf.length, 'bytes')
        return
    }
    if (!fs.existsSync(baselinePath)) throw new Error(`標準圖不存在: ${baselinePath} (請先執行對應 e2e --baseline 產製)`)
    const baselineBuf = fs.readFileSync(baselinePath)
    const cap = PNG.sync.read(buf), base = PNG.sync.read(baselineBuf)
    const dump = (diffPng) => {
        const dir = path.join(projRoot, 'testPending')
        fs.mkdirSync(dir, { recursive: true })
        const safe = (label || path.basename(baselinePath, '.png')).replace(/[^\w.-]/g, '_')
        let stem = path.join(dir, `${safe}__${new Date().toISOString().replace(/[:.]/g, '-')}`), n = 0
        while (fs.existsSync(`${stem}__capture.png`)) stem = `${stem}-${++n}`
        fs.writeFileSync(`${stem}__capture.png`, buf)
        fs.writeFileSync(`${stem}__baseline.png`, baselineBuf)
        if (diffPng) fs.writeFileSync(`${stem}__diff.png`, PNG.sync.write(diffPng))
        return stem
    }
    if (cap.width !== base.width || cap.height !== base.height) {
        const s = dump(null)
        throw new Error(`${label}: 尺寸不同 ${cap.width}x${cap.height} vs ${base.width}x${base.height}, 證據 ${s}`)
    }
    const diff = new PNG({ width: cap.width, height: cap.height })
    const numDiff = pixelmatch(cap.data, base.data, diff.data, cap.width, cap.height, { threshold, includeAA: false })
    if (numDiff > maxDiffPixels) {
        const s = dump(diff)
        throw new Error(`${label}: 差異像素 ${numDiff} > ${maxDiffPixels}, 證據 ${s}__{capture,baseline,diff}.png`)
    }
}
