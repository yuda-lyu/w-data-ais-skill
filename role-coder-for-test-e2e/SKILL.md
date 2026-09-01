---
name: role-coder-for-test-e2e
description: |
  E2E 測試建構與審查規範。主要適用 Playwright 驅動真瀏覽器 + mocha runner + pixel baseline 之專案（Vue / React 皆可）；其他 runner（Cypress、Playwright Test）只採通用原則（§2 case 推導、§4 act、§5 assert、§6 隔離）。內容：專案勘查與契約選型；從 spec 推導 case（完整度 rubric、獨立情境 vs 承接式 journey、6 步真實 user path、按鈕全清單比對）；落地契約分「核心必備」與「條件式 adapter」（launch wrapper、server lifecycle、captureStable、紅框後合成、遮罩、baseline 比對、真人輸入、偵測等待、regen 入口）；act 走 L1–L3 與 Pattern A–D；assert 走使用者觀察；每 case fresh browser + DB 重置；標準圖命名 / 容差比對 / fail-dump / 重產授權 / 手術式重產 / 認證；截圖穩定性（settle 訊號、mouse park、確定性渲染旗標）；lifecycle 對稱性與逐檔隔離；場景手冊；mocha 執行慣例；w-screenctl 探索；完成前勾選。深入內容在 references/：e2e-setup-contract（參考實作 + 最小可執行骨架 + audit）、pixel-mismatch-diagnosis（超容差七步、守門、認證）、research-review-discipline（調研紀律、外部複審、業主裁示、反模式）、spec-case-format（spec E2E-NNN 寫法）、project-mapping-template（專案 settings 映射表範本）。
  觸發條件：凡接觸 e2e 測試檔（檔名含 `e2e-`）的任務——寫/改/審/拆/移除/重構/完整度盤查/flake 排查/標準圖產製或重產——必先調用本技能，整篇入 context 逐項比對；看到 e2e 工件即觸發。亦適用於撰寫 spec「重要流程」之 E2E-NNN case。
---

# E2E 測試建構規範

本技能只寫**跨專案不變的規則與能力契約**；各專案的落地映射（函式實名、port、regen 模式、旗標組、服務模式、偏離與依據）寫在該專案 `CLAUDE_settings.md`（範本：[references/project-mapping-template.md](references/project-mapping-template.md)）。**規則以本技能為準，落地細節以專案映射為準；映射表寫了「偏離與依據」的項目才算合法偏離，沒寫的視為缺口。** 正文中的 `$vo` / `csLogin` / WDrawer / ag-grid / eng-cht 等字樣皆為姊妹專案（w-web-sso / perm / api，Vue 2 + w-component-vue）**範例**，不是規則。

**閱讀順序**：§0 勘查 → §1 交付物 → §2 從 spec 到 case → §3 契約 → §4 act → §5 assert → §6 隔離 → §7 標準圖 → §8 穩定性 → §9 lifecycle → §10 場景 → §11 執行與探索 → §12 勾選。深入：[references/e2e-setup-contract.md](references/e2e-setup-contract.md)、[references/pixel-mismatch-diagnosis.md](references/pixel-mismatch-diagnosis.md)、[references/research-review-discipline.md](references/research-review-discipline.md)。

## 0. 動手前的專案勘查（5 分鐘，寫進回報）

| 問 | 怎麼查 | 決定 |
|---|---|---|
| runner 與比對方式？ | `package.json` scripts、`test/e2e-setup.mjs` 有無 `pixelmatch` | 本技能全量適用 / 只採通用原則 |
| 服務拓撲？ | setup 內 spawn 什麼：前端 dev server + 後端，或後端 serve build；port 是否與他專案錯開 | 契約 C2 模式 |
| 語系與資料來源？ | 有無 i18n（語系迴圈）；seed 腳本、mock 開關、fixture log | C4 / C5 是否需要、§10 場景 |
| 專案映射表存在嗎？ | `CLAUDE_settings.md` 之 e2e 映射 | 缺 → 先依範本補，再寫 case |
| 姊妹專案有先例嗎？ | Grep 同組織其他專案 `test/` 之 helper 名與註解 | 沿用，不自創 |

