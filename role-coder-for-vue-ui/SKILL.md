---
name: role-coder-for-vue-ui
description: |
  Vue UI 程式規範技能（w-component-vue / Vue 2 系）：非同步提交統一寫法（core() 五段結構、loading 用 finally 統一關、可預期錯誤走 inline 紅字，外包 runSubmit 送出流程狀態）、Vue 2 template `@event` handler 禁用 async 開頭 inline arrow（compiler 靜默編錯陷阱）、有副作用按鈕之雙擊防護（`promiseUnlock` 鎖交給 runSubmit 至請求結束、handler 不解鎖；鍵盤 Enter 與輸入框 Enter 同一流程狀態；結果訊息框期間重入仍擋；單例訊息框須了結前一等待者；後端依操作者占位）。
  觸發條件：凡撰寫或修改 Vue UI 之非同步提交流程（UI 函式呼叫 async 後端函式、loading/錯誤處理）、template `@event` handler、`promiseUnlock` 按鈕、送出鈕／確認框／結果訊息框之防連發、或以 `show()` 回傳 promise 之單例對話框的任務——寫/改/審/重構——必先調用本技能，整篇入 context 逐項比對後才動工。
---

# Vue UI 程式規範

**觸發條件**:凡撰寫或修改 Vue UI 之非同步提交流程,template `@event` handler,`promiseUnlock` 按鈕,送出防連發,或單例對話框的任務,本篇整篇入 context 逐項比對.

## 1. 非同步提交的統一寫法:`core()` 五段 + `finally` 關 loading,外包 `runSubmit`

[UI 函式呼叫一或多個 async 後端函式]一律走同一個 `core()` 五段結構:①初始化清空舊 inline 錯誤 → ②事先檢測(所有同步 early-return 檢查,在開 loading 之前)→ ③確定要打 API 才 `updateLoading(true)` → ④執行(每個 async 各自 catch 設自己的 inline 錯誤,`okX` 旗標 `if (!okX) return` 短路——短路是 load-bearing)→ ⑤外層 `.catch` 接非預期例外,`.finally` 統一關 loading(一處關閉不重複不漏關).可預期錯誤走 inline 紅字;成功 / 失敗通知依專案政策(如以 `showCheckYes` 訊息框呈現者,開框前先 `updateLoading(false)`).**有副作用之送出,整段再包進 `$ui.runSubmit`**(§3).

Canonical 範本(API 名為 w-component-vue / Vue2 範例,他專案沿用結構替換機制):

```js
submitXxx: function(opt = {}) {                                   //opt.pm: 按鈕之 promiseUnlock 鎖(§3), 其他入口不帶
    let vo = this
    let core = async (unlockBtn) => {
        vo.aError = ''                                            //1) 清空舊 inline 錯誤
        if (!isestr(vo.foo)) { vo.aError = vo.$t('...');return } //2) 同步檢測, 在開 loading 之前(inline 錯誤: 流程隨即結束, 鎖由 runSubmit 釋放)
        if (vo.bar === 0) { unlockBtn();await vo.$dg.showCheckYes(vo.$t('...'));return } //  早退且開訊息框者: 開框前 unlockBtn()
        vo.$ui.updateLoading(true)                                //3) 確定打 API 才開 loading
        let okA = false                                           //4) 每個 async 各自 catch + 旗標短路
        await vo.$fapi.doA(...)
            .then((res) => { okA = true })
            .catch((err) => { console.log('doA',err);vo.aError = vo.$t('...') })
        if (!okA) return
        vo.$ui.updateLoading(false)                               //   訊息框前先關 loading(同時釋放按鈕鎖)
        await vo.$dg.showCheckYes(vo.$t('saveSuccess'), { type: 'success' }) //流程涵蓋至結果訊息框關閉
        return 'ok'                                               //5) 全成功才回傳, 中途失敗回 undefined
    }
    return vo.$ui.runSubmit('submitXxx', (unlockBtn) => {         //同 key 進行中再觸發即略過(§3)
        return core(unlockBtn)
            .catch((err) => { console.log('catch',err);return vo.$dg.showCheckYes(vo.$t('anUnexpectedErrorOccurred'),{ type: 'error' }) }) //以訊息框呈現者回傳其 Promise
            .finally(() => { vo.$ui.updateLoading(false) })
    }, opt)
}
```

特例:登入重導(成功後跳轉)——成功路徑不關 loading(否則跳轉前閃滅),把 `updateLoading(false)` 從 `finally` 移到 `catch`,且 `runSubmit` 帶 `hold: (r) => r === 'redir'` 保持占位與按鈕鎖至頁面離開.套用前先 grep 專案既有 canonical 範例沿用,不要每檔自創;看到不符寫法應提報並經同意後改齊.

## 2. Vue 2 template 內 `@event` handler 一律用 method 名,禁用 `async` 開頭 inline arrow

Vue 2 compiler 對 `@event="async (args)=>{...}"` 會靜默編錯(fnExpRE 不匹配 `async` 開頭 → 整段被包進 `function($event){}` 後 Babel 轉成只定義不呼叫的 IIFE)→ handler 永不執行且無 warning.規則:`@event` 一律用 method 名;需 slot scope / v-for 動態 args 時用 **non-async** arrow bridge 到 method(`@click="(msg) => onClickX(msg,id)"`).偵測:`grep -rn '@\w\+="async' src/` 命中即 bug.搭 `:promiseUnlock="true"` 時此 bug 會讓按鈕鎖永不釋放 → button 永久卡鎖,災難組合.殷鑑:w-web-sso 4 顆按鈕用 inline async arrow 致全 e2e 61 fail.

