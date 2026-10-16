# 程式碼呼叫鏈文件(trace + 輸出格式)

本檔為 SKILL.md §5 所指之呼叫鏈文件撰寫規範.

**觸發**:使用者要求[寫流程文件/呼叫鏈文件/trace 這支函式/為 spec API event 產出 markdown 規格]時套用.核心準則:①鏈路完整(追到底不漏層);②可回溯(每執行行標 `[檔名:行號]`);③縮排即歸屬(縮排深度反映呼叫層級與 catch 攔截範圍).

**調研步驟**:①確認入口 → ②追蹤呼叫鏈到最底層,每層讀原始碼不憑記憶(grep 須涵蓋整個相關目錄含相關 `node_modules/<套件>/` 才能下[沒有]結論;追到明確控制流之 `file:line` 即為答案,不再以數 log 等間接測量[再驗證])→ ③標每個 await/Promise(無 catch 的標[reject 時 throw 至 XXX]指明被哪個外層接住)→ ④標每個條件判斷 → ⑤記錄 file:line → ⑥過濾無關內容.

**輸出格式規則**:

- 縮排:每進一層呼叫 4 格;同函式內步驟同層級,不同函式內容不混層.
- 呼叫展開順序依實際執行:先展開被呼叫函式內部實作,再列 `.then` / `.catch`(內部執行完回傳後才觸發).
- await 回傳後繼續執行的部分回到呼叫者縮排層級,不留在被呼叫者縮排內.
- 函式內定義的 async function(如 `core()`):其內部步驟縮排在 core() 之下,`.catch` 與 core() 同層(才看得出攔截範圍).
- `.then` / `.catch` 獨立成行,內容換行縮排;本身要標 file:line.
- 條件判斷:描述[檢查什麼],各條件結果換行縮排;分支標籤行(如 `不一致:`)不標 file:line(非獨立執行行).
- 檔名行號放該行最末尾 `[檔名:行號]`.
- 流程步驟編號固定 3 位數(001,002…);行號範圍用 `-` 不用 `~`(避免 markdown 刪除線).
- 不列入:delay/sleep,loading 切換,console.log,純 log,不影響分支的變數賦值.
- 描述:清楚中文寫[做什麼]不寫 pseudo-code;函式名保留(如 `執行非同步流程 core()`);不壓縮一動作一行;reject 字串用單引號.

範例(縮排與歸屬):

```
呼叫 outerFunc.foo  [outerFile.mjs:xx]
    執行非同步流程 core()
        呼叫後端 funcA,無 catch,reject 時 throw 至 .catch  [xx.mjs:yy]
            [funcA 內部展開]
            比對密碼雜湊  [authService.mjs:263]
                不一致:
                    reject('incorrect user account or password')  [authService.mjs:264]
            回傳結果
        後端回傳成功,繼續前端處理  [xx.mjs:zz]    ← 回到核心流程層級
    .catch  [xx.mjs:ww]    ← 與 core() 同層
        處理錯誤
```

**輸出結構**:`# XXX 流程` → `## 觸發`(觸發點說明)→ `## 流程`(code block 巢狀列表)→ `## 補充表格`(視需要:檢查順序,錯誤處理層級,分流條件,i18n 訊息粒度等).
