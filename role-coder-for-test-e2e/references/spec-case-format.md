# spec「重要流程」之 E2E-NNN case 撰寫格式

適用於 `spec/流程_*.md` 的「重要流程」章節；每個 `E2E-NNN` 以三層 bullet 撰寫。與流程文件撰寫技能（scope 紀律、呼叫鏈 `[file:line]` 格式）並存——那是上位規則，本篇只規範 E2E-NNN bullet 內部怎麼寫。

## 三點結構（順序固定，缺一不可）

- **title**：一句話（≤ 25 字）說「在使用者觀察視角這個 case 驗證什麼」。動詞落在使用者視角（成功登入、顯示錯誤訊息、轉址至某頁），不寫後端機制。
- **description**：2–6 句，交代 ①觸發條件 / 前置狀態（關鍵欄位語意值：`isActive='y'`、`timeVerified` 為空、已被封鎖…）②預期 outcome（轉址、停留登入頁顯示某訊息、按鈕變灰、出現 modal…）③spec 粒度規則（防帳號列舉共用訊息、共用 baseline、流程鏈主角共用、分段截圖之第 N 段）。
- **flow**：契約等級的測試藍圖，五個固定 bullet：

| # | bullet | 寫什麼 |
|---|---|---|
| 1 | 測試資料 | user / token / IP 等 seed 的關鍵欄位語意值；流程鏈共用 user 標明「由 E2E-NNN ~ E2E-MMM 共用」 |
| 2 | 操作 | 起點頁 → user-facing 動作（輸入、點擊）用 `→` 串接，按鈕名雙語並列（「Log in」/「登入」） |
| 3 | 驗證 | 「語意」（DOM 文字 / URL / 元素存在性）+「視覺」（baseline 檔名 `test/pics/<flow>/<flow>-{eng,cht}-E2E-NNN-name.png`）；比對採感知容差為全專案統一機制，不逐 case 複述、不寫成 API 呼叫；共用他 case 的 baseline 寫明「與 E2E-002 共用 `…png`，本案例不另存檔」 |
| 4 | 雙語 | 預設「eng / cht 各一輪」；純 UI 無語系差異寫「僅 eng 一份」 |
| 5 | 清理 | 預設「移除本檔特化 user，保留 base seed」；流程鏈中段寫「由 E2E-MMM 結束後統一移除，本段不獨立清理」 |

## 契約等級，不是 code-mirror

判別句：「production code 改 100 行、helper 全部重新命名，這條 flow 還能讀懂、還是同一個契約嗎？」是 → 留；否 → 丟。

| 保留（契約） | 丟掉（實作細節） |
|---|---|
| 測試資料的欄位語意值 | helper 函式名（`insertTestUsers`、`simulateAdminReset`、`startServersOnce`） |
| 使用者操作層級（點按鈕、輸入欄位） | Playwright API（`page.locator`、`keyboard.insertText`、`waitUntilExist`） |
| 應觀察到的 UI 文字、URL、DOM 終態 | 固定 wait 數字（`waitForTimeout(8000)`、`timeout: 5000`）→ 改「等待 redirect 完成後」 |
| baseline 檔名路徑 | 比對 API（`assertBaselineMatch(...)` / `pixelmatch(...)`） |
| 雙語覆蓋的語系清單 | 內部 mode 旗標 / 常數（`mode='absentLoginButton'`）；使用者可見的 URL query 以 `?view=user` 形式描述 |
| 清理範圍 | DB / ORM 字面（`woItems.users.save(...)`）、後端呼叫鏈（`procProtect.checkXxx → procAuth.signToken`）、selector 字面（`button[data-fmid="login"]`） |

對照：`page.locator('button[data-fmid="login"]').click()` → 「點『Log in』/『登入』按鈕」。

## 跨 case 連結

- **baseline 共用**（防帳號列舉、相同視覺終態）：description 點明共用對象與原因；驗證 bullet 檔名後加註「與 E2E-XXX 共用」。
- **前置狀態承接**（多 case 共用 user，狀態逐步推進）：description 標「本案例為 X 流程之第 N 段，使用 user `id-xxx`（後續 E2E-AAA ~ E2E-BBB 共用）」；清理 bullet 標「由 E2E-末端 結束後統一移除」。
- 只引本文件內的 case，不引外部 `spec/流程_*.md`。

## 寫完前自問

1. title 是使用者觀察視角？
2. description 有觸發條件 + 預期 outcome + 跨 case 連結？
3. flow 五個 bullet 順序對、一個不少？
4. flow 內沒有 helper 名 / Playwright API / 固定 wait / selector / 後端模組名？
5. 共用 baseline / 共用 user 在 description 與 flow 雙處點明？

新寫 case 前先讀該專案既有 `spec/流程_*.md` 對齊風格，不從零自創。