## 3. 有副作用按鈕之雙擊防護:鎖交給 `runSubmit` 至請求結束,handler 不解鎖

**為何(2026-09-29 實測推翻舊寫法)**:全頁 loading、確認框與結果訊息框(WDialog)**只擋滑鼠、不搶焦點**,焦點留在按鈕或輸入框時,鍵盤 Enter / 空白鍵照樣觸發;WButtonChip / WButtonCircle 之滑鼠與鍵盤同走元件 `clickBtn`,受 `loadingTrans` 擋——舊規則「handler 第一行 `msg.pm.resolve()` + fire-and-forget」使鎖立即解除,鍵盤連按即送 2 次(5ms 連按實測,新增列被第 2 次當修改覆寫).**`pm.resolve()` 第一行只適用於不打 API 之按鈕**.

1. **按鈕(元件層)**:有副作用之 WButtonChip / WButtonCircle 一律 `:promiseUnlock="true"`,handler 為 method 名、**不於 handler 解鎖**,把鎖交給送出函式:

    ```js
    onClickSaveBtn: function(msg) {     //非 async
        let vo = this
        vo.submitXxx({ pm: msg.pm })    //鎖由 runSubmit 於請求結束(updateLoading(false))或流程結束時釋放
    },
    ```

2. **送出流程狀態(`$ui.runSubmit(key, fn, opt)`)**:核心為純邏輯模組 `src/plugins/submitGuard.mjs`(可單元測試;新專案自 w-web-sso 複製),`mUI` 匯出 `runSubmit`,並於 `updateLoading(false)` 呼叫 `releaseBtnLocks()`.規則:
    - 同 key 之流程進行中(自觸發至流程結束,**含結果訊息框開啟期間**)再觸發即略過,被略過之觸發立即釋放其按鈕鎖.
    - **同一操作之所有入口共用一個 key**:按鈕滑鼠 / 鍵盤、輸入框 Enter(不帶 pm)、快捷鍵.
    - `fn` 收到 `unlockBtn`:未打 API 即開訊息框之早退路徑、**先開確認框之流程**(自開確認框起整段包進 runSubmit)於開框前呼叫,按鈕鎖只涵蓋請求期間;重入仍由流程狀態擋.
    - `opt.hold(r)` 回 true 時保持占位與鎖(如登入成功轉址).
    - 原生 `<button>` 無 pm:照樣經 runSubmit,`:disabled` / 旗標只作顯示(重繪後才生效).
    - 不套用:純查詢、無副作用之按鈕、前端純 toggle、只把資料 resolve 回頁面而不打 API 之對話框儲存鈕(可保留第一行 `pm.resolve()` 並註解理由).
3. **單例訊息框 / 對話框**(以 `show()` 回傳 promise 之共用元件,如 CheckYes / CheckYesNo / 編輯對話框):`show()` 開頭若 `vo.pm` 已存在,先了結前一個等待者——結果框 `resolve()`(視同確定)、確認框 `reject('close')`(視同選否)、對話框 `reject('close window')`(視同關閉);否則被取代之流程永久等待,其 runSubmit key 永不釋放、該操作再也無法觸發.
4. **後端(API 直打繞過前端)**:以「操作:操作者 id」原子占位(wsemi `cacheSt().setWithFree`,各專案 `server/lockSave.mjs`),同一操作者之同一操作處理中再送出即 **reject 錯誤 key,不排隊**(排隊之第 2 次會重寫一次:新增列被當修改覆寫或多插一列);不同操作者仍由既有 mutex 序列化.前端自產新列 id 者,新列帶 transient `_isNew` 送後端,id 已存在即拒(擋依序重送);若表之 id 可由使用者改寫,新列重用本次刪除之 id 時送出前先正規化為「修改該列」,否則被誤判為重送.
5. **驗證方法**:以真瀏覽器對「焦點在按鈕 / 輸入框連按 Enter」量測,間隔要短(5ms;80ms 時第 1 次常已完成、按鈕已隱藏,「沒重現」不等於有擋);請求數以**後端日誌**計數,不以前端解請求本體.`submitGuard` / `lockSave` 以受控 deferred 單元測試,真後端以只斷言時序無關不變式之 api 測試(至少 1 成功、被拒者只能是占位 key、資料終態).
6. **元件已知缺陷(w-component-vue ≤ 2.5.23,2026-09-29 已修正)**:WButtonCircle 以 `v-if` 換掉游標下之圖示(promiseUnlock 或 `loading` 之載入圖示、停用遮罩)後,若同一輪出現全頁遮罩或游標隨即移開,未採「命中節點被移除後以最近祖先為目標」之瀏覽器(Chrome 144 以前;Playwright ≤1.62 之預設停用此功能)不派發 mouseleave → tooltip 與 hover 狀態殘留;真 Chrome 144+ 不會,只出遮罩而未移除節點亦不會.修正為圖示容器與停用遮罩 `pointer-events:none`,以已安裝之 `WButtonCircle.vue` 圖示容器是否帶 `pointer-events:none` 判斷是否已含修正.未升版前,e2e 於截圖前(游標已移開)偵測殘留即依已知缺陷協定標 pending,**不得把含殘留提示框之畫面當標準圖、也不得寫成「可接受狀態」之註解**;判別與處置詳 skill[role-coder-for-test-e2e] §10〈提示框／hover 殘留〉.

檢查:`rg -n "promiseUnlock" src/components` 之每顆有副作用按鈕,其 handler 不得有可執行之 `msg.pm.resolve()`、送出函式須經 `runSubmit`;`rg -n "runSubmit\('" src` 列 key 全集;`rg -n -B6 "vo\.pm = genPm\(\)" src/components` 每處之前須有了結段.
