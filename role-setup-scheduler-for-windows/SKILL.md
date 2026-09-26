---
name: role-setup-scheduler-for-windows
description: |
  在 Windows 以「工作排程器（Task Scheduler）」建立定時／常駐任務的完整要點：任務型態判別（一次性週期 job vs 常駐長命行程）與 ExecutionTimeLimit／MultipleInstancesPolicy 的相反正解、「不撞上限」靠程式內整輪時間預算（budgetOf 守門與封頂；不調高排程上限、不壓各步預算，判準用程式碼上限而非觀測值）、工作排程 vs nohup 背景行程之邊界（RestartOnFailure 只管「啟動失敗」、不管程式崩潰）、**不彈 cmd 黑視窗的唯一正解（LogonType 決定跑在 session 0）**、Password 與 S4U 的選擇判準（密碼會不會變＝唯一決策點，含靜默失敗機制）、XML 建立配方（schtasks /create /xml 必須 /ru 與 /rp * 成對、XML 檔編碼、修改一律匯出重建不用 /change）與 schtasks 起底配方、PowerShell 5.1 編碼陷阱、PowerShell 呼叫 schtasks 之引號（--% 或單引號包 \"）、cmdlet 參數名與列舉值之差異（-MultipleInstances 沒有 StopExisting，可改設 CIM 屬性值 3）、上線讀回驗證（含 LastTaskResult=0 不等於成功之陷阱、schtasks 讀回之編碼與有號十進位）、失敗碼對照與「莫名不跑」排查（含專案資料夾搬移）、日常管理（免提權；手動觸發不受 ExecutionTimeLimit 約束）。
  觸發條件：使用者要求「設定 Windows 工作排程」「排定時任務」「schtasks」「Task Scheduler」「讓腳本每隔 N 分鐘／小時自動跑」「開機／登出後仍要跑的定時任務」「常駐行程的心跳看門狗」「讓排程任務不彈出 cmd 視窗／隱藏執行視窗」「排程莫名不跑」「改排程任務的動作或路徑」「專案資料夾搬移／更名後調整排程」時觸發。
---

# role-setup-scheduler-for-windows — Windows 工作排程設定要點

## 概述

以 Windows 工作排程器建立定時／常駐任務的實務要點。核心來自 `c:/tai-news-ai` 專案（2026-09-24 前為 `c:/tai-news`）**實際採用且穩定運作數月**的設定（每小時執行），以及多次實測驗證的結論。

**最常被問的「不彈 cmd 黑視窗」**：網路上方法很多（VBScript 包裝、`start /min`、PowerShell `-WindowStyle Hidden`…），但真正的關鍵只有一個設定項——見 §3。

> 本文標註「實測」者為實機驗證；標註「未實測」者為推論或官方文件所載，部署前請自行確認。

## 何時使用此 Skill

- 要讓腳本每隔 N 分鐘／小時自動執行
- 要讓任務在登出或未登入時仍執行
- 排程任務會閃黑視窗，想根治
- 常駐行程需要心跳／看門狗機制
- 排程「莫名不跑」的排查
- 專案資料夾搬移／更名、進入點改名後，要改排程任務的動作與起始位置

---

## 1. 先分清任務型態（一切的決策起點）

| 型態 | 腳本行為 | 排程的角色 |
|---|---|---|
| **A. 一次性週期 job** | 跑完就退（如每小時抓資料、每日產報表） | 「每 N 時間」**就是**真正的業務觸發 |
| **B. 常駐長命行程** | 自己跑著不退、內部有計時器決定節奏 | 「每 N 分」只是**心跳／看門狗**：行程還活著就略過、死了才重新拉起 |

> **為何要先分**：A 和 B 在 `ExecutionTimeLimit`、`MultipleInstancesPolicy` 的正解是**相反**的。挑錯會讓 A 的卡死無法被中止、或 B 被中途砍掉。

### 邊界：用工作排程，還是直接背景行程（nohup &）？

「不跳 cmd 視窗」兩條路都做得到，但**持久性差很多**。

判準：**「重開機／登出後還要不要自己回來？」** 要 → 工作排程；不要（只需當前開機週期內跑著）→ nohup 背景行程即可。

| 能力 | `nohup node app.mjs &` | Task Scheduler（session 0） |
|---|---|---|
| 不跳 cmd 視窗 | ✅ 繼承既有 shell 的 console | ✅ session 0 無桌面 |
| 開機自動啟動 | ❌ | ✅ |
| **重開機後存活** | ❌ 死了就沒了 | ✅ |
| crash 後自動重拉 | ❌（除非自寫看門狗） | ⚠ 靠心跳 TimeTrigger 重拉；`RestartOnFailure` 不管程式崩潰（見下註） |
| **登出後存活** | ❌ 不可靠（登出常連帶 session 拆除被殺） | ✅ |
| 語法可攜性 | `nohup`／`&` 是 Git Bash 語法，非原生 cmd/PowerShell | 原生 |

