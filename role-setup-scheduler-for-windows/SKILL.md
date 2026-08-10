---
name: role-setup-scheduler-for-windows
description: |
  在 Windows 以「工作排程器（Task Scheduler）」建立定時／常駐任務的完整要點：任務型態判別（一次性週期 job vs 常駐長命行程）與 ExecutionTimeLimit／MultipleInstancesPolicy 的相反正解、工作排程 vs nohup 背景行程之邊界、**不彈 cmd 黑視窗的唯一正解（LogonType 決定跑在 session 0）**、Password 與 S4U 的選擇判準（密碼會不會變＝唯一決策點，含靜默失敗機制）、schtasks 與 Register-ScheduledTask XML 兩種建立配方、PowerShell 5.1 編碼陷阱、cmdlet 參數名與 XML 元素名之差異、上線讀回驗證（含 LastTaskResult=0 不等於成功之陷阱）、日常管理（免提權）。
  觸發條件：使用者要求「設定 Windows 工作排程」「排定時任務」「schtasks」「Task Scheduler」「讓腳本每隔 N 分鐘／小時自動跑」「開機／登出後仍要跑的定時任務」「常駐行程的心跳看門狗」「讓排程任務不彈出 cmd 視窗／隱藏執行視窗」「排程莫名不跑」時觸發。
---

# role-setup-scheduler-for-windows — Windows 工作排程設定要點

## 概述

以 Windows 工作排程器建立定時／常駐任務的實務要點。核心來自 `c:/tai-news` 專案**實際採用且穩定運作數月**的設定（每小時執行），以及多次實測驗證的結論。

**最常被問的「不彈 cmd 黑視窗」**：網路上方法很多（VBScript 包裝、`start /min`、PowerShell `-WindowStyle Hidden`…），但真正的關鍵只有一個設定項——見 §3。

> 本文標註「實測」者為實機驗證；標註「未實測」者為推論或官方文件所載，部署前請自行確認。

## 何時使用此 Skill

- 要讓腳本每隔 N 分鐘／小時自動執行
- 要讓任務在登出或未登入時仍執行
- 排程任務會閃黑視窗，想根治
- 常駐行程需要心跳／看門狗機制
- 排程「莫名不跑」的排查

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
| crash 後自動重拉 | ❌（除非自寫看門狗） | ✅ `RestartOnFailure` |
| **登出後存活** | ❌ 不可靠（登出常連帶 session 拆除被殺） | ✅ |
| 語法可攜性 | `nohup`／`&` 是 Git Bash 語法，非原生 cmd/PowerShell | 原生 |

> **為何兩者都不跳視窗（共同機制）**：Windows 只有在替 console 程式分配**全新的 conhost** 時才冒新視窗。從既有 shell 內啟動 node ＝繼承父 shell 的 console、不另開 conhost；session 0 則根本無可顯示視窗的桌面。兩者都缺「新 conhost」這一步。

> **殷鑑**：「要一直在、定時做事」的常駐服務＝型態 B，其痛點正是「重開機／登出後沒人拉回來」。用 `nohup` 起的行程**重開機就消失且無人重啟**——這種需求該交給工作排程（每 N 分一個 TimeTrigger 當心跳看門狗）。

---

## 2. 關鍵設定怎麼挑（依型態）

| 設定 | A 一次性 job | B 常駐行程 | 說明 |
|---|---|---|---|
| `ExecutionTimeLimit` | **設有限上限**（`PT20M`～`PT1H`） | **`PT0S`（無上限）** | 預設 3 天（72h）才強制中止。A 設上限＝卡死會被殺、不擋下一輪；B 不能被殺 |
| `MultipleInstancesPolicy` | `IgnoreNew` 或 `StopExisting` | **`IgnoreNew`** | 預設即 `IgnoreNew`。B 必用 `IgnoreNew` 避免每個心跳疊一個 |

### `ExecutionTimeLimit` 要大於實測最壞耗時，且與程式內部逾時預算對齊

> **實例**：某專案 `ExecutionTimeLimit` 設 `PT20M`（1200 秒），其 AI 遞補層設 `rotationBudgetMs = 780000`（780 秒），刻意低於 1200 秒——確保「即使多家 AI 連續逾時」也不會撞破上限。
> 撞破的後果不只中斷：**行程被強制終止時，連失敗通知都發不出去**，變成靜默失敗。
> 實務上曾出現單次 809 秒執行（AI 服務中斷、兩次各逾時 300 秒），已達上限 67%。

---

## 3. 不彈 cmd 黑視窗：唯一正解是 LogonType

**視窗會不會出現，由「在哪個 session 執行」決定。**

