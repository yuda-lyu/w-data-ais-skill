---
name: role-code-for-vue-ui
description: |
  Vue UI 程式規範技能（w-component-vue / Vue 2 系）：非同步提交統一寫法（core() 五段結構、loading 用 finally 統一關、可預期錯誤走 inline 紅字）、Vue 2 template `@event` handler 禁用 async 開頭 inline arrow（compiler 靜默編錯陷阱）、`promiseUnlock` button handler 之 pm.resolve() 第一行 + fire-and-forget 模式。
  觸發條件：凡撰寫或修改 Vue UI 之非同步提交流程（UI 函式呼叫 async 後端函式、loading/錯誤處理）、template `@event` handler、或 `promiseUnlock` 按鈕的任務——寫/改/審/重構——必先調用本技能，整篇入 context 逐項比對後才動工。
---

# Vue UI 程式規範

**觸發條件**:凡撰寫或修改 Vue UI 之非同步提交流程,template `@event` handler,或 `promiseUnlock` 按鈕的任務,本篇整篇入 context 逐項比對.

## 1. 非同步提交的統一寫法:loading 用 `core()` + `finally`,錯誤用 inline 紅字

[UI 函式呼叫一或多個 async 後端函式]一律走同一個 `core()` 五段結構:①初始化清空舊 inline 錯誤 → ②事先檢測(所有同步 early-return 檢查,在開 loading 之前)→ ③確定要打 API 才 `updateLoading(true)` → ④執行(每個 async 各自 catch 設自己的 inline 錯誤,`okX` 旗標 `if (!okX) return` 短路——短路是 load-bearing)→ ⑤外層 `core().catch` 接非預期例外(`console.log(err)` + `$alert`),`core().finally` 統一關 loading(一處關閉不重複不漏關).可預期錯誤走 inline 紅字不走 alert.

Canonical 範本(API 名為 w-component-vue / Vue2 範例,他專案沿用結構替換機制):

```js
submitXxx: function() {
    let vo = this
    let core = async () => {
        vo.aError = ''                                            //1) 清空舊 inline 錯誤
        if (!isestr(vo.foo)) { vo.aError = vo.$t('...');return } //2) 同步檢測,在開 loading 之前
        vo.$ui.updateLoading(true)                                //3) 確定打 API 才開 loading
        let okA = false                                           //4) 每個 async 各自 catch + 旗標短路
        await vo.$fapi.doA(...)
            .then((res) => { okA = true })
            .catch((err) => { console.log('doA',err);vo.aError = vo.$t('...') })
        if (!okA) return
        return 'ok'                                               //5) 全成功才回傳,中途失敗回 undefined
    }
    core()
        .catch((err) => { console.log('catch',err);vo.$alert(vo.$t('anUnexpectedErrorOccurred'),{ type: 'error' }) })
        .finally(() => { vo.$ui.updateLoading(false) })
}
```

特例:登入重導(成功後跳轉)——成功路徑不關 loading(否則跳轉前閃滅),把 `updateLoading(false)` 從 `finally` 移到 `catch`.套用前先 grep 專案既有 canonical 範例沿用,不要每檔自創;看到不符寫法應提報並經同意後改齊.

## 2. Vue 2 template 內 `@event` handler 一律用 method 名,禁用 `async` 開頭 inline arrow

Vue 2 compiler 對 `@event="async (args)=>{...}"` 會靜默編錯(fnExpRE 不匹配 `async` 開頭 → 整段被包進 `function($event){}` 後 Babel 轉成只定義不呼叫的 IIFE)→ handler 永不執行且無 warning.規則:`@event` 一律用 method 名;需 slot scope / v-for 動態 args 時用 **non-async** arrow bridge 到 method(`@click="(msg) => onClickX(msg,id)"`).偵測:`grep -rn '@\w\+="async' src/` 命中即 bug.搭 `:promiseUnlock="true"` 時此 bug 會讓 `pm.resolve` 永不觸發 → button 永久卡鎖,災難組合.殷鑑:w-web-sso 4 顆按鈕用 inline async arrow 致全 e2e 61 fail.

## 3. `promiseUnlock` button handler:`pm.resolve()` 放 handler 第一行 + fire-and-forget innerFn

```js
onClickSubmitXxxBtn: function(msg) {   //非 async
    let vo = this
    msg.pm.resolve()                    //第一行立刻釋放視覺鎖
    vo.submitXxx()                      //fire-and-forget,不 await
},
```

理由:`pm.resolve` 設計意圖只是釋放視覺鎖(官方範例皆如此),同步雙擊已被元件內 `loadingTrans` guard 擋住,非同步雙擊由 fn 內 `updateLoading(true)` 全頁 overlay 接管,modal 開啟期間使用者本就無法點 button.反模式:`async (msg) => { await fn();msg.pm.resolve() }` 會把解鎖延到 modal 關閉 → e2e 截圖卡 loading → baseline drift＋不必要 UX 鎖定.slot scope 場景用 non-async arrow bridge,method 內仍第一行 resolve.檢查:`:promiseUnlock="true"` 的 handler 含 `await` 都檢視一遍.
