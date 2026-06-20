---
name: oper-schedule-for-windows
description: 在 Windows 上以「工作排程器（Task Scheduler）」建立定時／常駐任務的操作要點技能。涵蓋任務型態判別（一次性週期 job vs 常駐長命行程）、ExecutionTimeLimit／MultipleInstancesPolicy／LogonType 的設定取捨、schtasks 與 Register-ScheduledTask XML 兩種建立配方、PowerShell 5.1 編碼陷阱、為何一律用 TimeTrigger 而非 LogonTrigger、上線讀回驗證與日常管理（免提權）。當使用者要求「設定 Windows 工作排程」「排定時任務」「schtasks」「Task Scheduler」「讓腳本每隔 N 分鐘／小時自動跑」「開機／登出後仍要跑的定時任務」「常駐行程的心跳看門狗」「讓排程任務不彈出 cmd 視窗／隱藏執行視窗」時觸發。
---

# oper-schedule-for-windows — Windows 工作排程設定要點

## 概述

給 agent 於 Windows 內使用「工作排程器（Task Scheduler）」執行定時任務的操作手冊。核心流程：**先判斷任務型態 → 挑設定 → 用配方建立 → 讀回驗證**。挑錯設定會導致「卡死殺不掉」「常駐被中途砍」「登出就停」「連不到網路」「睡醒不續跑」等典型故障，本技能逐項給出正解。

## 何時使用此 Skill

- 使用者要求「設定 Windows 工作排程」「排定時任務」「用 schtasks / Task Scheduler」
- 要讓某腳本「每隔 N 分鐘／小時自動跑」「每日產報表」「定時抓資料」
- 要讓任務在「登出後／關機喚醒後／不登入時」仍能跑
- 要為常駐長命行程設「心跳／看門狗」自動拉起
- 要讓排程任務執行時**不彈出 cmd 黑視窗**／在背景隱藏執行
- 排程建立後 `NextRunTime` 空白、睡醒不跑、卡死殺不掉等故障排查

---

## 1. 先分清任務型態（一切的決策起點）

| 型態 | 你的腳本行為 | 排程的角色 |
|---|---|---|
| **A. 一次性週期 job** | 跑完就退（如每小時抓資料、每日產報表） | 排程的「每 N 時間」**就是**真正的業務觸發 |
| **B. 常駐長命行程** | 自己跑著不退、內部有計時器決定節奏 | 排程的「每 N 分」只是**心跳／看門狗**：行程還活著就略過、死了才重新拉起 |

> 為何要先分：A 和 B 在 `ExecutionTimeLimit`、`MultipleInstancesPolicy` 的正解是**相反**的。挑錯會讓 A 的卡死無法被中止、或 B 被中途砍掉。

---

## 邊界：要用工作排程，還是直接背景行程（nohup &）？

「不跳 cmd 視窗」兩條路都做得到，但**持久性差很多**。先確認你要的是哪一種，別把臨時背景行程當成排程。

判準：**「重開機／登出後還要不要自己回來？」** 要 → 工作排程；不要（只需當前開機週期內跑著）→ nohup 背景行程即可。

| 能力 | `nohup node app.mjs &`（agent 於背景 shell 啟動） | Task Scheduler（session 0 身分） |
|---|---|---|
| 不跳 cmd 視窗 | ✅（繼承既有 shell 的 console，不另開 conhost） | ✅（session 0 無桌面，見第 3 節） |
| 開機自動啟動 | ❌ | ✅ |
| **重開機後存活** | ❌ 死了就沒了 | ✅ |
| crash 後自動重拉 | ❌（除非自寫看門狗） | ✅ `RestartOnFailure` |
| **登出後存活** | ❌ 不可靠（登出常連帶 session 拆除被殺） | ✅「不論登入與否」明確存活 |
| 語法可攜性 | `nohup`／`&` 是 Git Bash 語法，非原生 cmd/PowerShell | 原生 |