| `LogonType`（XML） | 對應 UI 選項 | 執行位置 | 有視窗？ | 需密碼？ | 需提權？ |
|---|---|---|---|---|---|
| **`Password`** | 「不論使用者是否登入均執行」＋存密碼 | **session 0**（非互動） | **✅ 無** | **要** | 走 GUI 即無此問題（見下） |
| `S4U` | 「不論使用者是否登入均執行」＋不儲存密碼 | session 0 | ✅ 無 | 不要 | **要**（管理員） |
| `InteractiveToken` | 「只在使用者登入時執行」 | 互動桌面 | ❌ **會閃黑視窗** | 不要 | 不要 |
| `InteractiveTokenOrPassword` | — | 同 Password | ✅ 無 | 要 | — |

**只要 `LogonType` 是 `Password` 或 `S4U`，程式就在 session 0 執行，那裡根本沒有互動桌面，視窗無從顯示。** 不需要 VBScript 包裝、`-WindowStyle Hidden` 或任何隱藏技巧。

反之若用 `InteractiveToken`，再怎麼加隱藏參數都會閃一下——視窗是在建立後才被隱藏。

> **官方定義佐證**（Microsoft Learn, TaskSchd logonType）：
> - `S4U`：「no password is stored by the system and there is no access to either the network or encrypted files」、「the task will run in a **non-interactive desktop**」
> - `InteractiveToken`：「User must already be logged on. The task will be run only in an **existing interactive session**」
> - `InteractiveTokenOrPassword`：官方註記 **no longer in use，currently identical to Password**

> ⚠ **`<Hidden>true</Hidden>` 不是用來隱藏視窗的**——它只控制任務是否顯示在「工作排程器」清單中。常被誤解。

### 實測：未提權 PowerShell 註冊結果（2026-08-10）

```
[OK]   LogonType=Interactive  免提權免密碼可註冊   ← 但會閃視窗
[FAIL] LogonType=S4U          Access is denied.   ← 註冊與刪除皆需管理員身分
```

### `Password` 是否需提權：**走 GUI 設定即無須在意**

`Password` 本來就必須輸入密碼，**無法純腳本化免互動註冊**——既然一定要人在場，就直接用「工作排程器」GUI 建立最自然：

- GUI 若需要權限，**作業系統會自行彈出 UAC 提示**，使用者按下去即可，不必事先知道要不要提權
- 不需要先開「以系統管理員身分執行」的終端機，也不必為此寫註冊腳本

故本文不對「`Password` 是否需提權」下斷言（未實測），因為**在實務路徑上它不構成決策負擔**。

> **對比：`S4U` 的「需提權」才是會實際踩到的限制。**
> S4U 免密碼，正適合寫成可版控、可重現的註冊腳本；但腳本在一般終端機跑會直接 `Access is denied`（上方實測）。
> 也就是說：**要腳本化就選 S4U，並記得那個腳本必須在管理員終端機執行**；要圖方便就用 GUI 配 `Password`。

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

密碼過期後的失敗**不會出現在程式的日誌裡**——因為程式根本沒被啟動。表徵：

- 專案日誌**完全沒有新檔案**（不是內容有錯，是整個沒產生）
- `LastTaskResult` 為登入失敗類錯誤碼（如 **`0x8007052E`**：Logon failure: unknown user name or bad password）
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

**成本比較**：`S4U` 的代價是註冊與刪除各需一次管理員權限——**一次性**；`Password` 的代價是**每次密碼變更後都要回頭重設**，忘記就靜默停擺。在密碼會變的環境，維運負擔差距只會隨時間拉大。

### S4U 的限制

S4U 權杖**不具網路認證憑據**（官方明載 no access to network or encrypted files），無法以該使用者身分存取 SMB 網路磁碟，或對遠端服務做 Windows 整合驗證。

- 純本機執行 ＋ 對外 HTTP（RSS／Telegram／AI CLI 等）**不受影響**——已實測。
- 若須經「需要整合驗證的 Proxy」上網，或任務要讀寫網路磁碟，**須另行驗證**。

---

## 5. 建立配方

### 配方 A：XML 一次到位（推薦）

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
    <Arguments>c:\tai-news\trigger-news-ai.mjs</Arguments>
    <WorkingDirectory>c:\tai-news</WorkingDirectory>
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

註冊：

```powershell
Register-ScheduledTask -TaskName 'trigger-news-ai' -Xml (Get-Content 'task.xml' -Raw) -User 'DOMAIN\user' -Password '…'
```

**優點**：所有設定一次到位、可版控、可重現。`schtasks /create` 的參數涵蓋不到全部設定項（例如 `MultipleInstancesPolicy`）。

### 配方 B：schtasks 起底 + Set-ScheduledTask 補設定

```powershell
# 1) 用 schtasks 建時間基底工作（每小時一次）
#    不帶 /ru /it = InteractiveToken；要登出也跑改 /ru <user> /rp <password>
schtasks /create /tn "my-task" /tr "\"C:\Program Files\nodejs\node.exe\" c:\proj\app.mjs" /sc hourly

# 2) 補上 schtasks 涵蓋不到的設定
Set-ScheduledTask -TaskName "my-task" -Settings (New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -MultipleInstances StopExisting)
```

