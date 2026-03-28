# 調用 AI（Claude CLI）失敗時的對應措施

本文件記錄 `trigger-news-ai.mjs` 在排程執行中遇到的 Claude CLI 失敗問題、根因分析與對應措施。

---

## 一、問題背景

本專案使用 Windows Task Scheduler 每小時執行 AI 新聞管線，流程中有兩個步驟需要呼叫 Claude CLI（`claude -p`）：

| 步驟 | 用途 | 失敗影響 |
|------|------|----------|
| 步驟 6 | AI 選文（從新增新聞中挑選 AI 相關文章） | 無法精選，改用前 N 篇或通知失敗 |
| 步驟 8 | WebFetch + 摘要（瀏覽網頁產生繁體中文摘要） | 無摘要，保留標題版訊息 |

---

## 二、觀測到的失敗類型

### 1. Claude CLI 進程 hang 住（最常見）

**現象：** Claude CLI 進程啟動後無回應，既不輸出結果也不退出，log 停在某個步驟之後就沒有後續。

**常見卡住點：**
- 步驟 6 完成後、步驟 7/8 開始前（選完文章但還沒開始 WebFetch）
- 步驟 8 進行中（WebFetch 某篇網頁時 hang 住）

**統計數據（2026-03-27）：**
- 需要 WebFetch 的 7 次執行中，4 次 hang 住（約 57% 失敗率）
- addCount = 0（無需 WebFetch）的執行 100% 成功

**根因推測：**
- pipe 模式（`type prompt.txt | claude -p`）下 context window 壓力大（800+ 筆新聞）
- WebFetch 工具對外 HTTP 請求遇到慢回應或無回應時拖死整個進程
- Claude CLI 在 pipe 模式下的錯誤恢復能力較差

### 2. Claude CLI 回傳非預期格式

**現象：** Claude 正常回應但內容無法被程式解析。例如步驟 6 要求只回覆數字編號，Claude 卻回傳一段說明文字。

**案例（2026-03-28 14:00）：**
```
步驟6：Claude 失敗（無法解析選文結果），使用前 5 篇
步驟6：完成（已選取 5 篇：1,2,3,4,5）
```
導致發送了與 AI 無關的新聞（碳捕集、小米車漆、電影等）。

### 3. Claude CLI 進程異常退出

**現象：** 進程以非零 exit code 結束。

**案例（2026-03-28 17:00）：**
```
步驟8：摘要失敗（exit 4294967295: ），保留基礎版訊息
```
exit code `4294967295`（即 -1 的無符號表示）通常代表進程被外部強制終止或 crash。

### 4. 殭屍進程累積

**現象：** Claude CLI 進程 hang 住後，即使 Task Scheduler 終止了排程任務（VBS/Node），Claude 子進程仍存活成為孤兒進程。

**案例（2026-03-28 發現）：**
- 累積 17 個殭屍 Claude 進程，最早可追溯至 3/25
- 原因：`taskkill /T /F /PID <cmd.exe的PID>` 只殺了 cmd.exe 進程樹，但 Claude 派生的子進程脫離了該樹而存活

---

## 三、架構演進與對應措施

### 第一版：單一 Claude CLI 執行所有步驟（已淘汰）

```
Task Scheduler → VBS → type prompt.txt | claude -p
```

**問題：** Claude 一死，整個流程斷掉，用戶收不到任何通知。

### 第二版：加入 fallback 訊息機制（已淘汰）

在 prompt 中加入「先組 fallback → 再 WebFetch」的指示。

**問題：** fallback 依賴 Claude 自身的流程控制，進程 crash 時 fallback 也一起失效。

### 第三版（現行）：Node.js 調度腳本 + Claude CLI 僅做 AI 判斷

```
Task Scheduler → VBS → node trigger-news-ai.mjs
                          ├─ 步驟 1-5：Node.js 直接執行（100% 穩定）
                          ├─ 步驟 6：claude -p「選文」（timeout 2 分鐘）
                          │         └─ 失敗 → 通知「選文失敗」
                          ├─ 步驟 7：Telegram Bot API 直接發送基礎版（100% 穩定）
                          ├─ 步驟 8：claude -p「WebFetch 摘要」（timeout 5 分鐘）
                          │         └─ 成功 → editMessage 更新為摘要版
                          │         └─ 失敗 → 保留基礎版（用戶已收到通知）
                          └─ catch-all：任何異常 → Telegram 通知錯誤原因
```

