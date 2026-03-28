# 調用 CLI 通用 SOP — 穩定偵測所有結果的標準流程

本文定義透過 Node.js `child_process` 調用**任何外部 CLI**（Claude CLI、curl、node 子腳本、Playwright 等）時，確保**不論成功或失敗都能穩定偵測、攔截、回報**的標準作業流程。

> **核心原則：** 把外部 CLI 視為「不可信的外部服務」——它可能成功、可能失敗、可能 hang 住、可能回傳垃圾、可能產生殭屍進程。調度層必須對所有情況都有明確處理路徑。

---

## 一、CLI 呼叫的 6 種結局

任何一次 CLI 呼叫，最終只會落入以下 6 種結局之一。SOP 的目標是**每一種都有對應的偵測與處理**：

| # | 結局 | 偵測方式 | 處理策略 |
|---|------|----------|----------|
| 1 | **正常成功** | `exit code === 0` + stdout 可解析 | 使用結果 |
| 2 | **正常失敗** | `exit code !== 0` | 讀取 stderr，記錄錯誤，走 fallback |
| 3 | **超時無回應** | timeout 觸發 | 強殺進程樹，記錄超時，走 fallback |
| 4 | **回傳非預期格式** | 解析/驗證失敗 | 記錄原始輸出（截斷），走 fallback |
| 5 | **進程異常 crash** | `result.error` 存在（ENOENT、SIGKILL 等） | 記錄錯誤碼，走 fallback |
| 6 | **殭屍進程殘留** | 進程樹追蹤 | 主動清理，防止資源耗盡 |

---

## 二、同步呼叫 vs 非同步呼叫的選擇

| 方式 | API | 適用場景 | 殭屍風險 | 超時控制 |
|------|-----|----------|----------|----------|
| **同步** | `spawnSync` | 簡單腳本、執行時間可預測 | 低（阻塞等待） | 內建 `timeout` 參數 |
| **非同步** | `spawn` | 需串流輸出、需並行、長程任務 | **高**（需手動管理） | 需手動實作 `setTimeout` + kill |

**選擇原則：** 能用同步就用同步，減少殭屍進程管理複雜度。只有在需要串流輸出、並行執行、或超長任務（>5 分鐘）時才用非同步。

---

## 三、標準實作：同步版（spawnSync）

適用於大多數場景：呼叫 node 子腳本、curl、短時間 CLI 任務。

