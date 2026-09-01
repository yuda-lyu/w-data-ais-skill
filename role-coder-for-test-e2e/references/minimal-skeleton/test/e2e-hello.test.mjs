//dry run 第一個 case: E2E-001 輸入姓名送出後顯示問候 (eng / cht 各一輪, 每 case fresh browser)
//  regen: npx mocha tmp/e2e-dryrun/test/e2e-hello.test.mjs --baseline
//  test : npx mocha tmp/e2e-dryrun/test/e2e-hello.test.mjs
import assert from 'assert'
import path from 'path'
import { startServersOnce, launchBrowser, openApp, setLang, typeIntoInput, waitUntilExist, captureStableWithBox, assertBaselineMatch, projRoot } from './e2e-setup.mjs'

const LANGS = ['eng', 'cht']
const KP = { eng: { btn: 'Submit', hello: 'Hello, ' }, cht: { btn: '送出', hello: '你好, ' } }
const picPath = (lang, name) => path.join(projRoot, 'test', 'pics', 'hello', `hello-${lang}-${name}.png`)

//6 步 user path: ①進站首頁 ②點 Name 輸入框 ③看到空白訊息 ④輸入 Alice ⑤點 Submit ⑥看到「Hello, Alice」(無後端副作用)
const CASES = [
    {
        name: 'E2E-001-greet',
        run: async (page, lang) => {
            await typeIntoInput(page, page.locator('#name'), 'Alice')
            await page.getByRole('button', { name: KP[lang].btn }).click()          //spec: 點「Submit」/「送出」
            await waitUntilExist(page, 'greeting', (h) => (document.querySelector('#msg') || {}).textContent === h, { arg: KP[lang].hello + 'Alice' })
            return await captureStableWithBox(page, '.card', { mask: ['.spin'] })   //紅框卡片區; spinner 為 CSS 動畫(已凍)仍示範遮罩
        },
        semantic: async (page, lang) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(KP[lang].hello + 'Alice'), 'spec: 送出後顯示問候')  //spec「看到問候文字」
            assert.strict.equal(await page.locator('#name').inputValue(), 'Alice')
        },
    },
]

for (const lang of LANGS) {
    describe(`e2e-hello (${lang})`, function() {
        this.timeout(60000)
        let browser = null
        before(async function() { await startServersOnce() })
        beforeEach(async function() { browser = await launchBrowser() })
        afterEach(async function() { if (browser) { await browser.close(); browser = null } })
        for (const c of CASES) {
            it(c.name, async () => {
                const page = await openApp(browser)
                await setLang(page, lang)
                const buf = await c.run(page, lang)
                await c.semantic(page, lang)                                       //語意斷言先於寫檔/比對
                assertBaselineMatch(buf, picPath(lang, c.name), `hello-${lang}-${c.name}`)
            })
        }
    })
}
