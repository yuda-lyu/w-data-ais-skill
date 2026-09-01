# 專案 e2e 落地映射表範本（放各專案 `CLAUDE_settings.md`）

本技能只寫跨專案規則；每個專案在 `CLAUDE_settings.md` 填下表，記錄「本專案怎麼落地」。**只寫名稱與模式，不寫行號**（行號會漂移；要定位用 Grep）。與技能契約（SKILL.md §3）不同之處必須在「偏離與依據」欄說明，否則視為缺口。

```markdown
## e2e 落地映射（對應全域技能 role-coder-for-test-e2e §3 契約）

### 服務與 port

| 項目 | 值 |
|---|---|
| 後端 | `node srv.mjs`（port NNNNN） |
| 前端 | (a) `npm run serve`（port NNNN，與他專案錯開）/ (b) 先 `npm run build`，由後端 serve `dist` |
| w-screenctl | `node node_modules/w-screenctl/g.mjs`（port 7000，被佔用另選） |
| seed 腳本 | `g_initialTestData.mjs`（hermetic：e2e 進場先刪 DB 目錄再跑；偵測 stdout `finish.`） |
| e2e 執行 | `npx mocha test/e2e-<flow>.test.mjs --reporter list --timeout NNNNNN`（單檔）/ `npm run test:e2e`（逐檔隔離 runner `test/run-e2e-isolated.mjs`） |

### 契約映射

| 契約 | 本專案實名 / 模式 | 偏離與依據 |
|---|---|---|
| C1 launch wrapper | `launchBrowser()`；旗標組：六旗標 / 四旗標（列出） | 例：四旗標含 `--font-render-hinting=none`，依據＝本專案 2026-xx 字形重畫症狀；尚未升級六旗標因需全量重產 |
| C2 server lifecycle | `startServersOnce({ backendOnly })` / `cleanup()`；root `after` + 直跑顯式 cleanup | |
| C3 換設定重啟 | `restartBackend(path, envOverride)` / `genTempSettings(overrides)` → `./tmp/settings-e2e-*.json` | |
| C4 DB 重置 | `resetToBaseSeed()`（直接 DB）/ `resetDb(browser, seed)`（throwaway page） | |
| C5 進站與語系 | `openApp(browser)`（`?token=sys`）/ `setLang(page, lang)` | |
| C6 截圖 | `captureStable(page, { initialWaitMs: 1500 })` | |
| C7 紅框 | `captureStableWithBox`：sharp 合成 / **DOM 注入（缺口，待遷移）** | |
| C8 遮罩 | `maskRegions` / `overlayRegions`（`_staref-*` 自舉）/ `{ sel, fixedWidth }` | |
| C9 比對 | `assertBaselineMatch(buf, path, label, opts)` / `assertOrRegenBaseline(assert, flow, file, buf, opts)`；pixelmatch `includeAA:false, threshold 0.1, maxDiffPixels 100`；fail-dump `./testPending/` | |
| C10 輸入 | `typeIntoInput(page, locator, value)`；表格 `typeIntoCell` / `fillAgGridCell` | |
| C11 偵測等待 | `waitUntilExist(page, label, fn, { timeout, arg })` | |
| C12 settle 訊號 | `waitDrawerReady`（`[state]`）/ `waitMutationSettled`（簽章） | |
| C13 regen 入口 | (a) `node test/e2e-x.test.mjs --baseline [--names] [--langs]` + `generateBaseline()` 末尾 `cleanup()` / (b) `npx mocha … --baseline` 或 `E2E_REGEN=1` | |
| C14 端點 | `baseUrl` / `apiBaseUrl`（127.0.0.1） | |

### 專案特有機制

- 例：統計頁確定性資料：`settings.staEventMock=true`（mock 資料集）/ fixture log `logs/e2e-*-fixture.log` / 合成 log 目錄 + `restartBackend(genTempSettings({ logFd }))`
- 例：in-memory 計數清除 API：`/api/cleanKpIpCallApi?token=…`
- 例：端到端不變式 helper：`getResolvedActiveTargets(page, userId)`
- 例：`e2e-doubleclick` 為 API-level（後端 mutex 契約：兩次皆成功 / 一成功一 reject）
- 例：api 測試層 root `after` 強制 `process.exit()`（第三方 client 內部 `setInterval` 無法 close）

### 已知缺口 / 待辦（對照技能 audit 指令）

- 例：`chromium.launch` 散落 N 處，待收斂為 wrapper
- 例：紅框仍 DOM 注入，待改 sharp 合成（幾何一致可免重產，需交叉比對證明）
```