> **為何兩者都不跳視窗（共同機制）**：Windows 只有在替 console 程式分配**全新的 conhost** 時才冒新視窗。從既有 shell 內啟動 node ＝繼承父 shell 的 console、不另開 conhost；session 0 則根本無可顯示視窗的桌面。兩者都缺「新 conhost」這一步。

> **殷鑑**：「要一直在、定時做事」的常駐服務＝型態 B，其痛點正是「重開機／登出後沒人拉回來」。用 `nohup` 起的行程**重開機就消失且無人重啟**——這種需求該交給工作排程（每 N 分一個 TimeTrigger 當心跳看門狗）。

> **`RestartOnFailure` 的「失敗」只指「排程器啟動不了程式」**：程式已啟動、之後崩潰或以非 0 結束，排程器視為已執行，不會重試。出處：Microsoft Learn 封存之 TechNet 論壇解答「will only re-run the task if the task failed to start」（[連結](https://learn.microsoft.com/en-us/archive/msdn-technet-forums/4545361c-cc1f-4505-a0a1-c2dcc094109a)）；官方 schema 只寫「fails for any reason」，未界定。**未實測**。常駐行程的崩潰重拉要靠心跳 TimeTrigger ＋ `IgnoreNew`，不能指望 `RestartOnFailure`。

---

## 2. 關鍵設定怎麼挑（依型態）

| 設定 | A 一次性 job | B 常駐行程 | 說明 |
|---|---|---|---|
| `ExecutionTimeLimit` | **設有限上限**（`PT20M`～`PT1H`） | **`PT0S`（無上限）** | 預設 3 天（72h）才強制中止（官方：「By default, a task will be stopped 72 hours after it starts」；`PT0S`＝不限時）。A 設上限＝卡死會被殺、不擋下一輪；B 不能被殺。**手動觸發之執行不受此限**（§8） |
| `MultipleInstancesPolicy` | `IgnoreNew` 或 `StopExisting` | **`IgnoreNew`** | 預設即 `IgnoreNew`（2026-09-24 實測：不帶設定建立之任務匯出為 `IgnoreNew`）。B 必用 `IgnoreNew` 避免每個心跳疊一個 |

### `ExecutionTimeLimit` 是外部安全網；「不撞上限」要靠程式內的整輪時間預算

> **先分清兩件事**：`ExecutionTimeLimit` 是排程器在外面的硬上限，撞到即強制終止、連失敗通知都發不出；「不撞上限」要由**程式自己**規劃每輪時間來保證。每小時一輪的工作出現撞限風險時，**不要去調高 `ExecutionTimeLimit`，也不要把各步預算壓到總和小於上限**——前者只是把問題往後推、還要使用者輸入密碼改排程，後者犧牲成功率。
>
> **正解**（比照 tai-kns-trade 2026-09-12 複審 S2「時間預算單一擁有者」，已收斂為 w-knowledge-extract `src/core/budget.mjs` 之 `budgetOf`）：
> 1. 截止＝排程上限 − 安全邊際 6 分（下限 10 分；`w-knowledge-extract/src/core/createKnowledgeExtract.mjs` 第 407–416 行）。排程上限在設定檔登錄一份，作為截止的單一來源。
> 2. 由單一擁有者（`budgetOf(ctx)`）守門：每段開工前、逐項取件前看剩餘時間，不足就不開工——已完成的照送，未做的降級或留待下輪；每次外呼（AI、子行程、HTTP）以剩餘時間封頂。
> 3. 截止之後仍在跑的，只剩「已開始且已封頂」的那一次外呼與最後的通知，整輪必然落在排程上限內。
>
> **判準用程式碼上限，不用觀測值**：觀測到的最大值不是上限。例：tai-news-ai 各步實測最壞值同輪相加 142＋552＋2×420＝1534 秒；依程式碼逐步追到的上限更高——抓文每篇 3 次嘗試×（90＋3）秒＋重試間隔 5、10 秒＝294 秒、5 篇 1470 秒（`wsemi/src/execCli.mjs` 第 186–214、494–500 行）；Telegram 通知器未給逾時則每次嘗試只受 Node 內建 fetch（undici）預設 `headersTimeout` 300 秒、`connectTimeout` 10 秒所限，失敗立即重試共 4 次。兩者都遠超 1200 秒。
>
> **實例（tai-news-ai）**：AI 遞補預算 `rotationBudgetMs` 原設 780000，當時以「低於 1200 秒」認定安全——錯在拿**每次呼叫**的預算與**整輪**上限比（每輪呼叫 AI 兩次，最壞 1560 秒）；2026-08-14 下修為 420000 仍不保證（見上）。以 1008 輪日誌重放「截止 840 秒＋逐篇與每次外呼封頂」之守門，歷史上實質受影響 0 輪（2026-09-24 模擬，尚未實作）。
> 撞破上限的後果：**行程被強制終止時，連失敗通知都發不出去**，變成靜默失敗。該專案下修前整輪曾達 1191.2 秒（2026-06-17，上限之 99%），另有三輪日誌停在中途、沒有結束紀錄，推測即遭逾時中止。
> **數字一律由日誌重算**：該專案註解原載之各步耗時（45 秒、300 秒）與「歷史最高 809.5 秒」皆已過時或不實，重算後才發現上述缺口。

---

## 3. 不彈 cmd 黑視窗：唯一正解是 LogonType

**視窗會不會出現，由「在哪個 session 執行」決定。**

| `LogonType`（XML） | 對應 UI 選項 | 執行位置 | 有視窗？ | 需密碼？ | 需提權？ |
|---|---|---|---|---|---|
| **`Password`** | 「不論使用者是否登入均執行」＋存密碼 | **session 0**（非互動） | **✅ 無** | **要** | 覆寫既有任務實測免提權；走 GUI 更無須在意（見下） |
| `S4U` | 「不論使用者是否登入均執行」＋不儲存密碼 | session 0 | ✅ 無 | 不要 | **要**（管理員） |
| `InteractiveToken` | 「只在使用者登入時執行」 | 互動桌面 | ❌ **會閃黑視窗** | 不要 | 不要 |
| `InteractiveTokenOrPassword` | — | 同 Password | ✅ 無 | 要 | — |

**只要 `LogonType` 是 `Password` 或 `S4U`，程式就在 session 0 執行，那裡根本沒有互動桌面，視窗無從顯示。** 不需要 VBScript 包裝、`-WindowStyle Hidden` 或任何隱藏技巧。

反之若用 `InteractiveToken`，再怎麼加隱藏參數都會閃一下——視窗是在建立後才被隱藏。

> **官方定義佐證**（Microsoft Learn；2026-09-24 核對原文）：
> - `S4U`：「no password is stored by the system and there is no access to either the network or (to) encrypted files」（[logonType](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-logontype-simpletype) 與 [TASK_LOGON_TYPE](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_logon_type) 皆載）、「the task will run in a **non-interactive desktop**」（僅 TASK_LOGON_TYPE 載）
> - `InteractiveToken`：「User must already be logged on. The task will be run only in an **existing interactive session**」
> - `InteractiveTokenOrPassword`：「**No longer in use; currently identical to Password**」

> ⚠ **`<Hidden>true</Hidden>` 不是用來隱藏視窗的**——它只控制任務是否顯示在「工作排程器」清單中。常被誤解。

### 實測：未提權 PowerShell 註冊結果（2026-08-10）

```
[OK]   LogonType=Interactive  免提權免密碼可註冊   ← 但會閃視窗（2026-09-24 以 schtasks 未提權再測亦成功）
[FAIL] LogonType=S4U          Access is denied.   ← 註冊需管理員身分（刪除是否亦需：推測，未留實測紀錄）
```

### `Password` 是否需提權：**走 GUI 設定即無須在意**

`Password` 本來就必須輸入密碼，**無法純腳本化免互動註冊**——既然一定要人在場，有兩條路：

- **GUI**：「工作排程器」若需要權限，**作業系統會自行彈出 UAC 提示**，使用者按下去即可，不必事先知道要不要提權；也不需要先開「以系統管理員身分執行」的終端機。
- **`schtasks /create /xml <檔> /ru <電腦名>\<帳號> /rp *`**：由 schtasks 自己詢問密碼（輸入不回顯），密碼不進命令列與歷史檔，XML 內其餘設定一次到位（§5 配方 A）。除了人輸入一次密碼，其餘都可腳本化（tai-kns-trade `src/tools/install-schedule.mjs` 即此法）。

**實測（2026-09-24）**：以上述 schtasks 指令**覆寫既有** Password 型任務，在標題無「系統管理員」字樣之一般 PowerShell 視窗執行成功。新建任務是否亦免提權：未實測。

> **對比：`S4U` 的「需提權」才是會實際踩到的限制。**
> S4U 免密碼，正適合寫成**完全無人值守**、可版控、可重現的註冊腳本；但腳本在一般終端機跑會直接 `Access is denied`（上方實測）。
> 也就是說：**要完全無人值守就選 S4U，並記得那個腳本必須在管理員終端機執行**；可接受「人輸入一次密碼」就用 `Password`（GUI 或 schtasks `/rp *`）。

### S4U 會不會讓使用者設定檔失效？實測：不會（2026-08-10）

若專案高度依賴**使用者設定檔**下的狀態（AI 金鑰、CLI 執行檔、provider 定義），最大疑慮是 S4U 會不會像 `SYSTEM` 那樣解析到別的設定檔。實際註冊 `LogonType=S4U` 測試任務探測並與互動環境逐項比對：

| 項目 | 互動環境 | **S4U（session 0）** |
|---|---|---|
| `USERNAME` | semi | semi ✅ |
| `USERPROFILE` | `C:\Users\semi` | 同左 ✅ |
| `APPDATA` | `C:\Users\semi\AppData\Roaming` | 同左 ✅ |
| `PATH` 含 npm 全域 | true | true ✅ |
| 可讀 `auth.json`（AI 金鑰） | true | true ✅ |
| 可讀 provider 定義 | true | true ✅ |
| 可讀三個 CLI 執行檔 | true | true ✅ |
| **實際 AI 呼叫** | ✅ 3762ms | **✅ 3829ms** |

`LastTaskResult=0`。**結論：S4U 保留使用者設定檔與環境變數，整條管線正常運作**，與 `Password` 等價。唯一差異是 `WorkingDirectory` 字串大小寫（`C:` vs `c:`），無實質影響。

> 對照：若改用 `SYSTEM`（`ServiceAccount`），設定檔會落在 `C:\Windows\System32\config\systemprofile`，上表的金鑰與 CLI 路徑將全部解析不到。**此項為推論，未實測**。

---

## 4. Password vs S4U：唯一決策點是「密碼會不會變」

> **只要執行帳號的密碼有可能被變更**——不論政策定期輪換或人工不定期修改——**就必須用 `S4U`**。

**理由**：`Password` 的本質是「把密碼交給工作排程器保管，供它日後建立登入權杖」。密碼一旦變更，保管的那份就過期，**排程器再也無法建立權杖，任務直接無法啟動**。

### 危險之處：這是「靜默失敗」

密碼變更後的失敗**不會出現在程式的日誌裡**——因為程式根本沒被啟動。表徵：

- 專案日誌**完全沒有新檔案**（不是內容有錯，是整個沒產生）
- `LastTaskResult` 為登入失敗類錯誤碼（如 **`0x8007052E`**＝1326「使用者名稱或密碼不正確」；完整對照見 §9）
- 沒有任何通知或告警會主動送到面前

**若沒有人主動去看排程狀態，可以壞很久都無人察覺。**（曾有專案因「產生日誌前就崩潰」而靜默壞了 6 天，性質相同——凡「程式沒被啟動」的失敗，都無法靠程式自己的日誌發現。）

> `0x8007052E` 的成因經查證確認為**密碼變更後未更新排程憑證**（Windows 不會自動同步）；少數情況為排程器憑證資料庫損毀。

### 適用判準

| 執行環境 | 選擇 |
|---|---|
| 個人機器、密碼長期不動 | `Password` 可用（走 GUI 建立最簡單，UAC 由系統自行處理） |
| **企業／線上伺服器，有密碼輪換政策** | **必須 `S4U`** |
| **任何「密碼可能被改」的環境**（含臨時人工修改） | **必須 `S4U`** |
| 需以該使用者身分存取網路磁碟／整合驗證 | 兩者皆不適用，見下方限制 |

**成本比較**：`S4U` 的代價是註冊需一次管理員權限（刪除推測亦需）——**一次性**；`Password` 的代價是**每次密碼變更後都要回頭重設**，忘記就靜默停擺。在密碼會變的環境，維運負擔差距只會隨時間拉大。

### S4U 的限制

S4U 權杖**不具網路認證憑據**（官方明載 no access to network or encrypted files），無法以該使用者身分存取 SMB 網路磁碟，或對遠端服務做 Windows 整合驗證。

- 純本機執行 ＋ 對外 HTTP（RSS／Telegram／AI CLI 等）**不受影響**——已實測。
- 若須經「需要整合驗證的 Proxy」上網，或任務要讀寫網路磁碟，**須另行驗證**。

---

## 5. 建立配方

### 配方 A：XML 一次到位（推薦）

節錄如下；完整檔須含 `<Task>` 根元素與 `<RegistrationInfo>`，建議以 `schtasks /query /tn <既有任務> /xml` 匯出後修改（匯出之編碼見下方「實測要點」）。

```xml
<Principals>
  <Principal id="Author">
    <UserId>S-1-5-21-…</UserId>
    <LogonType>Password</LogonType>   <!-- ← 不彈視窗的關鍵 -->
  </Principal>
</Principals>

<Triggers>
  <TimeTrigger>
    <StartBoundary>2026-03-25T00:00:00</StartBoundary>
    <Repetition>
      <Interval>PT1H</Interval>        <!-- 每小時 -->
    </Repetition>
  </TimeTrigger>
</Triggers>

<Actions Context="Author">
  <Exec>
    <Command>C:\Program Files\nodejs\node.exe</Command>   <!-- 直接指向 exe -->
    <Arguments>c:\tai-news-ai\src\trigger-run.mjs</Arguments>
    <WorkingDirectory>c:\tai-news-ai</WorkingDirectory>
  </Exec>
</Actions>

<Settings>
  <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
  <MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>
  <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
  <Hidden>true</Hidden>
  <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>
  <StopIfGoingOnBatteries>true</StopIfGoingOnBatteries>
</Settings>
```

註冊（兩種擇一；**首選 schtasks**——密碼由系統詢問、不留在命令列）：

```bat
schtasks /create /tn trigger-news-ai /xml C:\path\task.xml /ru <電腦名>\<帳號> /rp * /f
```

```powershell
Register-ScheduledTask -TaskName 'trigger-news-ai' -Xml (Get-Content 'task.xml' -Raw) -User 'DOMAIN\user' -Password '…'
```

> ⚠ `-Password '…'` 會把密碼**明文**留在命令列與 PowerShell 歷史檔（`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`，本機實存）。能用上面的 schtasks `/rp *` 就不要用這條。
> `-Xml (Get-Content <檔> -Raw)` 讀 UTF-16LE＋BOM 檔之註冊機制：2026-09-24 以 InteractiveToken 暫時任務於未提權 PowerShell 5.1 實測可用；帶 `-User`／`-Password` 之 Password 型未實測。

**優點**：所有設定一次到位、可版控、可重現。`schtasks /create` 的**非 XML 參數**涵蓋不到全部設定項（例如 `MultipleInstancesPolicy`）；`/xml` 則以 XML 為準，全部設定都帶得進去。

#### `schtasks /create /xml` 實測要點（2026-09-24）

- **`/rp *` 必須搭配 `/ru`**：`schtasks /create /?` 寫「當工作 XML 已經包含原則時，單獨使用 /RP」，實際回「錯誤: 語法不正確。沒有指定使用者名稱，所以無法指定密碼。」。加 `/ru <電腦名>\<帳號>` 即成功，讀回 `<UserId>` 仍為原 SID、`<LogonType>` 仍為 `Password`。帳號先以 `whoami.exe /user` 核對 SID 與 XML 內 `<UserId>` 相同（Git Bash 的 `whoami` 是 MSYS 版，不支援 `/user`）。
- **XML 檔編碼**：UTF-16LE＋BOM 可匯入；宣告 `encoding="UTF-8"` 的無 BOM 檔被拒（「工作 XML 格式不正確。(1,40)::錯誤: 無法切換編碼」）；`schtasks /query /xml` 經管線存下的單位元組檔（宣告仍為 UTF-16、內容純 ASCII）可匯入。**一律存成 UTF-16LE＋BOM 最保險**（內容含非 ASCII 時未實測）。
- **修改既有任務一律「匯出 → 改 → `/create /xml … /f`」，不用 `schtasks /change`**：`/change` 連 InteractiveToken 型任務都會要求輸入執行身分密碼（實測）；另據 tai-news-ai 專案紀錄，`/change /tr` 會清掉起始目錄（WorkingDirectory）並在程式路徑外多包一層引號（本次未能重驗）。
- `/f` 會刪除並重建任務（§8）；改完照 §7 讀回逐欄比對。

### 配方 B：schtasks 起底 + Set-ScheduledTask 補設定

第 1 步在 **cmd.exe** 執行：

```bat
:: 不帶 /ru /it ＝ InteractiveToken（2026-09-24 實測），會閃視窗；
:: 要登出也跑改加 /ru <電腦名>\<帳號> /rp *（由 schtasks 詢問密碼，勿把密碼寫在命令列）
schtasks /create /tn "my-task" /tr "\"C:\Program Files\nodejs\node.exe\" c:\proj\app.mjs" /sc hourly
```

> 這一行是 cmd.exe 語法：`\"` 由 schtasks 自己的命令列解析當成引號。PowerShell 的跳脫字元是反引號、`\` 不是跳脫字元（[about_Quoting_Rules](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-5.1)、[about_Parsing](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing?view=powershell-5.1)）。
> **實測（2026-09-24，PowerShell 5.1.26100）**：同一行照打進 PowerShell，schtasks 收到的引數被拆成 `\`、`C:\Program`、`Files\nodejs\node.exe\ c:\proj\app.mjs`，回「ERROR: Invalid argument/option - 'C:\Program'.」，任務沒建立。在 PowerShell 要用下列兩種寫法之一（皆實測成功；匯出之 `<Command>` 為 `"C:\Program Files\nodejs\node.exe"`——schtasks 連引號一起存——`<Arguments>` 為其後參數）：
>
> - 在 `schtasks` 後加**停止解析符號** `--%`，其後照打 cmd 那一行：`schtasks --% /create /tn "my-task" /tr "\"C:\Program Files\nodejs\node.exe\" c:\proj\app.mjs" /sc hourly`。`--%` 之後整行原樣傳遞，只展開 `%變數%`，不能再接 `;`、管線或重導向（about_Parsing）。
> - 或 `/tr` 值改用單引號、內含 `\"`：`/tr '\"C:\Program Files\nodejs\node.exe\" c:\proj\app.mjs'`。
>
> 以上依 Windows PowerShell 5.1 實測；PowerShell 7 未實測。

第 2 步在 PowerShell 執行，補上 schtasks 涵蓋不到的設定：

```powershell
Set-ScheduledTask -TaskName "my-task" -Settings (New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -MultipleInstances IgnoreNew)
```

> 第 2 步實測（2026-09-24，以 InteractiveToken 暫時任務、未提權）：匯出為 `<ExecutionTimeLimit>PT20M</ExecutionTimeLimit>`、`<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`。
>
> ⚠ **`-MultipleInstances` 沒有 `StopExisting`**：PowerShell 5.1 ScheduledTasks 模組之列舉只有 `Parallel`、`Queue`、`IgnoreNew`（`C:\Windows\System32\WindowsPowerShell\v1.0\Modules\ScheduledTasks\MSFT_ScheduledTask_v1.0.cdxml` 第 62–66 行）。2026-09-24 實跑回「Cannot convert value "StopExisting" … Specify one of the following enumerator names and try again: Parallel, Queue, IgnoreNew」。要 `StopExisting` 就走配方 A 的 XML，或繞過列舉、直接設 CIM 屬性值 `3`（2026-09-24 實測，匯出為 `StopExisting`）：

```powershell
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$s.CimInstanceProperties.Item('MultipleInstances').Value = 3   # 3 = StopExisting
Set-ScheduledTask -TaskName "my-task" -Settings $s
```

> 第 1 步若已建成 Password 型，第 2 步是否需再給 `-User`／`-Password`：未實測（`schtasks /change` 實測會要求密碼）；此時直接改走配方 A。

### 各設定項的理由

**`<Exec>` 直接指向執行檔，不經 cmd／.bat 包裝**

- **不要**寫成 `cmd /c node ...` 或包一層 `.bat`：多一層行程與引號跳脫，`.bat` 含中文另有編碼問題（須存 Big5）。註：node.exe 本身就是主控台程式（PE Subsystem＝3，2026-09-24 實測），包不包 cmd 都一樣需要主控台——有沒有視窗由 LogonType 決定（§3），與包裝層無關。
- 路徑用**絕對路徑**，不靠 PATH 解析：`<Command>` 解析不到時，排程器根本啟動不了程式，`LastTaskResult`＝`0x80070002`（系統找不到指定的檔案；`schtasks /v` 以有號十進位顯示為 `-2147024894`，2026-09-24 實測），程式自己的日誌一行都不會有。（§3 實測 S4U 下 PATH 與互動環境相同，故不要把原因說成「session 0 的 PATH 不同」；排程器如何以 PATH 搜尋 `<Command>` 未實測，絕對路徑可免除這個不確定性。）
- 同理，程式內部若要調用其他 CLI，也應使用絕對路徑（程式內 spawn 找不到執行檔，才是 Node 的 `ENOENT`）。

**用 `TimeTrigger` + `Repetition`，不要用 `LogonTrigger`**

`LogonTrigger` 只在登入時觸發，登出或未登入就完全不跑——與「不論是否登入都執行」矛盾。`TimeTrigger` 搭配 `<Repetition><Interval>PT1H</Interval></Repetition>` 才是穩定的週期執行。

**電池相關設定：桌機無意義，筆電要留意**

`DisallowStartIfOnBatteries` / `StopIfGoingOnBatteries` **預設為 `true`**（2026-09-24 實測），代表用電池時不會執行、切到電池時會中止。

- 桌上型電腦（無電池）此二項不生效，維持預設即可。
- **若部署在筆電，這是最常見的「排程莫名不跑」原因**，須明確設為 `false`。

### GUI 建立時的對應選項

「工作排程器」介面的關鍵在**一般 → 安全性選項**：

- 選「**不論使用者是否登入均執行**」→ `LogonType=Password`（會要求輸入密碼）
- 勾「不要儲存密碼」→ `S4U`（同樣 session 0，也不會有視窗）
- 選「只在使用者登入時執行」→ `InteractiveToken`，**會閃視窗**

---

## 6. 三個實際踩過的坑

### 6.1 給 PowerShell 5.1 的 `.ps1` 一律用純 ASCII

PowerShell 5.1 讀 `.ps1` 時，若檔案**沒有 UTF-8 BOM**，會改用系統 ANSI codepage（如 Big5）解析。以一般工具產生的無 BOM UTF-8 檔案，其中的中文會變亂碼，且常直接**破壞字串字面值**而報 `TerminatorExpectedAtEndOfString` 這種與編碼無關的語法錯誤，極難聯想到根因。

> 實例（2026-08-10）：註冊腳本中一行 `Write-Output '確認實際生效的 LogonType：'` 被解析成亂碼並中斷，錯誤訊息只說「字串遺漏結尾字元」。

**做法**：腳本原始碼一律純 ASCII，中文只放在它輸出的**資料**裡（由 Node 等其他程式寫）。若非得在 `.ps1` 內寫中文，必須存成**帶 BOM 的 UTF-8**。驗證：

```bash
node -e 'const b=require("fs").readFileSync("x.ps1");console.log([...b].filter(c=>c>127).length===0?"純ASCII":"含非ASCII")'
```

### 6.2 Cmdlet 參數名與 XML 元素名不同，不要互相套用

| XML 元素 | PowerShell 參數／列舉值 |
|---|---|
| `<MultipleInstancesPolicy>` | `-MultipleInstances` |
| `InteractiveToken` | `Interactive` |

> 實例：直接沿用 XML 的 `-MultipleInstancesPolicy` 會得到「找不到符合參數名稱」；用 `InteractiveToken` 當列舉值會得到「無法將識別碼名稱轉換成有效的列舉」。

**本機實測（2026-08-10，PowerShell 5.1；2026-09-24 以 `-LogonType X` 再測，錯誤訊息列出之清單相同）之 `-LogonType` 合法列舉值**（與 `MSFT_ScheduledTask_v1.0.cdxml` 第 53–61 行一致）：

```
None, Password, S4U, Interactive, Group, ServiceAccount, InteractiveOrPassword
```

**`-MultipleInstances` 之合法列舉**（同檔第 62–66 行；2026-09-24 實跑確認）：`Parallel, Queue, IgnoreNew`——**沒有 `StopExisting`**。XML 的 `<MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>` 用 cmdlet 參數設不出來，要走配方 A 的 XML，或配方 B 之註的 CIM 屬性值 `3` 繞法（實測有效）。

**做法**：不確定時直接查該機器實際支援的值，不要猜：

```powershell
(Get-Command New-ScheduledTaskSettingsSet).Parameters.Keys     # 查參數名
New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType X  # 故意給錯值，錯誤訊息會列出所有合法列舉
```

### 6.3 註冊前先把物件建立步驟預跑一遍

`New-ScheduledTaskAction`／`Principal`／`SettingsSet` 三者**都不需要提權**即可建立物件；註冊時是否需提權**依登入型態而定**——Interactive 免（§3 實測）、S4U 需（§3 實測）、Password 以 schtasks `/rp *` 覆寫既有任務於一般視窗成功（§3）。故可先在一般 shell 把前三步跑過確認無參數錯誤，需提權時再把註冊那一步交出去執行——避免在提權視窗中反覆試錯。

---

## 7. 上線後的讀回驗證

建立完**不要假設成功**，讀回實際生效的設定：

```powershell
# 完整設定
Export-ScheduledTask -TaskName 'trigger-news-ai'

# 執行狀態
Get-ScheduledTask -TaskName 'trigger-news-ai' | Get-ScheduledTaskInfo |
    Select-Object LastRunTime, LastTaskResult, NextRunTime
```

（2026-09-24 於未提權 PowerShell 5.1 對 Password 型正式任務唯讀實測：兩者皆可用。）

不用 PowerShell 時：

```bat
schtasks /query /tn trigger-news-ai /xml
schtasks /query /tn trigger-news-ai /v /fo list
```

> 經管線讀取時注意：兩者輸出皆為系統 codepage（繁中 Windows 為 cp950）的單位元組——`/xml` 的檔頭卻宣告 `UTF-16`，程式解析時要以 codepage 解碼；`/v` 之「上次結果」以**有號十進位**顯示（`-2147024894`＝`0x80070002`）。（2026-09-24 實測）

**要確認的重點**：

1. `<LogonType>` 是否為 `Password` 或 `S4U`（決定有無視窗）
2. `<Command>` 是否為絕對路徑的執行檔
3. `<Triggers>` 是否為 `TimeTrigger`（非 `LogonTrigger`）
4. `NextRunTime` 是否為預期的下一個時間點（**空值＝沒排上＝壞**）
5. `<Arguments>`／`<WorkingDirectory>` 是否為現行路徑（專案資料夾搬移／更名後最常漏）

### 判讀陷阱：`LastTaskResult=0` 不等於任務成功

程式若**自行捕捉錯誤並優雅結束**，作業系統看到的仍是正常退出，`LastTaskResult` 仍為 0。

> 實例：曾發生「整批新聞遺失、只發出失敗通知」，但 `LastTaskResult` 為 0。光看排程狀態完全發現不了。

**故驗證是否真的成功，必須讀程式自己的日誌**，不能只看排程回報值。

---

## 8. 日常管理（免提權）

```powershell
Start-ScheduledTask   -TaskName 'trigger-news-ai'   # 立即執行一次（⚠ 不受 ExecutionTimeLimit 約束，見下）
Disable-ScheduledTask -TaskName 'trigger-news-ai'   # 暫停
Enable-ScheduledTask  -TaskName 'trigger-news-ai'   # 恢復
```

（2026-09-24 以自建之 InteractiveToken 暫時任務於未提權 PowerShell 5.1 實測：`Start` 可觸發（`<Command>` 不存在時上次結果＝`0x80070002`）、`Disable` 後狀態 Disabled、`Enable` 後 Ready；Password 型任務未測，不拿正式任務試。）

> **手動觸發不受 `ExecutionTimeLimit` 約束**：官方明載「If a task is started on demand, the ExecutionTimeLimit setting is bypassed」（[ITaskSettings::ExecutionTimeLimit](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itasksettings-get_executiontimelimit)）——手動執行卡住不會被強制中止，要自己盯。

修改設定（`Register-ScheduledTask -Force`、`schtasks /create /f`）須注意：**這類操作會刪除並重建任務，可能中斷正在執行的實例**。若當下有實例在跑，宜等其結束再改，或改用 `Set-ScheduledTask` 只調整特定屬性（Password 型任務改屬性是否仍需給密碼：未實測；`schtasks /change` 實測連 InteractiveToken 型都要求密碼）。

---

## 9. 摘要

### 不彈視窗只需做對一件事

**`LogonType` 設為 `Password` 或 `S4U`**（＝「不論使用者是否登入均執行」）。

其餘隱藏技巧（VBScript `WScript.Shell.Run` 帶 `0`、`start /min`、`-WindowStyle Hidden`）都是**用錯 `LogonType` 的前提下**才需要的補救措施。把這一點做對，這些全都不需要。

另建議 `<Exec>` 直接指向執行檔、不包 cmd／.bat——理由是少一層行程與引號跳脫（§5），**與視窗無關**（node.exe 本身就是主控台程式）。

### Password 或 S4U：看密碼會不會變

**只要執行帳號的密碼有可能被變更，就必須用 `S4U`。**

`Password` 把密碼交給排程器保管，密碼一變那份就過期，**任務直接無法啟動**，而且是**靜默失敗**——程式沒被啟動，專案日誌完全不會有新檔案，也不會有任何告警。

S4U 的代價（註冊需一次管理員權限；刪除推測亦需）是一次性的；`Password` 的代價（每次改密碼都要重設，忘了就靜默停擺）是持續性的。

### 排程「莫名不跑」的排查順序

1. `NextRunTime` 是否為空（沒排上）
2. `LastTaskResult` 是否為登入失敗類（程式根本沒被啟動，日誌不會有新檔）：
   - `0x8007052E`＝使用者名稱或密碼不正確——典型成因：密碼已變更，排程器存的舊密碼沒更新（§4）
   - `0x80070532`＝此帳戶的密碼已到期
   - `0x80070569`＝登入失敗: 未授與使用者這個電腦所要求的登入類型
   - （錯誤碼原文以 `net helpmsg 1326`／`1330`／`1385` 查得；後兩者與排程之關係未實測）
3. 是否為筆電且 `DisallowStartIfOnBatteries=true`
4. 是否誤用 `LogonTrigger`（未登入就不跑）
5. `<Command>`／`<Arguments>`／`<WorkingDirectory>` 是否指向不存在的路徑——用了指令名，或**專案資料夾搬移／更名、進入點改名後沒改排程**（`<Command>` 找不到＝`0x80070002`，§5）
