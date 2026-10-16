---
name: role-coder-for-test
description: |
  全層級測試（unit／api／e2e）之共通規範：測試是規格的翻譯而非現狀的指紋（每條 assertion 對應 spec 句、觀察字眼須有 UI 斷言、驗端到端不變式、聚合層依 spec 處置、產品缺陷步驟標 pending）；語意斷言為主、pixel baseline 為補強層（雙向約束、反鋸齒感知容差非 byte-exact、產前自列每張預期、重產須授權且只產受影響者、失敗證據落 ./testPending）；測試分層與檔名前綴（`e2e-`／`api-`／`unit-`，同一層 test/ 以前綴分類、名實不符要正名、UI 無法自然觸發者下沉）；目錄配置（test/*.test.mjs、test/tools、test/pics、test/_tmp、./testPending，測試程式禁用 ./tmp）；執行（不用 .mocharc.json、package.json 之 scripts 只放 test、mocha 限定指令、單檔指令自行編寫、--grep 與巢狀 before 之陷阱、port ≥ 8000 不隨機）；測試／樣本數據之連結與引用必須真實可驗證；附依任務找章節表與完成前勾選。e2e 特有之操作層級、標準圖、截圖穩定性與隔離另加 role-coder-for-test-e2e；spec 本身之處置見 role-coder-for-spec。
  觸發條件：寫、改、審、拆、移除、重構任何測試；新增測試檔或盤查 test 目錄；產或重產 baseline；設定 package.json 之 test script、runner 或 port；跑測試；產製測試／樣本／示範數據——必先調用本技能，整篇入 context 逐項比對後才動工。
---

# 測試規範(全層級)

**觸發條件**:寫、改、審、拆、移除、重構任何測試;新增測試檔或盤查 test 目錄;產或重產 baseline;設定 `package.json` 之 test script、runner 或 port;跑測試;產製測試/樣本/示範數據.本篇整篇入 context 逐項比對後才動工.測試全綠只證明回歸未壞;宣告完成之判準見 skill[role-coder-for-validate].

**與其他技能之分工**(命中者一併調用,本技能各條仍適用):

| 範圍 | 技能 |
|---|---|
| 全層級共通:斷言是 spec 之翻譯,語意斷言與 pixel baseline 之分工,分層與前綴,目錄,執行,測試數據 | 本技能 |
| e2e 特有:真瀏覽器之操作層級,每 case 隔離,標準圖(操作手冊用圖)之產製,審圖與重產流程,截圖穩定性 | skill[role-coder-for-test-e2e] |
| spec 本身:什麼算 spec,缺漏與不符之處置,e2e 流程 spec 之撰寫 | skill[role-coder-for-spec] |
| 宣告完成之判準(回歸,表覆蓋,使用者視角驗收) | skill[role-coder-for-validate] |

## 0. 依任務找章節

| 任務 | 必看 |
|---|---|
| 寫或改任何 assertion | §1,§2 |
| 產或重產 baseline,pixel 比對 | §2 |
| 新增測試檔,決定放哪一層 | §3,§4 |
| 設定 `package.json` 之 test script,runner,port;跑測試 | §5 |
| 產製測試/樣本/示範數據 | §6 |
| 宣告完成前 | §7 |

## 1. 測試是規格的翻譯,不是現狀的指紋

assertion 必須是 spec 的可執行翻譯,不是[跟上次跑出來一樣]的指紋.[產 baseline → `buf.equals(baselineBuf)` → 通過]不是測試,是 regression detector——若 baseline 產出時系統已偏離 spec,偏離被凍結為真理,測試通過反而是 false negative.

1. **Reflex check**:寫每條 assertion 前自問[這條 predicate 對應 spec 哪一句?]對不上＝現狀指紋,刪或回 spec 找對應(skill[role-coder-for-spec] §4);每條 assertion 註解標明對應之 spec 句.(LLM 偏好機械安全路徑如 `buf.equals`,此 check 就是擋這條.)
2. spec 含[畫面/顯示/轉跳/卡/出現/看到/看不到/進入]等觀察字眼 → 必須有對應之 UI 斷言,純後端 trigger 才能只驗 DB;spec[N 步後 → 觀察 M] → 測試步驟數 ≥ spec 動作數,被 helper 抹平的步驟明標[未走 UI].
3. 能驗端到端不變式(外部應用實際查到的結果)就驗它,不只驗中間資料存對.
4. 寫 assertion 時發現實作把 N 種狀態併成 M 種訊息 → 依 skill[role-coder-for-spec] §3 聚合層規則處置,不改 test 將就.
5. 走到產品缺陷的步驟:依 skill[role-coder-for-spec] §3 進〈已知落差〉,該步拋帶已知缺陷標記之錯誤讓 runner 標 pending;不用放行旗標讓壞畫面通過,不寫[baseline 凍結的是現況畫面].

## 2. 語意斷言為主,pixel baseline 為補強層(雙向約束)

1. 語意斷言驗[特定資訊在/不在],pixel baseline 驗[整體畫面長相],抓的是不同類 regression;對有 stable visual state 的 case,baseline 是**必要補強層非 optional**.雙向約束:只有 pixel-equality 沒語意斷言不接受;modal/轉跳/UI 切換 case 只有 innerText/URL 不加 baseline 也不接受.
2. 補強層之 pixel 比對採**反鋸齒感知容差**,非 byte-exact——白話:不要逐 byte 比整張圖(`buf.equals`),改用[允許少量像素不同]的比對:pixelmatch(`includeAA:false` 自動忽略反鋸齒邊緣像素)+ `maxDiffPixels` 容差.why:SVG icon/字型邊緣之次像素 raster 跨 browser session 不決定性,byte-exact 會把[肉眼等同的反鋸齒 noise]當失敗 → 無止境 flake.**典型錯誤形狀**:icon 全面改用 SVG 後,原本的 byte-exact 比對炸出大量次像素 flake.容差只放補強層,主驗證仍語意斷言(不違反第 1 條);真 regression(icon 換/版面位移/顏色變)量級遠超 maxDiffPixels 仍被抓.同業界 Playwright `toHaveScreenshot`(maxDiffPixels/threshold).
3. 產 baseline 前,從 spec 自己列[每張預期看到什麼]清單;產實際 baseline → 比對 → 不吻合修系統/修 spec,不是改 baseline 將就;不把預期清單丟給使用者 review(skill[role-coder-for-spec] §2).
4. 重產須先取得授權,且只產受影響者;無差別重產＝把 bug 凍結為真理.已審過的圖被重產等於換掉真理,即使內容看起來一樣.
5. 比對失敗之證據(capture/baseline/diff 三聯組)落專案根 `./testPending/`(§4),永不覆蓋、不自動刪——偶發 flake 的當次證據常在隔天才分析.

## 3. 測試分層與檔名前綴:`e2e-` / `api-` / `unit-`

測試檔一律以前綴標明層級,**同一層 `test/` 目錄內以前綴分類,不開 `e2e/` `api/` `unit/` 子目錄**(子目錄只給資產與工具,見 §4):

| 前綴 | 層級 | 判準 | 典型 runner |
|---|---|---|---|
| `e2e-` | 端對端 | 真瀏覽器 + 真鍵盤滑鼠,act/assert 走 user-facing 路徑 | Playwright(mocha 逐檔或直跑) |
| `api-` | 介面 | 直打 HTTP/RPC 端點,不經 UI | mocha / jest |
| `unit-` | 單元 | 純函式,元件掛載(jsdom),不起 server | jest / mocha |

- 檔名 `e2e-xxx` 但 act 用 `page.evaluate` / `vm.method()` → 名實不符,**正名為 `api-` 或 `unit-`,或重寫成真 e2e**(skill[role-coder-for-test-e2e] 有 L1-L6 操作層級表).
- UI 無法自然觸發者(fail-closed、後端並發序列化)→ 下沉 `api-`/`unit-`,不在 e2e 硬造.
- 共用層與輔助工具(setup 模組、runner、產生器)不帶 `.test.` 中綴且放 `test/tools/`(§4),避免被 runner 當測試檔抓取.
- 專案若無某層(如純前端函式庫無後端)則該前綴不出現,不需硬造.

## 4. 目錄配置:什麼放哪,誰負責清

| 路徑 | 放什麼 | 規則 |
|---|---|---|
| `test/*.test.mjs` | 測試檔 | 一律 `.test.mjs`,依 §3 前綴分層;不開 `e2e/` `api/` `unit/` 子目錄 |
| `test/tools/*.mjs` | 輔助測試與配套工具:setup 共用層、逐檔隔離 runner、baseline 產生器 | 一律 `.mjs`,不帶 `.test.` 中綴;同一 helper 只定義一次,測試檔內第二份近似實作＝補丁堆積 |
| `test/pics/<flow>/` | e2e 標準圖(baseline) | 入版控;spec 或規範另有指定路徑者從其指定 |
| `test/_tmp/<案名>/` | 測試中之臨時/中繼檔(暫時 settings、fixture 副本、合成 log、資料庫快照) | gitignore;各測試自建專用資料夾,由該測試檔之 `after` 或 setup 之 cleanup 刪除,測完即刪,不殘留 |
| `./testPending/` | pixel 比對失敗之三聯組證據 | gitignore;ms 時間戳、永不覆蓋、**不自動刪**(人工清理) |
| `./tmp/` | AI 代理暫存區(全域規範之暫存檔規則) | **測試程式禁用**——隨時會被整個清除,測試途中被刪即假失敗.**典型錯誤形狀**:暫時 settings 與 golden 產生器寫在 `./tmp/`,隨一次清理佚失 |

## 5. 執行:`package.json`、mocha 與 port

- 請勿使用`.mocharc.json`,此會造成套件與專案批次處理機制無法統一,無法自動化調整與擴充,請勿自行創建使用.

- 若agent想用mocha運行指定測試檔,請自行編寫指令執行.

- `package.json`內本來就該放全部單元測試的指令,不是為了agent方便執行多種測試指令而被視為指令庫.**自有套件**(函式庫、元件、工具類)之`package.json`內scripts一律僅提供test,也就是只提供`npm test`快速指令,變更會造成套件與專案批次處理機制無法統一,請勿自行擴充調改.**自有計畫/專案**(系統、網站等應用)不在「僅提供test」之列,既有之serve/build/lint/deploy等指令照留;但測試類指令同樣只有test,不為agent方便增設變體(要跑單層或單檔依上條自行編寫).

- `package.json`內,若有要使用mocha,scripts給予值請依照有無parallel兩種情形,限定使用其對應指令:
**有parallel**:`mocha --parallel \"test/*.test.mjs\" --timeout 180000`
**無parallel**:`mocha --no-parallel \"test/*.test.mjs\" --timeout 180000`

- 若有啟動伺服器要開port,若太多得須有自動配發port的機制,都要8000以上,也禁止用隨機產生,否則常一堆衝突導致測試失敗.

- `--grep` 過濾掉 outer `it` 時,nested `before` 會在 DB 未 setup 前執行(徵狀「找不到 user / 30s timeout」是 artifact 非 production bug):`--grep` 涵蓋 outer 至少一個 case、或 nested 自己 setup、或 outer 改 `before`.

- 預估超過 2 分鐘之測試執行(全跑,長鏈)依全域規範之長任務規則,先調用 skill[role-setup-scheduler-for-session]:背景指令一律明給 `timeout`,超過 115 分鐘者 detached 執行.

## 6. 測試/樣本數據之連結、引用、外部參考必須真實可驗證,不可捏造

**觸發**:產製任何測試/樣本/示範數據,其欄位含 URL、外部參考文獻、報告編號/序號,或關聯到內部既有資料時.

**背景**:LLM 自由生成領域內容時天然會捏造[看似合理]的具體引用——假 URL,拿 `google.com/search?q=` 當參考連結,虛構報告編號(如自編 `SKB TR-XX-XX` 配自擬標題),同一個佔位 query 配不同假標題.這類數據交付業主/行政單位驗收時**一點即知為假 → 直接扣分甚至減價驗收**.這是捏造[看似真實的具體內容]在數據層的變體.

**鐵則**:
1. **連結須真實可連通**:不用 `google.com/search` 當參考連結;不捏造 URL 或報告編號.產出前 `curl -sI`(或 `-o /dev/null -w %{http_code}`)驗 HTTP 200.
2. **引用真實既有物**:內部關聯優先參照系統內**確實存在**的項目(真實節點/需求編號+名稱,由資料本身或關聯圖推導);外部參考只用**已驗證存在**之真實文獻——可沿用同專案其他模組已驗證之參考集(如既有真實模組之法規/報告 URL),不另憑空生.
3. **具體標識查不到就不給**:報告編號、序號、標題、DOI、法規條號等只能用真實查得者;查不到 → 欄位可空則留空,或改用泛稱,絕不自編.
4. **寧缺勿假**:欄位允許空值(如 `necessary:'n'`)時,無真實對應就留空,遠優於填假資料.
5. **委派子代理產內容必明文禁捏造**:子代理自由生成領域內容最易捏造連結/引用,派工 prompt 須明訂[只用可驗證之真實來源,禁 google query 當連結,禁自編報告編號],並要求可追溯來源;收回後逐欄查有無假 URL/假編號才接受.

**交付前自問**:[這個連結/引用,業主點下去或去查證,會成立嗎?]不確定＝不可交.

## 7. 完成前勾選

逐項打勾才可宣告完成;不適用者寫明[不適用]與理由,不可留空.

- [ ] 每條 assertion 註解標明對應之 spec 句;沒有[跟上次一樣]之指紋斷言(§1)
- [ ] spec 之觀察字眼都有 UI 斷言;步驟數 ≥ spec 動作數,被 helper 抹平者已標[未走 UI](§1)
- [ ] 走到產品缺陷之步驟以已知缺陷標記標 pending,並已進〈已知落差〉(§1)
- [ ] 有穩定視覺態之 case 語意斷言與 pixel baseline 兩者皆有;pixel 比對為反鋸齒感知容差非 byte-exact;產前已自 spec 列每張預期;重產經授權且只產受影響者(§2)
- [ ] 檔名前綴與實際層級相符;共用層與工具在 `test/tools/` 且不帶 `.test.`(§3,§4)
- [ ] 測試中之臨時檔在 `test/_tmp/<案名>/` 並由測試自己清掉;測試程式沒有寫 `./tmp/`(§4)
- [ ] 沒有 `.mocharc.json`;`package.json` 之測試類指令只有 test,mocha 指令為上列限定字串之一(§5)
- [ ] 啟動之伺服器 port ≥ 8000 且不隨機(§5)
- [ ] 測試/樣本數據之連結已驗 HTTP 200,引用皆真實可查,查不到者留空(§6)
- [ ] 完成判準已依 skill[role-coder-for-validate] 另行確認,沒有只以測試全綠宣告完成