```javascript
import { spawnSync } from 'node:child_process';

/**
 * 通用 CLI 同步呼叫
 * @param {string}   label      - 用於 log 的任務標籤
 * @param {string}   command    - 執行檔名稱（node, claude, curl...）
 * @param {string[]} args       - 參數陣列
 * @param {object}   options    - 選項
 * @param {number}   options.timeoutMs    - 超時毫秒數（預設 120000）
 * @param {string}   options.cwd          - 工作目錄
 * @param {string}   options.input        - 傳入 stdin 的內容（取代 pipe）
 * @param {function} options.validate     - 自訂驗證函數，接收 stdout，回傳 boolean
 * @param {number}   options.maxOutputLen - stdout/stderr 最大保留長度（預設 10MB）
 * @returns {{ ok: boolean, stdout: string, stderr: string, code: number|null, error: string }}
 */
function runSync(label, command, args = [], options = {}) {
    const {
        timeoutMs = 120_000,
        cwd = process.cwd(),
        input = undefined,
        validate = undefined,
        maxOutputLen = 10 * 1024 * 1024,
    } = options;

    console.log(`[${label}] 開始執行（timeout: ${timeoutMs / 1000}s）`);

    // ── 執行 ──
    const result = spawnSync(command, args, {
        cwd,
        input,                    // 用 input 取代 shell pipe，避免 stdin 相關問題
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: maxOutputLen,  // 防止 stdout/stderr 撐爆記憶體
        windowsHide: true,        // Windows: 不彈出 console 視窗
    });

    // ── 結局 5：進程異常 crash（ENOENT、SIGKILL、ETIMEDOUT 等）──
    if (result.error) {
        // 結局 3：超時無回應（spawnSync 超時會設 error.code = 'ETIMEDOUT'）
        if (result.error.code === 'ETIMEDOUT') {
            console.error(`[${label}] 超時（>${timeoutMs / 1000}s），進程已被終止`);
            return {
                ok: false,
                stdout: truncate(result.stdout, 500),
                stderr: truncate(result.stderr, 500),
                code: null,
                error: `TIMEOUT after ${timeoutMs / 1000}s`,
            };
        }
        // 其他異常：ENOENT（找不到執行檔）、SIGKILL、ENOMEM 等
        console.error(`[${label}] 進程異常: ${result.error.message}`);
        return {
            ok: false,
            stdout: '',
            stderr: truncate(result.stderr, 500),
            code: null,
            error: result.error.message,
        };
    }

    // ── 結局 2：正常失敗（非零 exit code）──
    if (result.status !== 0) {
        console.error(`[${label}] 失敗（exit code: ${result.status}）`);
        return {
            ok: false,
            stdout: truncate(result.stdout, 500),
            stderr: truncate(result.stderr, 1000),
            code: result.status,
            error: `Exit code ${result.status}`,
        };
    }

    // ── 結局 4：回傳非預期格式（自訂驗證失敗）──
    if (validate && !validate(result.stdout)) {
        console.error(`[${label}] 輸出格式驗證失敗`);
        return {
            ok: false,
            stdout: truncate(result.stdout, 500),
            stderr: '',
            code: 0,
            error: 'OUTPUT_VALIDATION_FAILED',
        };
    }

    // ── 結局 1：正常成功 ──
    console.log(`[${label}] 成功`);
    return {
        ok: true,
        stdout: result.stdout,
        stderr: result.stderr,
        code: 0,
        error: '',
    };
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + `...(truncated, total ${str.length} chars)` : str;
}
```

### 呼叫範例

```javascript
// 範例 1：呼叫 node 子腳本
const r1 = runSync('fetch-cnyes', 'node', ['fetch-cnyes/scripts/fetch.mjs', '20260328'], {
    timeoutMs: 60_000,
    cwd: '/path/to/skills',
});

// 範例 2：呼叫 Claude CLI（用 input 取代 pipe）
const r2 = runSync('ai-select', 'claude', ['-p', '--output-format', 'json', '--max-turns', '3'], {
    timeoutMs: 120_000,
    input: '請從以下新聞中選出 AI 相關的...',
    validate: (stdout) => {
        try { JSON.parse(stdout); return true; } catch { return false; }
    },
});

// 範例 3：呼叫 curl
const r3 = runSync('fetch-url', 'curl', ['-s', '-L', '--max-time', '15', url], {
    timeoutMs: 20_000,
    validate: (stdout) => stdout.length > 100,
});
```

---

## 四、標準實作：非同步版（spawn）

適用於：需要串流輸出、並行多任務、或執行時間 >5 分鐘的場景。