## 1. 交付物與完成判準

| # | 產物 | 內容 |
|---|---|---|
| 1 | case 對照表 | spec 每個 `E2E-NNN` × 語系 → `it()` → baseline 檔名；缺項標「合法 gap 類型」（§7.3）或「缺口」 |
| 2 | 按鈕覆蓋清單 | production 可點元素全清單 vs 測試點過的（§2.4） |
| 3 | rubric 逐維度判定 | §2.1 五維，每維「達 / 缺（哪些 case）」 |
| 4 | 執行紀錄 | mocha passing / failing / 耗時；regen 時 `git diff --stat test/pics` |
| 5 | 使用者視角驗收 | 至少一個 case `--grep` 單跑與全跑各一次，結果一致 |

完成三件缺一不可：①既有 e2e 全綠 ②rubric 五維無缺 ③baseline 變更經使用者授權且 diff 僅限預期。沒有對照表不得寫「全覆蓋 / 完成」。勾選清單見 §12。

## 2. 從 spec 到 case

### 2.1 完整度 rubric

| # | 維度 | 標準 | 失敗樣態 |
|---|---|---|---|
| 1 | Case 對齊 | spec 重要流程每個 bullet × 每語系至少一個 `it()` | case 數少於 bullet 數 |
| 2 | Act 真實 | user-facing input（真鍵盤滑鼠） | `.fill()` / `vm.method()` / `evaluate` 設 value |
| 3 | Assert 完整 | UI 語意 + DB/state + 穩定視覺態加 pixel baseline | 只驗 DB / 只驗 innerText / modal 沒 baseline |
| 4 | 多語覆蓋 | UI 含 i18n 則所有語系都跑 | 只跑一種語系 |
| 5 | Cleanup 完整 | 測試創建的資料含副作用全清（DB、in-memory 計數、孤兒 token、暫存 log、`./tmp` settings） | 殘留 |

任一維度缺漏＝部分覆蓋；回報必逐維度列。

### 2.2 case 的單位與拆分

- **一個 case ＝ 一個 `E2E-NNN` × 一種語系 ＝ 一個 `it()` ＝ 一個 fresh browser**。一個 case 內可多階段截圖；**適合多階段截圖的流程（新增前 / 輸入後 / 存檔後）要主動提出並實作**，不是等使用者要求。
- **獨立情境**（各自 seed、彼此無狀態依賴）→ 各自一個 `it()`。
- **承接式 journey**（後段 state 承接前段真實副作用、無法乾淨 seed 中間點、或共用一次外部 round-trip）→ 整段一個 `it()`、每階段截圖；沿用的多個 `E2E-NNN` 是同 case 內的截圖點。硬拆需偽造中間 state＝假測試。判別句：「中間階段的前置是不是前一階段的真實副作用造成、且無法用 seed 乾淨複製？」
- UI 無法自然觸發者（fail-closed、後端並發序列化）→ 下沉 `api-` / `unit-`。

### 2.3 先展開 6 步真實 user path

問「一位真實使用者會做什麼」而不是「最簡單怎麼推進系統」。每個 case 註解列出：①從哪頁開始 ②點哪個元素（對得到 production 的 `@click`）③看到什麼 ④輸入什麼 ⑤提交後看到什麼 ⑥後端副作用。被 helper 抹平的步驟明標「未走 UI」。

### 2.4 按鈕全清單比對

反查 production 所有可點元素（`@click`、`<button>`、可點 `<a>`、`role="button"`），輸出 covered / uncovered。setup helper（simulateXxx / seed）只能用於「不是本測試重點的 trigger」，且該 trigger 必須在別處有真 UI case 覆蓋，依賴寫進 helper 註解。合規範例：重設密碼 flow 之 E2E-001~004 走真 admin 點擊鏈，005~013 才用 simulate 並註明已由 003 覆蓋（此 flow 曾是 13 case 全 simulate、掩蓋 2 個 production bug 的反例）。

### 2.5 spec 撰寫