> **為何兩者都不跳視窗（共同機制）**：Windows 只有在替 console 程式分配**全新的 conhost**時才冒新視窗。從既有 shell 內啟動 node＝繼承父 shell 的 console、不另開 conhost；session 0 則根本無可顯示視窗的桌面。兩者都缺「新 conhost」這一步，故都無視窗。

> **殷鑑**：`scheduler.mjs` 這類「要一直在、定時做事」的常駐服務＝第 1 節**型態 B**；型態 B 的痛點正是「重開機／登出後沒人拉回來」。agent 用 `nohup` 起的行程**重開機就消失且無人重啟**——這種需求就該交給工作排程（每 N 分一個 TimeTrigger 當心跳看門狗）。

---

## 2. 關鍵設定怎麼挑（依型態）

| 設定 | A 一次性 job | B 常駐行程 | 說明 |
|---|---|---|---|
| `ExecutionTimeLimit` | **設有限上限**（如 `PT20M`～`PT1H`） | **`PT0S`（無上限）** | 預設是 3 天（72h）才強制中止。A 設有限上限＝卡死會被殺、不擋下一輪；B 不能被殺，故設無上限 |
| `MultipleInstancesPolicy` | `IgnoreNew` 或 `StopExisting` 皆可 | **`IgnoreNew`** | 預設值即 `IgnoreNew`（行程還在就不再開新的）。B 必用 IgnoreNew 避免每個心跳疊一個 |
| 觸發器 | `TimeTrigger` 每 N 時間 | `TimeTrigger` 每 N 分（心跳） | **一律用 TimeTrigger**，別用 LogonTrigger（理由見第 6 節） |
| `StartWhenAvailable` | 看需求：錯過要補跑才開 | 建議 `true` | 睡眠/關機錯過的排程，喚醒後補跑（有約 10 分鐘排隊延遲，非立即） |
| `RestartOnFailure` | 看需求 | 建議開（`Count` 3、`Interval` PT1M） | 啟動失敗時自動重試 |
| 電池 | 桌機無所謂；筆電要 24×7 就關掉電池限制 | 同左 | 預設「使用電池時不啟動／切到電池就停」。筆電要全天候須設成不受電池影響 |

---

## 3. 登入型態（LogonType）怎麼挑

**這決定兩件事：登出後還跑不跑、有沒有網路。** 挑錯會「登出就停」或「連不到網路」。

| LogonType | 登出後仍跑 | 網路 | 需存密碼 | 適用 |
|---|---|---|---|---|
| **InteractiveToken**（只在使用者登入時跑） | ✗ | ✅ 完整（含使用者 proxy / profile） | ✗ | 桌機常保持登入、且需對外連線 |
| **Password**（存密碼，不論登入與否） | ✅ | ✅ 完整 | ✅ | 需 24×7、且可接受儲存帳密 |
| **SYSTEM / ServiceAccount**（不論登入與否） | ✅ | ✅ 但**僅**公開 HTTPS+Bearer；**無** HKCU／使用者 proxy／對應磁碟機 | ✗ | 抓公開 API、不依賴使用者 proxy 的全天候任務 |
| **S4U**（不論登入與否、無密碼） | ✅ | **✗ 無網路**（也無加密檔存取） | ✗ | 純本機運算，完全不需網路 |

**決策捷徑**：
- 需要網路 + 要登出後也跑 → **Password** 或 **SYSTEM**（在「每使用者驗證 proxy」環境只能用 Password）。
- 需要網路但機器常保持登入 → **InteractiveToken** 最省事（不用存密碼）。
- **需要網路就絕不要用 S4U**。

### 不彈 cmd 黑視窗：唯一免維護的正解 = 讓工作跑在 session 0

**結論先講**：要「不跳視窗」，就把工作的執行身分設成**「不論使用者登入與否都執行」**——它會跑在背景 **session 0**，視窗根本無從出現。**不需任何包裝檔（.vbs/.bat/.exe launcher）、不需額外旗標**，多一個檔案就多一份維護的問題從源頭消失。

任務跑在哪個 session，決定有沒有視窗——這是 LogonType 的**直接副作用**：