```javascript
import { spawn } from 'node:child_process';

/**
 * 通用 CLI 非同步呼叫（含超時 + 進程樹清理）
 * @returns {Promise<{ ok, stdout, stderr, code, error, pid }>}
 */
function runAsync(label, command, args = [], options = {}) {
    const {
        timeoutMs = 120_000,
        cwd = process.cwd(),
        input = undefined,
        validate = undefined,
        maxOutputLen = 10 * 1024 * 1024,
        onStdout = undefined,       // 串流回呼：(chunk: string) => void
    } = options;

    return new Promise((resolve) => {
        console.log(`[${label}] 開始執行（timeout: ${timeoutMs / 1000}s, async）`);

        const proc = spawn(command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';
        let settled = false;    // 防止 timeout 與 close 重複 resolve
        let timedOut = false;

        // ── stdout 收集（有上限保護）──
        proc.stdout.on('data', (chunk) => {
            const str = chunk.toString();
            if (onStdout) onStdout(str);
            if (stdout.length < maxOutputLen) {
                stdout += str;
            }
        });

        // ── stderr 收集 ──
        proc.stderr.on('data', (chunk) => {
            if (stderr.length < maxOutputLen) {
                stderr += chunk.toString();
            }
        });

        // ── 傳入 stdin ──
        if (input !== undefined) {
            proc.stdin.write(input);
            proc.stdin.end();
        } else {
            proc.stdin.end();    // 重要：關閉 stdin，避免子進程等待輸入而 hang
        }

        // ── 超時計時器 ──
        const timer = setTimeout(async () => {
            if (settled) return;
            timedOut = true;
            console.error(`[${label}] 超時（>${timeoutMs / 1000}s），開始清理進程樹...`);
            await killProcessTree(proc.pid, label);
        }, timeoutMs);

        // ── 進程 error 事件（ENOENT 等，進程根本沒啟動成功）──
        proc.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({
                ok: false, stdout: '', stderr: '',
                code: null, error: err.message, pid: proc.pid,
            });
        });

        // ── 進程結束 ──
        proc.on('close', (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            // 結局 3：超時
            if (timedOut) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 500),
                    code, error: `TIMEOUT after ${timeoutMs / 1000}s`, pid: proc.pid,
                });
            }

            // 結局 2 / 5：非零退出或被信號殺死
            if (code !== 0) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 1000),
                    code, error: signal ? `Signal: ${signal}` : `Exit code ${code}`, pid: proc.pid,
                });
            }

            // 結局 4：輸出格式驗證
            if (validate && !validate(stdout)) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: '',
                    code: 0, error: 'OUTPUT_VALIDATION_FAILED', pid: proc.pid,
                });
            }

            // 結局 1：成功
            console.log(`[${label}] 成功`);
            resolve({
                ok: true, stdout, stderr, code: 0, error: '', pid: proc.pid,
            });
        });
    });
}
```

---

## 五、進程樹清理（結局 6：殭屍防治）

**為什麼需要：** CLI 子進程可能再派生孫進程（如 Claude CLI 啟動 MCP Server、Puppeteer 啟動 Chrome）。殺掉子進程不代表孫進程會跟著死，必須追蹤整棵進程樹。

### Windows 版（wmic / taskkill）

```javascript
import { execSync } from 'node:child_process';

/**
 * 遞迴蒐集指定 PID 的所有子孫進程，然後由葉到根逐一殺掉
 */
async function killProcessTree(pid, label = '') {
    if (!pid) return;

    const descendants = [];
    collectDescendants(pid, descendants);

    // 由葉到根殺，避免父進程重新派生子進程
    for (const childPid of descendants.reverse()) {
        try {
            execSync(`taskkill /F /PID ${childPid}`, { stdio: 'ignore', timeout: 5000 });
            console.log(`[${label}] 已清理子進程 PID ${childPid}`);
        } catch {
            // 進程可能已自行退出，忽略
        }
    }

    // 最後殺根進程自己
    try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 5000 });
        console.log(`[${label}] 已清理根進程 PID ${pid}`);
    } catch {
        // 已退出
    }
}

function collectDescendants(parentPid, result) {
    try {
        const output = execSync(
            `wmic process where (ParentProcessId=${parentPid}) get ProcessId /format:csv`,
            { encoding: 'utf8', timeout: 5000 }
        );
        const pids = output.split('\n')
            .map(line => line.trim().split(',').pop())
            .filter(p => p && /^\d+$/.test(p) && Number(p) !== parentPid);
        for (const childPid of pids) {
            result.push(Number(childPid));
            collectDescendants(Number(childPid), result);   // 遞迴往下找
        }
    } catch {
        // wmic 查詢失敗，忽略
    }
}
```

### 跨平台替代（Node.js 原生）

```javascript
// Node.js >=20.5 支援 process.kill 搭配 detached group kill
// 啟動時設 detached: false（預設），確保子進程不脫離

// Unix/macOS: 殺掉進程群組
process.kill(-proc.pid, 'SIGKILL');

// Windows: 使用上方 wmic 方案，或 taskkill /T /F /PID
```

---

## 六、Claude CLI 專用注意事項

Claude CLI（`claude -p`）相比一般 CLI 有額外的不穩定因素：

### 6.1 必須設定的防護參數