「重要流程」段下緊接 `- **E2E-NNN**` bullets（title / description / flow 五 bullet），契約等級，不寫 helper 名 / API / 固定 wait / selector。格式：[references/spec-case-format.md](references/spec-case-format.md)。

## 3. 落地契約（e2e-setup 提供的能力）

**核心必備**（任何走本技能全量的專案都要有）：

| # | 能力 | 要求 |
|---|---|---|
| C1 | `launchBrowser()` | 全專案唯一 `chromium.launch` 出口，內含確定性渲染旗標組（§8.4） |
| C2 | `startServersOnce()` / `cleanup()` | port 偵測 reuse-or-spawn（health 回專案識別才 reuse）；有多服務時 once 旗標依服務分拆；cleanup 只殺自己 spawn 的、exit 備援走同步指令；兩條觸發來源（§9） |
| C6 | `captureStable(page, opts)` | 所有 pixel 截圖唯一入口；retry-until-stable；`strict` 時未 settle 即 throw（regen 用） |
| C7 | `captureStableWithBox(page, target, opts)` | 紅框 #f26 / 5px / 圓角 4，**截圖後 sharp 合成**，不注入 DOM |
| C9 | `assertBaselineMatch(buf, baselinePath, label, opts)` | pngjs + pixelmatch（`includeAA:false`, `threshold:0.1`, `maxDiffPixels` 100）；fail-dump 三聯組永不覆蓋；尺寸不同直接 fail；缺檔 throw |
| C10 | `typeIntoInput(page, locator, value)` | Pattern D 真人輸入 |
| C11 | `waitUntilExist(page, label, fn, opts)` | 偵測 driven 等待 |
| C13 | regen 入口 | 直跑 `--baseline` + `generateBaseline()` 末尾 `cleanup()`，或 mocha `--baseline` / `E2E_REGEN=1`；**截圖前 gate**、**產製端 / 測試端同管線**、寫檔前語意斷言先過、未 settle 不寫 |
| C14 | 端點常數 | `127.0.0.1`；seed 內 redirect URL 由 `baseUrl` 衍生 |

**條件式 adapter**（專案有該特徵才需要；映射表註明「不適用」即可）：

| # | 能力 | 何時需要 |
|---|---|---|
| C3 | `restartBackend(settingsPath, envOverride?)` + `genTempSettings(overrides)` | 有 case 需不同 server 設定（語系注入、mock 開關、SMTP 失敗） |
| C4 | DB 重置（直接 DB API 或 throwaway page） | 有持久資料 |
| C5 | `openApp(browser)` / `setLang(page, lang)` | 需登入態 / i18n |
| C8 | 遮罩：填黑 / 貼圖覆蓋 / 錨右緣 | 有動態內容凍不到 |
| C12 | settle 訊號 helper（抽屜 `[state]`、mutation 簽章） | 有動畫式容器 / 表格 mutation |
| — | 逐檔隔離 runner、in-memory 計數清除 API、fixture log | 後端跨檔留狀態 / rate limit / 統計頁 |

參考實作、最小可執行骨架（含 imports / dependencies / scripts）、audit 指令：[references/e2e-setup-contract.md](references/e2e-setup-contract.md)。**helper 不重複**：同一 helper 只在 setup 模組定義一次；測試檔內第二份近似實作＝補丁堆積，先收斂再寫新 case。

## 4. Act：走 user-facing input

### 4.1 操作層級（L1–L3 允許，L4–L6 禁用）

| 層級 | API | act 階段 |
|---|---|---|
| L1 真鍵盤 | `keyboard.type` / `pressSequentially` / `keyboard.press` | ✅ |
| L1.5 IME 注入 | `keyboard.insertText` | ✅ 解 controlled input race |
| L2 真滑鼠 | `page.mouse.click(x, y)` | ✅ 特殊情境（canvas 圖例：取 zrender `getDisplayList()` 座標後真點） |
| L3 Locator | `locator.click()` / `dblclick()` / `check()` | ✅ 預設 |
| L4 | `locator.fill(v)` | ❌ 跳過 focus / mousedown / keydown |
| L5 | `page.evaluate(el.value=X)` / `dispatchEvent` | ❌ |
| L6 | `vm.method()` / `vm.field = X` / `$store.commit` | ❌（setup 例外見 4.5） |