| 執行身分 | 跑在哪個 session | 視窗 |
|---|---|---|
| **不論使用者登入與否**（Password / SYSTEM / S4U） | 背景 **session 0**（非互動、無桌面） | **永遠不彈**——含該任務及其 spawn 的所有子程序 |
| **僅在使用者登入時**（InteractiveToken） | 使用者的**互動桌面 session** | console 程式（cmd.exe / node.exe）會閃出黑視窗 |

> **機制**：session 0 是 Windows 給服務用的非互動 session（Session 0 Isolation），**沒有可顯示視窗的桌面**，視窗根本無從出現；子程序繼承同一 session，也一律無視窗。注意「不論登入與否」**即使你當下正登入著**也照樣跑在 session 0、不會跑到你的桌面——這正是它能無視窗的原因。

**依需求選哪一種 session-0 身分**（對應第 3 節的 LogonType）：

| 需求 | 選擇 | 怎麼設 |
|---|---|---|
| 要網路、可接受存密碼 | **Password** | `schtasks` 加 `/ru <user> /rp <password>`；或 XML `<LogonType>Password</LogonType>` |
| 要網路、不想存密碼（僅公開 HTTPS、無使用者 proxy） | **SYSTEM** | `schtasks` 加 `/ru SYSTEM`；或 XML `<UserId>SYSTEM</UserId><LogonType>ServiceAccount</LogonType>` |
| 純本機運算、不需網路、不存密碼 | **S4U** | XML `<LogonType>S4U</LogonType>`（GUI＝「不論登入與否」+「不要儲存密碼」） |

> 換言之，若你已為「登出也跑＋需網路」選了 Password／SYSTEM（第 3 節決策捷徑），**無視窗是免費附帶的**，不必再做任何事。

**常見誤解（別踩）**：
- `<Hidden>true</Hidden>` **不是**用來隱藏視窗的——它只把任務從「工作排程器資料庫」清單藏起來不顯示，與視窗無關。
- `cmd /c start /b …`、`-WindowStyle Hidden` 之類在**互動 session** 內壓視窗的土砲，console 程式自身仍會閃窗、不可靠，別用。

**真的被釘死在 InteractiveToken（非用互動 session 的使用者 proxy／桌面不可）又要無視窗？** Task Scheduler 在互動 session 內**沒有**內建關掉 console 視窗的開關；要全隱藏只能靠「以 `CREATE_NO_WINDOW` 啟動的外部包裝器」——那就回到多一個檔案維護的老路。**因此首選一律是改用 session 0（不論登入與否），而非在互動 session 硬壓視窗。**

---

## 4. 建立配方

> 建立根層級工作**需系統管理員（UAC）**。最可靠流程：請使用者開一次「系統管理員終端機」(Win+X →「終端機(系統管理員)」) 跑下面其一；建立後的日常操作（觸發、停用、查狀態）**免提權**。

### 配方 A：schtasks 起底 + Set-ScheduledTask 補設定

```powershell
# 1) 用 schtasks 建時間基底工作（每小時一次；改 /sc、/mo 調整節奏）
#    不帶 /ru /it = InteractiveToken；要登出也跑且需網路改 /ru <user> /rp <password> 或 /ru SYSTEM
schtasks /create /tn "MyTask" /tr "\"C:\Program Files\nodejs\node.exe\" C:\path\app.mjs" /sc hourly /mo 1 /f

# 2) 補上關鍵設定（此例為「一次性 job」：有限上限 PT20M）
$set = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Set-ScheduledTask -TaskName 'MyTask' -Settings $set
```
> 改成「常駐行程」：`/sc minute /mo 5`（心跳）、`ExecutionTimeLimit` 改 `([TimeSpan]::Zero)`（無上限）。

### 配方 B：純 XML 一次到位（繞開所有 cmdlet 物件地雷）

