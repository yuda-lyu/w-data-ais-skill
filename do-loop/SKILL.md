---
name: do-loop
description: 自主循環開發技能：以 Planner→Executor→Auditor 三角色驅動完整開發迴圈，支援斷點續接。當使用者要求「自主開發」「循環開發」「do-loop」「規劃-執行-審計」「幫我開發這個功能」時觸發。
---

# do-loop — 自主循環開發（規劃→執行→審計，支援斷點續接）

## 概述

以三個角色自主驅動完整開發迴圈：

1. **Planner（規劃者）** — 分析需求、設計架構、拆解任務
2. **Executor（執行者）** — 逐一實作任務、自我驗證
3. **Auditor（審計者）** — 審查品質、判定通過或修正

所有進度持久化在 `{outputDir}/state.json`，session 中斷後可從斷點精確續接。

> 📖 各角色詳細行為規範請見 [references/roles.md](references/roles.md)
> 📖 state.json 完整範例請見 [references/state-example.jsonc](references/state-example.jsonc)

## 資料夾參數

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `outputDir` | 儲存狀態與階段數據的資料夾路徑 | `.do-loop` |

使用者可在觸發時指定資料夾，例如：
```
請依照 do-loop 為「新增 XXX」進行開發，資料夾 ./my-project-loop
```

若未指定，一律使用專案根目錄下的 `.do-loop/`。

以下文件中所有 `{outputDir}` 代表此資料夾路徑（預設 `.do-loop`）。啟動時若資料夾不存在，自動建立。

## 何時使用此 Skill

- 使用者要求開發一個新功能或模組
- 需要結構化的 規劃→實作→審查 工作流程
- 長期任務需要跨 session 斷點續接
- 使用者說「do-loop」「自主開發」「循環開發」

## 迴圈流程

```
使用者需求
    │
    ▼
┌─ PHASE 1: PLAN ──────────────────────────────┐
│  讀取現有程式碼 → 產出 {outputDir}/plan.md            │
│  建立 {outputDir}/state.json（所有任務 pending）       │
│  若需求不明確 → 向使用者提問後再繼續            │
└───────────────────────────────────────────────┘
    │
    ▼
┌─ PHASE 2: EXECUTE ───────────────────────────┐
│  讀取 state.json → 找到下一個待執行任務         │
│  實作 → 自我驗證 → 標記完成 → 下一個           │
│  每完成一個任務立即更新 state.json              │
└───────────────────────────────────────────────┘
    │
    ▼
┌─ PHASE 3: AUDIT ─────────────────────────────┐
│  審查所有已完成任務 → 產出 {outputDir}/audit-report.md │
│  判定：全部通過 or 有問題需修正                 │
└───────────────────────────────────────────────┘
    │
    ├─ 全部通過 → ✅ 結案
    ├─ 有問題且修正次數 < 3 → PHASE 2: FIX ROUND → PHASE 3 重新審計
    ├─ 同一任務修正 ≥ 3 次 → ⛔ 該任務標記 failed
    └─ 迴圈 > 5 輪 → ⛔ 強制中止
```

## 啟動邏輯（每次 session 開始時必做）

```
讀取 {outputDir}/state.json
    │
    ├─ 不存在 → 全新開發，進入 PHASE 1: PLAN
    │
    └─ 存在 → 讀取 status 欄位
         │
         ├─ "completed" → 通知使用者「上次已完成」，問是否有新需求
         ├─ "halted"    → 通知使用者中止原因，問如何處理
         └─ "in_progress" → 斷點續接：
              │
              ├─ phase: "PLAN"    → 檢查 plan.md，不存在則重新規劃
              ├─ phase: "EXECUTE" → 從 currentTaskId 繼續執行
              ├─ phase: "AUDIT"   → 直接進入審計
              └─ phase: "FIX"     → 讀取 audit-report.md，繼續修正
```

**續接時先輸出進度摘要**：

```
═══ 斷點續接 ═══════════════════════════════════
功能：{feature}
進度：{done}/{total} 任務完成
當前：PHASE {phase}，Task {currentTaskId}
迴圈：第 {loopCount} 輪
═══════════════════════════════════════════════
```

---

## 狀態管理

### `{outputDir}/state.json` — 唯一的進度真相來源

**每次狀態變更時，立即更新此檔案。** 這是斷點續接的唯一依據。