檔名 `e2e-` 但 act 用 L5/L6 → 正名或重寫。

### 4.2 文字輸入 Pattern

- **A**（常駐 input）：`waitFor visible` → `click()` → 驗 `activeElement` → `keyboard.type`。
- **B**（表格 cell editor）：cell `scrollIntoViewIfNeeded` → `dblclick()` → editor visible → 800–1000ms settle → 清空（End + Backspace × (len+2)，不用 Ctrl+A）→ 輸入 → Enter。
- **C**：`pressSequentially`（先清空）。
- **D**（Vue v-model / React controlled，A/B/C 漏字時必用）：click → 驗 focus → 清空 → `insertText` 一次注入 → 驗 `inputValue` → retry × 3。why：逐字打字每字 re-render，input 可能被替換、焦點瞬間離開 → 後續 keystroke 落到 body（11 字只進 1 字；`delay:50` 仍漏）。
- 搜尋框清空：`Control+a` + `Backspace` 一次刪。
- 選擇：純 HTML → A/B/C；controlled → D；應用 hook `@keydown` 逐字驗證 → A/B/C。

### 4.3 焦點與選擇器

- click 後驗 `document.activeElement === el`，把「焦點被 `@mousedown.prevent` 攔截」的 silent fail 提早發現。
- 優先序：①語意（`getByRole` / `getByLabel` / `getByText`）→ ②`data-fmid` 類測試屬性 → ③結構 selector → ④座標；**降級到②③④須經使用者同意**，先窮盡①變體並告知試過哪些。
- 組件庫按鈕常是 `div[role=button]`；icon 定位 `svg path[d="${mdiXxx}"]`，path 一律 `import` 自 icon 套件（手抄永不命中）。
- 同字撞名（cht 下 modal「取消」與表單「取消」）→ scope 到容器；`hasText` 可能被 hint 誤命中 → 收窄到 label 元素。

### 4.4 偵測 driven 步驟

每步先偵測對象存在 / 就緒才進下一步（`waitUntilExist`；`fn` 跨 process 序列化不能 closure，傳值用 `arg`）。可單獨用 `waitForTimeout` 的僅：跨頁 redirect 前 buffer（舊頁殘留 DOM 會 false-positive，數值依專案校準）、editor mount 後 type 前 settle、截圖前 final settle（captureStable 已含）。

### 4.5 setup 例外

`before` / `beforeEach` 準備前置資料可用直接 API、DB 寫入、`$store.commit` 強制狀態——但 page 生命週期與 act 切開（§6 throwaway page）。進 `it()` 的 act 階段切回真實 UI。UI 元件難操作：①官方 e2e 範例 ②grep 姊妹專案 ③w-screenctl 探索（§11.3）④真不行 → 停下討論，不偷工降級。

## 5. Assert：走使用者觀察

- spec 含「畫面 / 顯示 / 轉跳 / 卡 / 出現 / 看到 / 看不到 / 進入」等觀察字眼 → 必須有對應 UI 斷言；純後端 trigger 才能 DB-only。
- 每條 assertion 註解標明對應 spec 哪一句；對不到的＝現狀指紋，刪或回 spec。
- spec「N step 後 → 觀察 M」→ e2e 步驟數 ≥ spec 動作數。
- 能驗端到端不變式（外部應用實際查到的解析後結果）就驗它，不只驗中間資料存對。
- pixel baseline 是補強層：先語意斷言，穩定視覺態再 baseline；modal / 轉跳 case 只有 innerText 不接受。
- Reflex：①這條 assert 是 spec 要求還是我選最容易驗的？②UI 描述都翻成 assert 了嗎？③DB 寫入當最終真相？④動作鏈走完了嗎？

## 6. 每 case 隔離：fresh browser + DB 重置