---

## 四、現行對應措施明細

### 措施 1：分離調度層與 AI 層

| 項目 | 說明 |
|------|------|
| 調度層 | Node.js（`trigger-news-ai.mjs`）負責流程控制、檔案 I/O、Telegram 發送 |
| AI 層 | Claude CLI 只負責兩個 AI 判斷任務，每次獨立呼叫，prompt 小而專注 |
| 效果 | 即使 Claude 全部失敗，調度層仍能完成通知 |

### 措施 2：每次 Claude 呼叫獨立超時控制

| 步驟 | Timeout | 失敗處理 |
|------|---------|----------|
| 步驟 6（選文） | 2 分鐘 | 通知「選文失敗」，不發送垃圾內容 |
| 步驟 8（摘要） | 5 分鐘 | 保留步驟 7 已發送的基礎版訊息 |

### 措施 3：先發送、再補強

步驟 7 在嘗試 WebFetch 之前，**先用 Telegram Bot API 直接發送基礎版訊息**（標題 + 連結）。步驟 8 的 WebFetch 摘要成功後，才用 `editMessage` 更新為摘要版。

這確保用戶**一定會收到通知**，無論後續 WebFetch 成功與否。

### 措施 4：Telegram 發送不經 Claude

直接呼叫 Telegram Bot API（`https://api.telegram.org/bot<token>/sendMessage`），不依賴 Claude 的 MCP 工具。消除了「Claude crash 導致 Telegram 也發不出去」的風險。

### 措施 5：進程樹清理（防止殭屍進程）

使用 `wmic` 的 `ParentProcessId` 遞迴追蹤，只清理自己派生的進程樹：

```
orchestrator → cmd.exe (proc.pid)
                 └─ claude.exe
                      └─ 子進程...

collectDescendants(proc.pid)
→ 透過 ParentProcessId 遞迴找出所有子孫 PID
→ 逐一 taskkill /F /PID 清除
→ 不影響其他排程任務或使用者的互動 session
```

**為什麼不用 PID 快照比對？**
若同時有其他排程任務（如台股調研）在整點觸發新的 Claude 進程，PID 比對會將其誤判為「新增的殭屍」而殺掉。Parent PID 追蹤只看自己的進程樹，不受其他任務影響。

### 措施 6：Windows Task Scheduler 安全網

| 設定 | 值 | 作用 |
|------|------|------|
| `MultipleInstancesPolicy` | `StopExisting` | 新排程觸發時，強制停止上一次仍在跑的實例 |
| `ExecutionTimeLimit` | `PT20M` | 單次執行最長 20 分鐘，超過自動終止 |

### 措施 7：選文 prompt 的防護

- 明確列出 AI 相關新聞的判斷規則，排除一般科技/娛樂新聞
- 無 AI 相關新聞時回覆 `0`，避免強制湊數
- Claude 失敗時通知用戶「選文失敗」，不盲選前 N 篇發送無關內容
- log 記錄 Claude 原始回應（前 100 字），方便除錯

---

## 五、已知限制

| 限制 | 說明 |
|------|------|
| WebFetch 摘要成功率不穩定 | Claude CLI 在 pipe 模式下呼叫 WebFetch 仍有約 30-50% 的 crash 率，目前以「有摘要更好、沒有也能接受」的策略應對 |
| 殭屍進程仍可能發生 | 若 Claude 子進程脫離進程樹（使用 `CREATE_NEW_PROCESS_GROUP` 等 Windows API），`ParentProcessId` 追蹤會失效，但此情況較罕見 |
| 選文依賴 Claude 可用性 | 若 Claude API 整體異常，步驟 6 也會失敗，此時只能通知失敗等待下次重試 |

---

## 六、相關檔案

| 檔案 | 用途 |
|------|------|
| `trigger-news-ai.mjs` | Node.js 調度腳本（現行主程式） |
| `trigger-news-ai.vbs` | VBS 啟動器（Task Scheduler 呼叫入口） |
| `trigger-news-ai-prompt.txt` | 舊版 prompt（已不再被 VBS 使用，保留備查） |
| `log/{YYYYMMDD}/{YYYYMMDDHHmmss}.log` | 每次執行的日誌 |