```javascript
const claudeArgs = [
    '-p',                               // 非互動模式（必要）
    '--output-format', 'json',          // 結構化輸出，方便驗證（建議）
    '--max-turns', '10',                // 限制工具呼叫回合數，防止無限迴圈（重要）
    '--max-budget-usd', '2.00',         // 花費上限（選用）
    '--fallback-model', 'haiku',        // 主模型過載時自動降級（選用）
];
```

### 6.2 已知的高風險場景

| 風險 | 說明 | 防護 |
|------|------|------|
| **WebFetch hang** | `claude -p` 中呼叫 WebFetch 約 30-50% crash 率 | 調度層自行抓取網頁，不依賴 Claude 的 WebFetch |
| **context 爆炸** | 輸入 token 過多導致推理時間暴增或 OOM | 限制 input 大小（如截斷至 50KB） |
| **工具無限迴圈** | AI 反覆呼叫失敗的工具 | `--max-turns` 限制回合數 |
| **MCP Server 異常** | 外部 MCP 工具服務 crash | `--bare` 跳過 MCP 載入，或設 timeout |
| **pipe stdin 問題** | `type file | claude -p` 在 Windows 上不穩定 | 改用 `--input` 或 `spawnSync` 的 `input` 參數 |
| **權限確認卡住** | 忘記加自動核准旗標 | `--dangerously-skip-permissions` 或 `--allowedTools` |
| **輸出非預期格式** | AI 回傳說明文字而非結構化資料 | `--output-format json` + `--json-schema` + validate |

### 6.3 Claude CLI 完整呼叫範例

```javascript
function callClaude(label, prompt, options = {}) {
    const {
        timeoutMs = 120_000,
        maxTurns = 10,
        model = undefined,
        jsonSchema = undefined,
        allowedTools = undefined,
    } = options;

    const args = ['-p', '--output-format', 'json', '--max-turns', String(maxTurns)];

    if (model)        args.push('--model', model);
    if (jsonSchema)   args.push('--json-schema', JSON.stringify(jsonSchema));
    if (allowedTools) args.push('--allowedTools', allowedTools);
    else              args.push('--dangerously-skip-permissions');

    return runSync(label, 'claude', args, {
        timeoutMs,
        input: prompt,          // 用 stdin input 取代 shell pipe
        validate: (stdout) => {
            try {
                const parsed = JSON.parse(stdout);
                return parsed && parsed.result !== undefined;
            } catch {
                return false;
            }
        },
    });
}
```

---

## 七、Fallback 與重試策略

### 7.1 重試決策樹

```
CLI 呼叫失敗
    │
    ├─ TIMEOUT（結局 3）
    │     → 通常不重試（同樣會再 timeout）
    │     → 例外：可縮小輸入後重試 1 次
    │
    ├─ Exit code 非零（結局 2）
    │     ├─ exit code 1（一般錯誤）→ 可重試 1 次
    │     ├─ exit code 2（用法錯誤）→ 不重試（程式 bug）
    │     └─ exit code -1/4294967295（crash）→ 可重試 1 次
    │
    ├─ 格式驗證失敗（結局 4）
    │     → 可重試 1 次（調整 prompt 或加 --json-schema）
    │
    ├─ ENOENT（結局 5）
    │     → 不重試（執行檔不存在，環境問題）
    │
    └─ 其他異常（結局 5）
          → 可重試 1 次
```

### 7.2 重試實作（含 backoff）

```javascript
async function runWithRetry(label, command, args, options = {}, maxRetries = 1) {
    let lastResult;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            const delay = Math.min(5000 * attempt, 15000);
            console.log(`[${label}] 等待 ${delay / 1000}s 後重試（${attempt}/${maxRetries}）...`);
            await new Promise(r => setTimeout(r, delay));
        }

        lastResult = runSync(label, command, args, options);

        if (lastResult.ok) return lastResult;

        // 不可重試的錯誤類型
        if (lastResult.error.includes('ENOENT')) break;         // 執行檔不存在
        if (lastResult.code === 2) break;                        // 用法錯誤
        if (lastResult.error === 'TIMEOUT') break;               // timeout 通常重試無意義
    }

    return lastResult;
}
```