- `beforeEach` `launchBrowser()` + `newContext()` + `newPage()`；`afterEach` `browser.close()`。換 case 或換語系都重新 new；regen 端同樣 per-case（每語系共用一個 browser 跑多 case＝與 mocha 不同管線，列缺口）。fresh launch ~1–2s，不為省時間共用。
- DB：`beforeEach` 重置為 base seed；會異動資料的檔於 `afterEach` 或檔尾清本檔特化資料；唯讀 flow 可省。作法 (a) DB API 清表 + 插 seed；(b) throwaway page 以 UI RPC 送回整批 seed、等筆數符合後關 context——不在 case page 上做（後端 late 廣播會把已新增列洗掉）。hermetic seed 若初始化腳本為 upsert，須刪整個 DB 目錄再重建並偵測完成訊號。
- 語系：外層 `for (lang of LANGS) describe(...)`；`setLang` 對預設語系也補等量 settle（治收斂不對稱）；純 UI 無語系差異的 case 可單輪並註明。
- browser 與 DB 都 per-case 仍見跨 case 殘留 → 查服務層：多個 backend 同連一個 DB（restartBackend 留孤兒、手動多開、中途砍 mocha），先確認只剩一個 backend。

## 7. 標準圖（pixel baseline）

### 7.1 命名與儲存

- 檔名 **`<flow>-<lang>-E2E-NNN-<kebab-name>.png`**（多階段加 `-1-<stage>`），放 `test/pics/<flow>/`；`NNN` 錨定 spec bullet 順序；kebab 名與 `it()` 同字。三專案現碼一致採此格式。
- 貼圖覆蓋參考片段以 `_` 前綴（`_staref-…png`）同夾但不是 baseline，統計與認證時排除；**只在授權的 REGEN 中自舉**，正常測試缺檔即 fail。
- 測試當次截圖以 Buffer 比對不落地；只有 regen 寫檔。regen 的 cases 陣列、寫檔名、mocha 比對名三處一致。

### 7.2 比對與失敗證據

- 反鋸齒感知容差非 byte-exact：pixelmatch `includeAA:false` + `threshold:0.1` + 差異 ≤ `maxDiffPixels`（100）。why：SVG icon / 字型邊緣次像素跨 session 不決定性；真 regression 動輒數百 px 仍被抓。
- 勿混淆：`captureStable` 內 `curr.equals(prev)` 是 settle 偵測的真 byte 比較。
- fail-dump `./testPending/<label>__<ms 時間戳>__{capture,baseline,diff}.png`，撞檔 `-N`，永不覆蓋，gitignore。
- 下「本專案沒有 pixelmatch」結論前先 grep，不憑他專案函式名落空即斷言。

### 7.3 三種合法 gap

①共用其他 baseline（防帳號列舉同文案）——description 與 flow 兩處註明；②spec 明標不測試；③純 API 驗證無 UI 終態（暫時狀態）。

### 7.4 重產政策

- UI 變更後重產先取得使用者授權；只產受影響者；每語系都涵蓋。無差別重產＝把 bug 凍結為真理。
- 手術式重產（`--names` / `--langs`）在截圖前 gate。
- REGEN 覆寫該輪所有 baseline：重產前確認範圍，重產後 `git diff --stat test/pics`。
- regen 時 `captureStable({ strict:true })`：未 settle 即 throw 不寫檔；寫檔前語意斷言先過。
- 加 / 改 launch 旗標＝全量重產，先授權。
- 重產後認證：LCD 彩邊掃描、同 flow 共通區 hash 分群兩語系對稱、一張帶旗標 capture 與新 baseline 差 0（[references/pixel-mismatch-diagnosis.md](references/pixel-mismatch-diagnosis.md) §5）。

### 7.5 產製端與測試端同管線

regen 與 mocha 的 browser 取得、per-case fresh、DB 重置、`setLang`、settle、紅框、遮罩、語意斷言逐項對稱；任一分叉都製造「永遠對不起來」的 baseline。regen 順序與 mocha 順序一致。

## 8. 截圖穩定性

### 8.1 captureStable 與 settle 訊號

兩條獨立成因：①還沒 settle（冷啟 paint / glyph 光柵化）→ retry-until-stable；②settle 到錯的 state（setTimeout delayed-reveal、hover / focus 殘留）→ 等 timer + park mouse。