```jsonc
{
  "feature": "功能名稱",
  "status": "in_progress",        // "in_progress" | "completed" | "halted"
  "phase": "EXECUTE",             // "PLAN" | "EXECUTE" | "AUDIT" | "FIX"
  "loopCount": 1,                 // Plan→Exec→Audit 完整迴圈次數
  "currentTaskId": 3,             // 當前正在處理的任務編號
  "tasks": [
    {
      "id": 1,
      "name": "任務名稱",
      "status": "done",           // "pending" | "in_progress" | "done" | "failed" | "skipped"
      "fixAttempts": 0,
      "auditResult": "pass",      // "pass" | "fail" | null
      "lastAuditIssue": null
    }
  ],
  "history": [
    { "time": "2026-04-01T10:00:00Z", "event": "PLAN completed, 4 tasks created" }
  ]
}
```

### 狀態更新時機

| 事件 | 更新欄位 |
|------|---------|
| 進入 PLAN | `phase: "PLAN"` |
| PLAN 完成 | `phase: "EXECUTE"`, 建立 `tasks` 陣列 |
| 開始某任務 | `currentTaskId`, 該任務 `status: "in_progress"` |
| 完成某任務 | 該任務 `status: "done"`, `currentTaskId` 指向下一個 |
| 進入 AUDIT | `phase: "AUDIT"`, `loopCount++` |
| 審計結果 | 各任務 `auditResult` + `lastAuditIssue` |
| 進入 FIX | `phase: "FIX"`, 該任務 `fixAttempts++` |
| 全部通過 | `status: "completed"` |
| 中止 | `status: "halted"`, `history` 記錄原因 |

---

## PHASE 1: PLAN

**角色**：Planner（規劃者）
**產出**：`{outputDir}/plan.md` + `{outputDir}/state.json`（初始化）

**步驟**：
1. 讀取專案結構與現有程式碼，理解上下文
2. 若需求有模糊處，**立即向使用者提問**，等回答後再繼續
3. 設計架構方案（模組結構、資料流、技術選型）
4. 將功能拆解為任務清單，每個任務包含驗收條件
5. 將計畫寫入 `{outputDir}/plan.md`
6. 初始化 `{outputDir}/state.json`：所有任務 `pending`，phase 設為 `EXECUTE`

**plan.md 格式**：

```markdown
# 開發計畫：{功能名稱}

## 需求摘要
{一段話}

## 架構設計
{模組、資料流、技術決策}

## 任務清單

### Task 1: {名稱}
- **目標**：
- **檔案**：
- **驗收條件**：
  - [ ] 條件 1
  - [ ] 條件 2
- **複雜度**：S/M/L
- **依賴**：無 / Task N

### Task 2: ...

## 風險與注意事項
{潛在風險}
```

**約束**：
- 不寫任何程式碼，只產出計畫
- 先讀取現有程式碼再規劃，確保與現有架構一致
- 每個任務必須足夠小，單次 session 可完成
- 驗收條件必須可客觀驗證

---

## PHASE 2: EXECUTE

**角色**：Executor（執行者）
**輸入**：`{outputDir}/state.json` + `{outputDir}/plan.md`

**步驟**：
1. 讀取 state.json，找到第一個 `pending` 或 `in_progress` 的任務
2. 更新 state.json：該任務 `status: "in_progress"`
3. 讀取 plan.md 中對應任務的規格
4. 按照規格實作程式碼
5. 自我驗證：逐條檢查驗收條件
6. 更新 state.json：該任務 `status: "done"`
7. 重複直到所有任務完成 → 進入 PHASE 3

**FIX ROUND（從審計返回時）**：
- 讀取 `{outputDir}/audit-report.md` 中的問題清單
- 僅修正 `auditResult: "fail"` 的任務
- 不動已通過的程式碼
- `fixAttempts++`
- 修正完成後直接進入 PHASE 3

**約束**：
- 嚴格遵循計畫中的架構設計
- 若發現計畫不可行，停下來報告，不自行修改計畫
- 不做計畫範圍外的事

---

## PHASE 3: AUDIT

**角色**：Auditor（審計者）
**產出**：`{outputDir}/audit-report.md`

**步驟**：
1. 讀取 state.json 中所有 `status: "done"` 的任務
2. 逐項檢查程式碼，對照 plan.md 中的驗收條件
3. 審查維度：正確性、完整性、一致性、程式碼品質、安全性
4. 產出 `{outputDir}/audit-report.md`
5. 更新 state.json 中各任務的 `auditResult` 和 `lastAuditIssue`

**audit-report.md 格式**：