```powershell
# ASCII-only 腳本；系統管理員終端機跑一次
$xml = @'
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>2000-01-01T00:00:00</StartBoundary>
      <Repetition><Interval>PT1H</Interval></Repetition>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
    <Enabled>true</Enabled>
  </Settings>
  <Principals>
    <Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>
  </Principals>
  <Actions Context="Author">
    <Exec>
      <Command>C:\Program Files\nodejs\node.exe</Command>
      <Arguments>C:\path\app.mjs</Arguments>
      <WorkingDirectory>C:\path</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
'@
Register-ScheduledTask -TaskName 'MyTask' -Xml $xml -Force
```
> 關鍵可調行：`<Interval>` 節奏、`<ExecutionTimeLimit>`（常駐改 `PT0S`）、`<Command>/<Arguments>`、`<LogonType>`（登出也跑改 `<UserId>SYSTEM</UserId><LogonType>ServiceAccount</LogonType>`，或用 `Password`）。
> `-Xml` 收 PowerShell 字串（內部即 UTF-16LE），`encoding="UTF-16"` 宣告不會錯——這條路最穩。

---

## 5. PowerShell 腳本編碼陷阱（必避）

Windows 內建是 **PowerShell 5.1**，用**系統 codepage**（非英語地區常是非 UTF-8）讀 `.ps1`。

- **症狀**：`.ps1` 存成 UTF-8 無 BOM 又含非 ASCII（如中文註解）→ 開頭位元被誤判，污染下一行 `$變數 = ...` 的解析 → 變數變空 → 路徑/動作出錯。
- **對策**：
  1. `.ps1` 保持**純 ASCII**（註解寫英文），或存成 **UTF-8 with BOM**。
  2. 關鍵路徑**寫死絕對路徑**，不依賴可能被清空的變數。
- **驗純 ASCII**：`node -e "const b=require('fs').readFileSync('x.ps1');for(let i=0;i<b.length;i++)if(b[i]>127){console.log('non-ASCII@'+i);break}"`
- 補充：`schtasks /create /xml <檔案>` 要求**檔案位元組為 UTF-16LE**（`Set-Content -Encoding Unicode`），宣告與位元組不符會報 malformed XML；用配方 B 的字串路徑可完全避開。

---

## 6. 為何不用 LogonTrigger（一律改 TimeTrigger）

- 事件型觸發器（LogonTrigger/StartupTrigger）在「註冊當下使用者已登入、且排程服務不重啟」時**不會即時生效**，`NextRunTime` 顯示空（N/A）→ 在長開機不重登的機器上等於從不觸發。
- 睡眠→喚醒**不產生登入事件**，LogonTrigger 不會重新就緒 → 睡醒不續跑。
- **TimeTrigger（時間基底）** 沒有這些問題：`NextRunTime` 恆有值，搭配 `StartWhenAvailable` 睡醒會補跑。

---

## 7. 上線驗證（別信腳本印的「OK」，讀回實際註冊）

```powershell
# 1) 讀回真實 XML 核對：應為 TimeTrigger、Command 是絕對路徑、上限/並行政策正確
(Export-ScheduledTask -TaskName 'MyTask') | Select-String 'TimeTrigger|LogonTrigger|<Command>|Interval|MultipleInstancesPolicy|ExecutionTimeLimit'
# 2) 是否真的排了下一次（空 = 沒排上 = 壞）
(Get-ScheduledTaskInfo -TaskName 'MyTask').NextRunTime
# 3) 最近執行結果（0 = 成功）
(Get-ScheduledTaskInfo -TaskName 'MyTask').LastTaskResult
```
通過標準：**TimeTrigger + Command 絕對路徑 + NextRunTime 有值**。

---

## 8. 日常管理（免提權）

```powershell
schtasks /run /tn "MyTask"                              # 立即手動觸發一次
Disable-ScheduledTask -TaskName 'MyTask'                # 停用（常駐行程光 kill 會被心跳拉回，要用這個）
Enable-ScheduledTask  -TaskName 'MyTask'                # 重新啟用
Export-ScheduledTask  -TaskName 'MyTask' > backup.xml   # 刪除前先備份，日後 Register-ScheduledTask -Xml 還原
Unregister-ScheduledTask -TaskName 'MyTask' -Confirm:$false   # 刪除
```
> 改過任何設定/動作後，**務必再跑第 7 節驗證一次**，別假設「改了就生效」。