### 各設定項的理由

**`<Exec>` 直接指向執行檔，不經 cmd／.bat 包裝**

- **不要**寫成 `cmd /c node ...` 或包一層 `.bat`——那才會真的需要一個主控台。
- 路徑用**絕對路徑**：session 0 的 `PATH` 與登入桌面不同，靠指令名（`node`、`npx`）可能解析不到而 `ENOENT`。
- 同理，程式內部若要調用其他 CLI，也應使用絕對路徑。

**用 `TimeTrigger` + `Repetition`，不要用 `LogonTrigger`**

`LogonTrigger` 只在登入時觸發，登出或未登入就完全不跑——與「不論是否登入都執行」矛盾。`TimeTrigger` 搭配 `<Repetition><Interval>PT1H</Interval></Repetition>` 才是穩定的週期執行。

**電池相關設定：桌機無意義，筆電要留意**

`DisallowStartIfOnBatteries` / `StopIfGoingOnBatteries` **預設為 `true`**，代表用電池時不會執行、切到電池時會中止。

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

**本機實測（2026-08-10，PowerShell 5.1）之 `-LogonType` 合法列舉值**：

```
None, Password, S4U, Interactive, Group, ServiceAccount, InteractiveOrPassword
```

**做法**：不確定時直接查該機器實際支援的值，不要猜：

```powershell
(Get-Command New-ScheduledTaskSettingsSet).Parameters.Keys     # 查參數名
New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType X  # 故意給錯值，錯誤訊息會列出所有合法列舉
```

### 6.3 註冊前先把物件建立步驟預跑一遍

`New-ScheduledTaskAction`／`Principal`／`SettingsSet` 三者**都不需要提權**即可建立物件，只有 `Register-ScheduledTask` 需要。故可先在一般 shell 把前三步跑過確認無參數錯誤，再把需提權的那一步交出去執行——避免在提權視窗中反覆試錯。

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

**要確認的重點**：

1. `<LogonType>` 是否為 `Password` 或 `S4U`（決定有無視窗）
2. `<Command>` 是否為絕對路徑的執行檔
3. `<Triggers>` 是否為 `TimeTrigger`（非 `LogonTrigger`）
4. `NextRunTime` 是否為預期的下一個時間點（**空值＝沒排上＝壞**）

### 判讀陷阱：`LastTaskResult=0` 不等於任務成功

程式若**自行捕捉錯誤並優雅結束**，作業系統看到的仍是正常退出，`LastTaskResult` 仍為 0。

> 實例：曾發生「整批新聞遺失、只發出失敗通知」，但 `LastTaskResult` 為 0。光看排程狀態完全發現不了。

**故驗證是否真的成功，必須讀程式自己的日誌**，不能只看排程回報值。

---

## 8. 日常管理（免提權）

```powershell
Start-ScheduledTask   -TaskName 'trigger-news-ai'   # 立即執行一次
Disable-ScheduledTask -TaskName 'trigger-news-ai'   # 暫停
Enable-ScheduledTask  -TaskName 'trigger-news-ai'   # 恢復
```

修改設定（`Register-ScheduledTask -Force`、`schtasks /create /f`）須注意：**這類操作會刪除並重建任務，可能中斷正在執行的實例**。若當下有實例在跑，宜等其結束再改，或改用 `Set-ScheduledTask` 只調整特定屬性。

---

## 9. 摘要

### 不彈視窗只需做對兩件事

1. **`LogonType` 設為 `Password` 或 `S4U`**（＝「不論使用者是否登入均執行」）
2. **`<Exec>` 直接指向執行檔**，不要包 cmd／.bat

其餘隱藏技巧（VBScript `WScript.Shell.Run` 帶 `0`、`start /min`、`-WindowStyle Hidden`）都是**用錯 `LogonType` 的前提下**才需要的補救措施。把第 1 點做對，這些全都不需要。

### Password 或 S4U：看密碼會不會變

**只要執行帳號的密碼有可能被變更，就必須用 `S4U`。**

`Password` 把密碼交給排程器保管，密碼一變那份就過期，**任務直接無法啟動**，而且是**靜默失敗**——程式沒被啟動，專案日誌完全不會有新檔案，也不會有任何告警。

S4U 的代價（註冊／刪除各需一次管理員權限）是一次性的；`Password` 的代價（每次改密碼都要重設，忘了就靜默停擺）是持續性的。

### 排程「莫然不跑」的排查順序

1. `NextRunTime` 是否為空（沒排上）
2. `LastTaskResult` 是否為 `0x8007052E`（密碼過期）
3. 是否為筆電且 `DisallowStartIfOnBatteries=true`
4. 是否誤用 `LogonTrigger`（未登入就不跑）
5. `<Command>` 是否用了指令名而非絕對路徑（session 0 的 PATH 不同）