不變式：`mouse.move(0,0)` park → `initialWaitMs`（對 300ms 級 timer 給足 buffer，姊妹專案用 1500；`animations:'disabled'` 只 fast-forward CSS，不動 `setTimeout`）→ 專案 adapter 的 settle 訊號（**元件狀態機優先於幾何輪詢**：抽屜讀根節點 `[state]` 全為終態；表格 mutation 用「內容簽章＋版面幾何」連續 N 筆 ~2s 相同，純文字簽章抓不到 1px 位移、transient 空白態不可當 settle）→ 凍結 inline SVG SMIL、`fonts.ready` → `<img>` 內 SMIL 動態區填黑 → `screenshot({ fullPage, animations:'disabled' })` 連續兩張 `equals`（8 × 200ms）；未 settle 回最後一張讓比對揭露真 flake，regen 時 `strict` throw。姊妹專案完整序列見 contract C6。

負面斷言（已驗證無效）：warmup dummy screenshot、`fonts.ready` 單獨用、拉長固定 sleep、雙重 rAF。

**點擊後 capture 前必 park mouse** 並等 hover-leave + chain animation（1500ms 級）。tooltip：park 觸發 mouseleave 即消失；點擊立即彈 dialog 者被全屏遮罩擋住 mouseleave，截圖含 tooltip 視為可接受，不可用合成事件強清。

### 8.2 遮罩三型

| 情境 | 機制 | why |
|---|---|---|
| `<img>` 內 SVG SMIL（spinner） | 偵測 bbox → 截圖後填黑 | `<img>` 內 SVG 不暴露 DOM |
| canvas 圖表 / 隨日期漂移之統計區 | 貼圖覆蓋（REGEN 自舉 `_ref`，之後貼回同座標；兩端貼同一張） | 保留真實視覺、語系區仍 live 比對；自舉後目視確認一次 |
| 右對齊且寬度隨位數浮動的值 | `{ sel, fixedWidth }` 錨右緣；或正規化（asset hash → `HASH`） | 依元素尺寸遮，邊界隨位數浮動 |
| 範圍 | 整個動態 block 一起遮 | 只遮圖表漏了同 block 的表 → diff 307px |

優先順序：讓資料確定性（mock / fixture log / 固定 seed）> 貼圖覆蓋 > 填黑。絕不遮該被偵測的靜態 UI。

### 8.3 紅框：截圖後合成

紅框一律先截圖、再以 sharp 把 SVG `<rect>` 合成到 buffer（聯集 rect ±6、四邊夾在視窗內 M=3、補 scrollX/Y、stroke 置中等效 border-box 5px 內縮）。why：插入後又移除的暫時 DOM 偶發整頁偏 1px（toast 殷鑑，成功訊息因此改停留 modal）；同態連拍注入 / 不注入各自穩定但 hash 不同。既有 DOM 注入者列缺口；遷移後先煙霧截圖目視，再與既有 baseline 交叉比對證明 0 差異即免重產。

### 8.4 確定性渲染：旗標組由單一 wrapper 供給

headless Chromium 預設 GPU 光柵化 + subpixel AA 非決定性（拉丁字偶發散落差異，CJK 較穩故常只 eng 中招）。建議組：`--disable-gpu` `--force-color-profile=srgb` `--disable-lcd-text` `--disable-font-subpixel-positioning` `--disable-skia-runtime-opts` `--disable-partial-raster`。各專案採用組在映射表寫依據；`--font-render-hinting=none` ≠ `--disable-font-subpixel-positioning`；不假設旗標有效，用 CDP `SystemInfo.getInfo` 印 `featureStatus`。與 per-case fresh browser 綁定使用。

## 9. Lifecycle 對稱性

### 9.1 進場 ↔ 離場