---

## 八、結構化錯誤日誌

每次 CLI 呼叫的結果（成功或失敗）都應記錄，格式統一以便事後分析：

```javascript
function logResult(label, result, logFilePath) {
    const entry = {
        timestamp: new Date().toISOString(),
        label,
        ok: result.ok,
        code: result.code,
        error: result.error || '',
        stdout_preview: truncate(result.stdout, 200),
        stderr_preview: truncate(result.stderr, 200),
    };
    fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n');
}
```

---

## 九、完整流程圖

```
調度層啟動一次 CLI 呼叫
    │
    ├─ 1. 建構參數（command, args, timeout, validate）
    │
    ├─ 2. 執行 spawnSync / spawn
    │     ├─ stdin: 用 input 參數，不用 shell pipe
    │     ├─ timeout: 明確設定，不留 Infinity
    │     ├─ maxBuffer: 設上限，防止 OOM
    │     └─ windowsHide: true
    │
    ├─ 3. 判定結局（6 種之一）
    │     ├─ result.error?
    │     │     ├─ ETIMEDOUT → 結局 3（超時）
    │     │     └─ 其他     → 結局 5（crash）
    │     ├─ result.status !== 0? → 結局 2（正常失敗）
    │     ├─ validate 失敗?      → 結局 4（格式錯誤）
    │     └─ 全部通過            → 結局 1（成功）
    │
    ├─ 4. 記錄結果（成功與失敗都記）
    │
    ├─ 5. 失敗時：判斷是否重試
    │     ├─ 可重試 → 回到步驟 2（最多 N 次）
    │     └─ 不可重試 → 走 fallback
    │
    ├─ 6. 進程樹清理（非同步版 / 超時殺進程後）
    │     └─ 遞迴蒐集子孫 PID → 由葉到根 taskkill
    │
    └─ 7. 回傳統一結果物件 { ok, stdout, stderr, code, error }
          └─ 調度層根據 ok 決定後續流程
```

---

## 十、Checklist：每次新增 CLI 呼叫時檢查

| # | 檢查項目 | 說明 |
|---|----------|------|
| 1 | **timeout 有設嗎？** | 絕對不留預設 Infinity。依任務性質設 30s ~ 5min |
| 2 | **maxBuffer 有設嗎？** | 預設 1MB 可能不夠，但也不能無限。建議 10MB |
| 3 | **stdin 怎麼傳？** | 用 `input` 參數，不用 shell pipe（`type x \| cmd`） |
| 4 | **stdout 有驗證嗎？** | 至少檢查非空、長度合理、可解析 |
| 5 | **6 種結局都有處理嗎？** | 對照第一節的表格逐一確認 |
| 6 | **失敗時走什麼 fallback？** | 明確定義降級方案，不能只 throw |
| 7 | **有 log 嗎？** | 成功失敗都記，含 timestamp + stdout 前 200 字 |
| 8 | **進程樹會清乾淨嗎？** | 尤其是 Claude CLI、Puppeteer 等會派生子進程的 |
| 9 | **並行時有互斥嗎？** | 多個排程同時跑同一個 CLI 時，是否需要 lockfile |
| 10 | **Windows 有特殊處理嗎？** | `windowsHide`、`taskkill` 路徑、ConHost 問題 |

---

## 十一、現行專案各模組對照

| 模組 | 目前方式 | 符合 SOP? | 建議改進 |
|------|----------|-----------|----------|
| `run_research.mjs` | `spawnSync` + timeout + ETIMEDOUT 偵測 | 大致符合 | 加 `maxBuffer`、加 `validate` |
| `run_post_market.mjs` | 同上 | 大致符合 | 同上 |
| `trigger-news-ai.mjs`（外部） | `spawnSync` + timeout + 進程樹清理 | 大致符合 | stdin 改用 `input` 取代 pipe |
| `fetch_mops.mjs` | Puppeteer + retry + finally cleanup | 符合 | 已是良好範例 |
| `dispatch-claude` skill | 文件描述，無實作 | N/A | 實作時依循本 SOP |