```markdown
# 審計報告
> 迴圈次數：{N} | 時間：{timestamp}

## 總結
- 通過：X / N
- 需修正：Y / N
- 決定：✅ 全部通過 / 🔄 需修正 / ⛔ 需使用者介入

## 逐項結果

### Task 1: {名稱} — ✅ 通過
理由：{為什麼通過}

### Task 2: {名稱} — ❌ 需修正（第 M 次）
**問題**：
1. `檔案:行號` — 問題描述 — 建議修正
**驗收條件檢查**：
- [x] 條件 1
- [ ] 條件 2 — 未通過原因
```

**決策邏輯**：

```
IF 所有任務 pass → status: "completed" → 結案
IF 有任務 fail 且 fixAttempts < 3 → phase: "FIX" → 回到 EXECUTE
IF 有任務 fail 且 fixAttempts >= 3 → 該任務 status: "failed"
IF 所有剩餘任務都 failed → status: "halted"
IF loopCount > 5 → status: "halted"（強制中止）
```

**約束**：
- 不修改任何程式碼，只產出報告
- 問題必須具體：指出檔案、行號、期望 vs 實際
- 「通過」和「不通過」都要給出理由

---

## 中止條件彙總

| 條件 | 觸發時機 | 行為 | state.json |
|------|---------|------|-----------|
| ✅ 成功結案 | 所有任務通過審計 | 輸出完成報告 | `status: "completed"` |
| ❓ 需求不明 | PLAN 階段模糊需求 | 暫停提問，回答後繼續 | `phase: "PLAN"` 保持 |
| 🚧 技術阻塞 | EXECUTE 遇不可解問題 | 暫停等使用者決策 | `status: "halted"` |
| 🔁 修正上限 | 同一任務修正 >= 3 次 | 該任務 failed | `tasks[n].status: "failed"` |
| 🔁 迴圈上限 | 迴圈 > 5 輪 | 強制中止 | `status: "halted"` |
| 🛑 使用者中斷 | 使用者說「停止/取消」 | 立即中止，保留進度 | `status: "halted"` |

## 輸出規範

**每次角色切換時**，輸出一行狀態提示：

```
═══ PHASE 1: PLAN ═══════════════════════════
═══ PHASE 2: EXECUTE (Task 3/7) ═════════════
═══ PHASE 3: AUDIT (Round 2) ════════════════
═══ FIX ROUND (Task 2, Attempt 2/3) ═════════
═══ 斷點續接 (Task 3/7, EXECUTE) ════════════
═══ ✅ COMPLETE ══════════════════════════════
═══ ⛔ HALTED — 需使用者介入 ═════════════════
```

**結案時**，輸出最終摘要：

```
┌─────────────────────────────────────────┐
│           開發迴圈完成報告               │
├─────────────────────────────────────────┤
│ 功能：{名稱}                            │
│ 任務：{N} 個完成 / {M} 個總計           │
│ 迴圈：{K} 輪                            │
│ 修正：{F} 次                            │
│ 狀態：✅ 全部通過 / ⚠️ 部分需人工介入    │
│ 產出檔案：                              │
│   {outputDir}/plan.md                          │
│   {outputDir}/state.json                       │
│   {outputDir}/audit-report.md                  │
│   {列出新增/修改的程式碼檔案}            │
└─────────────────────────────────────────┘
```

## 產出檔案

| 檔案 | 用途 | 誰產出 |
|------|------|--------|
| `{outputDir}/state.json` | 機器讀：精確進度追蹤，斷點續接依據 | PLAN 建立，每步更新 |
| `{outputDir}/plan.md` | 人可讀：架構設計、任務規格、驗收條件 | Planner |
| `{outputDir}/audit-report.md` | 人可讀：審計結果、問題清單、修正建議 | Auditor |

## 使用方式

```bash
# 全新開發（狀態存入預設 .do-loop/）
請依照 do-loop 為「新增 XXX 功能」進行開發

# 指定資料夾
請依照 do-loop 為「新增 XXX 功能」進行開發，資料夾 ./my-project-loop

# 斷點續接（自動讀取 {outputDir}/state.json 恢復進度）
請依照 do-loop 繼續開發

# 指定資料夾續接
請依照 do-loop 繼續開發，資料夾 ./my-project-loop

# 僅查看進度
請讀取 .do-loop/state.json 報告目前開發進度

# 強制重新規劃（會清除現有 state.json）
請依照 do-loop 重新規劃「XXX 功能」
```