- 進場：偵測 port（health 回專案識別才 reuse，否則另選 port / fail-fast）；沒人 → spawn 等 ready；多服務時 once 旗標依服務分拆。
- 離場死結：spawn 的 child hold event loop，`process.on('exit')` 要等 loop 清空 → 互鎖；`unref()` 單獨用讓 cleanup 沒人觸發；`process.exit(0)` 掩蓋問題——都不要用。正解：同一 `cleanup()`、兩條觸發來源——①`globalThis.after`（框架）②直跑分支主函式末尾顯式呼叫；exit / SIGINT 備援只做**同步**殺（`execSync taskkill`），非同步 spawn 在 exit handler 內不會被等待。
- 第三方 client 無法 close（內部 `setInterval`）時，api 測試層 root `after` 註冊 `process.exit()`，註解原因——明文例外。
- **規則錨定 artifact**：規則寫「接觸 spawned server 的 script」而非「框架跑完不退」，否則直跑模式觸發詞不命中而累犯；發現 recurring bug 第一動作是 grep 全 repo 同 pattern 一起修。
- 診斷順序（先實測再推論）：①看 spawn 了哪些子進程（`tasklist` / PowerShell `Get-CimInstance Win32_Process` / `pgrep -P`）②冷啟 vs 熱啟對照（port 已佔用 reuse 不 spawn → 乾淨退；冷啟才卡）③grep spawn 位置 ④看 cleanup 註冊位置。

### 9.2 restartBackend 與逐檔隔離

- `restartBackend`：先殺自己 spawn 的；port 仍被佔（reuse / 手動啟動之**同專案**後端）走 OS 層 `netstat` / `taskkill`（posix `lsof` / `kill`），等 port 真釋放再 spawn——這是「只重啟自己 PID」規則的明文例外，前提是該 port 專屬本專案（映射表載明）。需特殊 settings 的 case 以 `try/finally` 還原預設；環境變數覆寫收斂在 `envOverride`。
- 逐檔隔離 runner：多 e2e 檔塞單一 mocha 進程會共用被前面測試改過狀態的後端（RPC 正規化過欄位序 → 列序與 solo 產的 baseline 不符）。每檔獨立 mocha 進程 + 全新後端；無狀態且啟動慢的前端暖機共用；`readdirSync` 動態白名單。無 runner 的專案 e2e 一律單檔跑，`npm test` 不得含 e2e。
- cwd：以專案根為 cwd 執行，setup 內相對路徑以 `projRoot` 解析；cwd 錯會整檔「標準圖不存在」假紅。
- **測試中介資料一律落 `test/_tmp/`（gitignore），測完即刪**：臨時 settings、fixture 副本、合成 log 目錄等放 `test/_tmp/<用途>/`，由該測試檔 `after` 或 setup `cleanup()` 刪除（追蹤本進程建立的檔案逐一 `rm`，目錄空了再 `rmdir`）。**絕不可放專案 `./tmp/`**——那是 AI 代理的暫存區，隨時會被整個清除，測試執行途中被刪即假失敗（殷鑑：三專案 `genTempSettings` 原寫 `./tmp/`；golden 產生器留在 `./tmp/` 隨清除佚失）。fixture 資產（golden logs、expected、`_staref`）不是中介資料，放 `test/<fixture>/` 入版控。

### 9.3 端點一律 `127.0.0.1`

`localhost` 先試 IPv6 `::1`，dev-server 常只綁 IPv4 → 每連線多 ~150–200ms；node fetch 不走 Happy-Eyeballs 所以 node 打不慢（誤判陷阱）。四象限隔離：browser localhost vs 127.0.0.1；browser vs node；`netstat` 只有 `0.0.0.0` 沒 `[::]`。殷鑑：186ms 當 server 瓶頸追鬼一整個 session。

## 10. 場景手冊

