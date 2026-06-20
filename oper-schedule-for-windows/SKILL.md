---
name: oper-schedule-for-windows
description: 在 Windows 上以「工作排程器（Task Scheduler）」建立定時／常駐任務的操作要點技能。涵蓋任務型態判別（一次性週期 job vs 常駐長命行程）、ExecutionTimeLimit／MultipleInstancesPolicy／LogonType 的設定取捨、schtasks 與 Register-ScheduledTask XML 兩種建立配方、PowerShell 5.1 編碼陷阱、為何一律用 TimeTrigger 而非 LogonTrigger、上線讀回驗證與日常管理（免提權）。當使用者要求「設定 Windows 工作排程」「排定時任務」「schtasks」「Task Scheduler」「讓腳本每隔 N 分鐘／小時自動跑」「開機／登出後仍要跑的定時任務」「常駐行程的心跳看門狗」時觸發。
---

# oper-schedule-for-windows — Windows 工作排程設定要點

## 概述

給 agent 於 Windows 內使用「工作排程器（Task Scheduler）」執行定時任務的操作手冊。核心流程：**先判斷任務型態 → 挑設定 → 用配方建立 → 讀回驗證**。挑錯設定會導致「卡死殺不掉」「常駐被中途砍」「登出就停」「連不到網路」「睡醒不續跑」等典型故障，本技能逐項給出正解。

## 何時使用此 Skill

- 使用者要求「設定 Windows 工作排程」「排定時任務」「用 schtasks / Task Scheduler」
- 要讓某腳本「每隔 N 分鐘／小時自動跑」「每日產報表」「定時抓資料」
- 要讓任務在「登出後／關機喚醒後／不登入時」仍能跑
- 要為常駐長命行程設「心跳／看門狗」自動拉起
- 排程建立後 `NextRunTime` 空白、睡醒不跑、卡死殺不掉等故障排查

---

## 1. 先分清任務型態（一切的決策起點）

| 型態 | 你的腳本行為 | 排程的角色 |
|---|---|---|
| **A. 一次性週期 job** | 跑完就退（如每小時抓資料、每日產報表） | 排程的「每 N 時間」**就是**真正的業務觸發 |
| **B. 常駐長命行程** | 自己跑著不退、內部有計時器決定節奏 | 排程的「每 N 分」只是**心跳／看門狗**：行程還活著就略過、死了才重新拉起 |

> 為何要先分：A 和 B 在 `ExecutionTimeLimit`、`MultipleInstancesPolicy` 的正解是**相反**的。挑錯會讓 A 的卡死無法被中止、或 B 被中途砍掉。

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