| 場景 | 作法 |
|---|---|
| 高頻 API（rate limit / 封鎖） | `page.evaluate` 內 `Promise.allSettled` 並行 fetch（走 browser stack）；門檻可用 `genTempSettings` 暫調小；`>` vs `>=` 以 spec 為準 |
| 模擬不同 client IP | `ctx.route('**/*')` 僅本機 URL 加 `X-Forwarded-For`（`newContext({extraHTTPHeaders})` 會套到 CDN → icon 缺圖）；絕不封 127.0.0.1；後端不信任 XFF 的專案改 fixture log |
| in-memory 計數清除 | 僅本機 + token 放行的清除 API，`beforeEach` 打；fail-closed 情境下沉 unit |
| server 注入語系之初始畫面 | 打後端 serve 的 build 非 dev server；保留不可變模板或冪等還原佔位符；URL 不帶 `?lang=`；**最低覆蓋**：連線中畫面（`page.route` 攔截不回應使懸置；abort 會變斷線畫面）＋ 登入 / 主畫面；其他連線狀態以前端狀態 API 強制切換（setup 例外） |
| email round-trip | 真打信箱 API 輪詢（`afterTime` 減 1 分鐘）抓連結；憑證缺 fail-fast |
| 統計 / 依時間漂移 | 後端確定性優先：mock 資料集（settings 開關）、fixture log（非 ISO 檔名繞過輪替清理）、合成 log 目錄 + `restartBackend`；仍漂移才貼圖覆蓋 |
| 成功訊息 | 停留 modal 不用 toast |
| 按鈕視覺鎖 | `pm.resolve()` 放 handler 第一行，否則 e2e 永遠截到 loading 態 |
| 雙擊 / 並發防護 | 前端真雙擊 UI；後端 mutex 以 `api-` 測試 `Promise.allSettled` 並行 2 次，契約（一成功一 reject / 皆成功無 lost-update）依專案 |
| 回應含 build hash / 日期 | 正規化或遮 header 區塊 |

## 11. 執行與探索

### 11.1 跑 mocha

`--reporter list` 且不接 pipe；長跑 `run_in_background` + Read output；`--timeout` 依專案。`--grep` 過濾掉 outer `it` 時 nested `before` 會在 DB 未 setup 前執行（徵狀「找不到 user / 30s timeout」是 artifact 非 production bug）：`--grep` 涵蓋 outer 至少一個 case、或 nested 自己 setup、或 outer 改 `before`。

### 11.2 Timing flake 自己修

「給它無限時間會穩定通過嗎？」會 → timing flake 自己 iterate（加 wait → 具體 ready 訊號 → 連續 rAF → 5s 仍 flake 才隔離）；不會 → 真問題才問使用者。不把 flake 包裝成「A 或 B」拋給使用者；不拿掉 pixel 層。超容差真差異照 references 七步。

### 11.3 w-screenctl 探索

測試本體永遠 Playwright；w-screenctl 只探索。①health → ②第一個動作 navigate + screenshot（JSON wrapper `jq -r .image | base64 -d`，`file` 驗 magic number；偽圖檔 Read 進 API 會讓 session 永久 400）→ ③視覺確認後才 evaluate → ④試互動 → ⑤selector 寫回。連續 evaluate 三次沒截圖＝立刻截圖。不傳 `viewport`（傳了無法 resize 驗 RWD）。

## 12. 完成前勾選

```
- [ ] §0 勘查已做：runner / 拓撲 / 語系資料 / 映射表 / 姊妹先例
- [ ] case 對照表：spec 每 bullet × 語系 → it() → baseline，gap 已分類；多階段截圖已主動提出
- [ ] 6 步 user path 在每個新 case 註解；抹平步驟標「未走 UI」；按鈕 covered/uncovered 已輸出
- [ ] act 無 L4–L6；assert 每條對應 spec；動作鏈步數 ≥ spec
- [ ] 每 case fresh browser + DB 重置；所有語系皆跑；regen 端同管線
- [ ] baseline 命名 <flow>-<lang>-E2E-NNN-…；regen 有授權；--names 截圖前 gate；strict settle；git diff --stat 僅預期；certify 通過
- [ ] 核心契約無缺口，條件式 adapter 已標適用/不適用；chromium.launch 只在 wrapper；紅框後合成；cleanup 兩來源
- [ ] --grep 單跑與全跑一致；testPending 無本輪殘留；./tmp 清乾淨；netstat 無殘留 server
```

回報格式：rubric 五維 → case 對照表 → 執行紀錄 → `git diff --stat` → 契約缺口與已知不修。
