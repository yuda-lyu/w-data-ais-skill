#!/usr/bin/env node

/**
 * dispatch-cli — 通用 CLI 子進程調用腳本
 *
 * 封裝 timeout、進程樹清理、輸出驗證、結構化錯誤回報、自動重試。
 * 所有參數原樣傳遞給目標 CLI，支援中文。
 *
 * 命令列用法：
 *   node run_cli.mjs <exe> [args...]
 *
 * 環境變數：
 *   CLI_TIMEOUT_MS     超時毫秒數（預設 120000）
 *   CLI_MAX_BUFFER     stdout/stderr 最大位元組（預設 10MB）
 *   CLI_CWD            子進程工作目錄（預設 process.cwd()）
 *   CLI_INPUT          傳入 stdin 的字串
 *   CLI_INPUT_FILE     從檔案讀取 stdin（優先於 CLI_INPUT）
 *   CLI_VALIDATE       驗證規則：nonempty, json, min:<n>（逗號分隔）
 *   CLI_MAX_RETRIES    最大重試次數（預設 0）
 *   CLI_RETRY_DELAY_MS 重試間隔毫秒數（預設 5000）
 *   CLI_LOG_FILE       JSONL log 檔案路徑
 *
 * 模組匯入：
 *   import { runCli } from './run_cli.mjs';
 */

import { spawn, execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import w from 'wsemi';
import _ from 'lodash-es';

// ── Windows .cmd/.bat 支援 ──
// npm 全域安裝的命令在 Windows 上是 .cmd 批次檔，Node.js spawn 無法直接執行
// （CVE-2024-27980 安全修正後會回 EINVAL）。
// 而 shell:true 會導致含特殊字元的參數被 cmd.exe 錯誤解析。
// 參考 cross-spawn 做法：手動透過 cmd.exe /d /s /c 執行，並正確轉義參數。
// 參考來源：https://github.com/moxystudio/node-cross-spawn

/**
 * 用 where 指令找到命令的實際路徑（.cmd / .exe）
 */
function _resolveCommand(cmd) {
    if (process.platform !== 'win32') return cmd;
    if (/\.(cmd|exe|bat|ps1)$/i.test(cmd)) return cmd;
    if (path.isAbsolute(cmd)) return cmd;
    try {
        const out = execFileSync('where', [cmd], { encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false }).trim();
        const lines = out.split(/\r?\n/);
        const cmdFile = lines.find(l => /\.cmd$/i.test(l));
        if (cmdFile) return cmdFile;
        const exeFile = lines.find(l => /\.exe$/i.test(l));
        if (exeFile) return exeFile;
        return lines[0] || cmd;
    } catch {
        return cmd;
    }
}

/**
 * 轉義 cmd.exe 的單一參數（cross-spawn escapeArgument 邏輯）
 * 參考：https://qntm.org/cmd
 */
function _escapeWinArg(arg) {
    // 1. 轉義反斜線 + 雙引號 組合
    arg = arg.replace(/(\\*)"/g, '$1$1\\"');
    // 2. 轉義尾端反斜線（避免吃掉結尾引號）
    arg = arg.replace(/(\\*)$/, '$1$1');
    // 3. 用雙引號包裹
    arg = `"${arg}"`;
    // 4. 轉義 cmd.exe 的 metacharacters（在引號外用 ^）
    arg = arg.replace(/[()%!^"<>&|]/g, '^$&');
    return arg;
}

/**
 * 轉義 cmd.exe 的命令部分
 */
function _escapeWinCmd(cmd) {
    return cmd.replace(/[()%!^"<>&|;, ]/g, '^$&');
}

/**
 * 從 .cmd shim 中解析出實際的 JS 入口檔案路徑。
 * npm 全域安裝的 .cmd 格式固定，末行為：
 *   ... "%_prog%"  "%dp0%\node_modules\...\entry" %*
 * 入口可能為 .js / .cjs / .mjs / 無副檔名（如 opencode 的 bin/opencode）；
 * 故一律抓引號內 node_modules 後的相對路徑、再以 existsSync 驗證實體檔存在
 * （只匹配 .js 會讓 opencode 等無副檔名入口落入 cmd.exe fallback、破壞多行 prompt）。
 */
function _parseJsEntryFromCmd(cmdPath) {
    try {
        const content = fs.readFileSync(cmdPath, 'utf8');
        // 匹配 "%dp0%\node_modules\...\entry"：捕捉到結尾引號前，含任何副檔名或無副檔名
        const m = content.match(/%dp0%\\(node_modules\\[^"]+)"/i);
        if (!m) return null;
        const dir = path.dirname(cmdPath);
        const jsPath = path.join(dir, m[1]);
        if (fs.existsSync(jsPath)) return jsPath;
        return null;
    } catch {
        return null;
    }
}

/**
 * 將 command + args 轉為 Windows 安全的 spawn 參數。
 * 策略優先順序：
 *   1. .exe → 直接 spawn
 *   2. .cmd → 解析 JS 入口，用 node 直接執行（繞過 cmd.exe，支援多行參數）
 *   3. .cmd 但無法解析 JS 入口 → 透過 cmd.exe /d /s /c 執行（fallback，不支援多行參數）
 */
function _buildSpawnArgs(command, args) {
    if (process.platform !== 'win32') return { file: command, args };
    const resolved = _resolveCommand(command);
    // .exe 可直接 spawn
    if (/\.exe$/i.test(resolved)) return { file: resolved, args };
    // .cmd/.bat → 嘗試解析出 JS 入口，直接用 node 執行
    if (/\.(cmd|bat)$/i.test(resolved)) {
        const jsEntry = _parseJsEntryFromCmd(resolved);
        if (jsEntry) {
            return { file: process.execPath, args: [jsEntry, ...args] };
        }
        // fallback: 透過 cmd.exe 執行（注意：不支援多行參數）
        const escaped = args.map(a => _escapeWinArg(a));
        const cmdLine = `${_escapeWinCmd(resolved)} ${escaped.join(' ')}`;
        const comspec = process.env.comspec || process.env.COMSPEC || 'cmd.exe';
        return {
            file: comspec,
            args: ['/d', '/s', '/c', `"${cmdLine}"`],
            options: { windowsVerbatimArguments: true },
        };
    }
    return { file: resolved, args };
}

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

// ─── 工具函式 ───────────────────────────────────────────────────────────────

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen
        ? str.slice(0, maxLen) + `...(truncated, total ${str.length} chars)`
        : str;
}

/**
 * 建立驗證函式
 * @param {string|function} rule - 'nonempty', 'json', 'min:100' 或自訂函式
 * @returns {function|null}
 */
function buildValidator(rule) {
    if (typeof rule === 'function') return rule;
    if (!rule || typeof rule !== 'string') return null;

    const checks = rule.split(',').map(r => r.trim()).filter(Boolean);
    if (checks.length === 0) return null;

    return (stdout) => {
        for (const check of checks) {
            if (check === 'nonempty') {
                if (!stdout || stdout.trim().length === 0) return false;
            } else if (check === 'json') {
                try { JSON.parse(stdout); } catch { return false; }
            } else if (check.startsWith('min:')) {
                const min = parseInt(check.slice(4), 10);
                if (Number.isNaN(min)) return false;   // 規則本身無效（如 min:abc）→ 視為驗證失敗，不靜默跳過
                if (!stdout || stdout.length < min) return false;
            }
        }
        return true;
    };
}

// ─── 進程樹清理（跨平台）─────────────────────────────────────────────────

const IS_WIN = process.platform === 'win32';

/**
 * 殺掉指定 PID 的整棵進程樹
 * Windows: 使用 taskkill /T（tree kill）一次殺掉整棵樹，不依賴 wmic（Windows 11 已移除）
 * Unix: 遞迴 pgrep 蒐集子孫後由葉到根殺
 */
function killProcessTree(pid) {
    if (!pid) return;
    try {
        if (IS_WIN) {
            // taskkill /T /F 會殺掉 PID 及其所有子進程（整棵樹）
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 5000, windowsHide: true });
        } else {
            // Unix: 先蒐集子孫再由葉到根殺
            const descendants = [];
            _collectDescendantsUnix(pid, descendants);
            for (const childPid of descendants.reverse()) {
                try { process.kill(childPid, 'SIGKILL'); } catch { /* 已退出 */ }
            }
            try { process.kill(pid, 'SIGKILL'); } catch { /* 已退出 */ }
        }
    } catch { /* 進程已退出 */ }
}

function _collectDescendantsUnix(parentPid, result) {
    try {
        const output = execSync(
            `pgrep -P ${parentPid}`,
            { encoding: 'utf8', timeout: 5000 }
        );
        const pids = output.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s));
        for (const childPid of pids) {
            result.push(Number(childPid));
            _collectDescendantsUnix(Number(childPid), result);
        }
    } catch { /* 查詢失敗或無子進程 */ }
}

// ─── 核心非同步引擎（內部使用）───────────────────────────────────────────────

/**
 * 單次非同步呼叫（內部使用，不含重試邏輯）
 */
function _runCliOnce(command, args = [], options = {}) {
    const {
        timeoutMs = 120_000,
        cwd = process.cwd(),
        input = undefined,
        validate = undefined,
        maxBuffer = 10 * 1024 * 1024,
        onStdout = undefined,
        onStderr = undefined,
    } = options;

    const validator = buildValidator(validate);
    const startTime = Date.now();

    return new Promise((resolve) => {
        const winSpawn = _buildSpawnArgs(command, args);
        const proc = spawn(winSpawn.file, winSpawn.args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            ...winSpawn.options,
        });

        let stdout = '';
        let stderr = '';
        // StringDecoder：跨 chunk 邊界正確解碼 UTF-8，避免多位元組中文字元被切成亂碼（U+FFFD）
        const stdoutDecoder = new StringDecoder('utf8');
        const stderrDecoder = new StringDecoder('utf8');
        let settled = false;
        let timedOut = false;

        // ── stdout 收集（經 StringDecoder 跨 chunk 解碼）──
        proc.stdout.on('data', (chunk) => {
            const str = stdoutDecoder.write(chunk);
            if (!str) return;
            if (onStdout) onStdout(str);
            if (stdout.length < maxBuffer) stdout += str;
        });

        // ── stderr 收集（經 StringDecoder 跨 chunk 解碼）──
        proc.stderr.on('data', (chunk) => {
            const str = stderrDecoder.write(chunk);
            if (!str) return;
            if (onStderr) onStderr(str);
            if (stderr.length < maxBuffer) stderr += str;
        });

        // ── stdin ──
        // 子進程提早關閉 stdin 時 write/end 會觸發 EPIPE，需 listen 'error' 才不會拋 unhandled event
        proc.stdin.on('error', () => {});
        if (input !== undefined) {
            proc.stdin.write(input, 'utf8');
        }
        proc.stdin.end();

        // ── 超時計時器 ──
        const timer = setTimeout(() => {
            if (settled) return;
            timedOut = true;
            killProcessTree(proc.pid);
            // 保險：kill 後若 close 事件遲未觸發（kill 被忽略/權限不足），3s 後強制 resolve 避免永久 hang。
            // unref 確保正常情況（close 立即觸發）不會因此延後 process 結束。
            setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 500),
                    code: null, error: `TIMEOUT after ${timeoutMs / 1000}s（子進程未能結束）`,
                    durationMs: Date.now() - startTime, pid: proc.pid,
                });
            }, 3000).unref();
        }, timeoutMs);

        // ── 進程 error（ENOENT 等）──
        proc.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({
                ok: false, stdout: '', stderr: '',
                code: null,
                error: `${err.code || 'UNKNOWN'}: ${err.message}`,
                durationMs: Date.now() - startTime,
                pid: proc.pid,
            });
        });

        // ── 進程結束 ──
        proc.on('close', (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // flush decoder 殘餘（valid UTF-8 結尾通常為空，保險起見仍 flush）
            const _fOut = stdoutDecoder.end(); if (_fOut && stdout.length < maxBuffer) stdout += _fOut;
            const _fErr = stderrDecoder.end(); if (_fErr && stderr.length < maxBuffer) stderr += _fErr;
            const durationMs = Date.now() - startTime;

            if (timedOut) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 500),
                    code, error: `TIMEOUT after ${timeoutMs / 1000}s`,
                    durationMs, pid: proc.pid,
                });
            }

            if (code !== 0) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 1000),
                    code,
                    error: signal ? `Signal: ${signal}` : `Exit code ${code}`,
                    durationMs, pid: proc.pid,
                });
            }

            if (validator && !validator(stdout)) {
                return resolve({
                    ok: false,
                    stdout: truncate(stdout, 500),
                    stderr: truncate(stderr, 500),
                    code: 0, error: 'OUTPUT_VALIDATION_FAILED',
                    durationMs, pid: proc.pid,
                });
            }

            resolve({
                ok: true, stdout, stderr,
                code: 0, error: '',
                durationMs, pid: proc.pid,
            });
        });
    });
}

// ─── 唯一對外介面 ─────────────────────────────────────────────────────────

/**
 * 通用 CLI 非同步呼叫（含內建重試、串流輸出、進程樹清理）
 *
 * @param {string}   command    - 執行檔名稱（claude, node, curl...）
 * @param {string[]} args       - 參數陣列（原樣傳遞，支援中文）
 * @param {object}   [options]
 * @param {number}   [options.timeoutMs=120000]    - 超時毫秒數
 * @param {string}   [options.cwd]                 - 工作目錄
 * @param {string}   [options.input]               - 傳入 stdin 的內容
 * @param {string|function} [options.validate]     - 驗證規則或自訂函式
 * @param {number}   [options.maxBuffer=10485760]  - stdout/stderr 最大位元組
 * @param {function} [options.onStdout]            - 串流回呼 (chunk: string) => void
 * @param {function} [options.onStderr]            - 串流回呼 (chunk: string) => void
 * @param {number}   [options.maxRetries=0]        - 最大重試次數
 * @param {number}   [options.retryDelayMs=5000]   - 重試間隔毫秒數
 * @returns {Promise<{ ok, stdout, stderr, code, error, durationMs, pid, attempts }>}
 */
export async function runCli(command, args = [], options = {}) {

    // command 必填字串：本函式以 error 物件回報失敗（非 throw 風格），故回傳統一 error 結構
    if (!w.isestr(command)) {
        return {
            ok: false, stdout: '', stderr: '',
            code: null, error: 'command 須為非空字串',
            durationMs: 0, attempts: 0,
        };
    }

    // args：若提供須為陣列，否則回退為空陣列
    if (!w.isarr(args)) args = [];

    if (!w.isobj(options)) options = {};

    let { maxRetries = 0, retryDelayMs = 5000, ...onceOptions } = options;

    // cwd：非空字串，無效回退預設 process.cwd()
    let cwd = _.get(onceOptions, 'cwd', null);
    if (!w.isestr(cwd)) onceOptions.cwd = process.cwd(); else onceOptions.cwd = cwd;

    // input：傳入 stdin 的字串，無效回退預設 undefined（未提供 = 不寫 stdin）
    let input = _.get(onceOptions, 'input', null);
    if (!w.isestr(input)) onceOptions.input = undefined; else onceOptions.input = input;

    // validate：驗證規則字串，無效回退預設 undefined（未提供 = 不驗證）
    // 注意：validate 亦可為自訂函式（buildValidator 支援），故先放行 function 不覆蓋
    let validate = _.get(onceOptions, 'validate', null);
    if (w.isfun(validate)) onceOptions.validate = validate;
    else if (!w.isestr(validate)) onceOptions.validate = undefined; else onceOptions.validate = validate;

    // onStdout / onStderr：串流回呼 function，無效回退預設 undefined（未提供 = 不回呼）
    let onStdout = _.get(onceOptions, 'onStdout', null);
    if (!w.isfun(onStdout)) onceOptions.onStdout = undefined; else onceOptions.onStdout = onStdout;
    let onStderr = _.get(onceOptions, 'onStderr', null);
    if (!w.isfun(onStderr)) onceOptions.onStderr = undefined; else onceOptions.onStderr = onStderr;

    // maxRetries：非負整數（可為 0），無效回退預設 0
    if (!w.isp0int(maxRetries)) maxRetries = 0; else maxRetries = w.cint(maxRetries);

    // retryDelayMs：正整數，無效回退預設 5000
    if (!w.ispint(retryDelayMs)) retryDelayMs = 5000; else retryDelayMs = w.cint(retryDelayMs);

    // timeoutMs：正整數，無效回退預設 120000
    let timeoutMs = _.get(onceOptions, 'timeoutMs', null);
    if (!w.ispint(timeoutMs)) onceOptions.timeoutMs = 120_000; else onceOptions.timeoutMs = w.cint(timeoutMs);

    // maxBuffer：正整數，無效回退預設 10MB
    let maxBuffer = _.get(onceOptions, 'maxBuffer', null);
    if (!w.ispint(maxBuffer)) onceOptions.maxBuffer = 10 * 1024 * 1024; else onceOptions.maxBuffer = w.cint(maxBuffer);

    let lastResult;
    let totalAttempts = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            const delay = Math.min(retryDelayMs * attempt, 15000);
            await new Promise(r => setTimeout(r, delay));
        }

        lastResult = await _runCliOnce(command, args, onceOptions);
        totalAttempts = attempt + 1;

        if (lastResult.ok) {
            lastResult.attempts = totalAttempts;
            return lastResult;
        }

        // 不可重試的錯誤
        if (lastResult.error.includes('ENOENT')) break;
        if (lastResult.code === 2) break;
    }

    lastResult.attempts = totalAttempts;
    return lastResult;
}

// ─── 結構化 Log ─────────────────────────────────────────────────────────────

function appendLog(logFile, command, args, result) {
    if (!logFile) return;
    try {
        const dir = path.dirname(logFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        _guardPath(logFile);
        const entry = {
            timestamp: new Date().toISOString(),
            command,
            args,
            ok: result.ok,
            code: result.code,
            error: result.error || '',
            durationMs: result.durationMs,
            stdout_preview: truncate(result.stdout, 200),
            stderr_preview: truncate(result.stderr, 200),
        };
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch { /* log 寫入失敗不影響主流程 */ }
}

// ─── CLI 入口 ───────────────────────────────────────────────────────────────

async function main() {
    // 解析命令列：node run_cli.mjs <exe> [args...]
    const cliArgs = process.argv.slice(2);
    if (cliArgs.length === 0) {
        console.error('Usage: node run_cli.mjs <exe> [args...]');
        console.error('  Environment: CLI_TIMEOUT_MS, CLI_CWD, CLI_INPUT, CLI_INPUT_FILE,');
        console.error('               CLI_VALIDATE, CLI_MAX_RETRIES, CLI_RETRY_DELAY_MS,');
        console.error('               CLI_MAX_BUFFER, CLI_LOG_FILE');
        process.exit(2);
    }

    const command = cliArgs[0];
    if (!w.isestr(command)) {
        console.error('Usage: node run_cli.mjs <exe> [args...]');
        console.error('  Environment: CLI_TIMEOUT_MS, CLI_CWD, CLI_INPUT, CLI_INPUT_FILE,');
        console.error('               CLI_VALIDATE, CLI_MAX_RETRIES, CLI_RETRY_DELAY_MS,');
        console.error('               CLI_MAX_BUFFER, CLI_LOG_FILE');
        process.exit(2);
    }
    const args = cliArgs.slice(1);

    // 環境變數
    // env 值皆為字串：數字類先 w.cint 取數再以型別閘驗證（未設或非正整數字串 → 用既有預設）
    const _timeoutN    = w.cint(process.env.CLI_TIMEOUT_MS);
    const timeoutMs    = w.ispint(_timeoutN) ? _timeoutN : 120000;
    const _maxBufferN  = w.cint(process.env.CLI_MAX_BUFFER);
    const maxBuffer    = w.ispint(_maxBufferN) ? _maxBufferN : 10 * 1024 * 1024;
    // maxRetries 允許 0（含 0 正整數）
    const _maxRetriesN = w.cint(process.env.CLI_MAX_RETRIES);
    const maxRetries   = w.isp0int(_maxRetriesN) ? _maxRetriesN : 0;
    const _retryDelayN = w.cint(process.env.CLI_RETRY_DELAY_MS);
    const retryDelayMs = w.ispint(_retryDelayN) ? _retryDelayN : 5000;
    // 字串類：非空字串才採用，否則用既有預設（保留「未設 → 預設」行為，不變必填）
    const cwd          = w.isestr(process.env.CLI_CWD) ? process.env.CLI_CWD : process.cwd();
    const validate     = w.isestr(process.env.CLI_VALIDATE) ? process.env.CLI_VALIDATE : undefined;
    const logFile      = w.isestr(process.env.CLI_LOG_FILE) ? process.env.CLI_LOG_FILE : undefined;

    // stdin 內容：CLI_INPUT_FILE 優先於 CLI_INPUT
    let input;
    if (w.isestr(process.env.CLI_INPUT_FILE)) {
        try {
            input = fs.readFileSync(process.env.CLI_INPUT_FILE, 'utf8');
        } catch (e) {
            const errResult = {
                ok: false, stdout: '', stderr: '',
                code: null, error: `CLI_INPUT_FILE read failed: ${e.message}`,
                durationMs: 0,
            };
            console.log(JSON.stringify(errResult));
            process.exit(1);
        }
    } else if (w.isestr(process.env.CLI_INPUT)) {
        input = process.env.CLI_INPUT;
    }

    const options = { timeoutMs, cwd, input, validate, maxBuffer, maxRetries, retryDelayMs };

    // 顯示執行資訊至 stderr（不影響 stdout 的 JSON 輸出）
    console.error(`[dispatch-cli] ${command} ${args.join(' ')}`);
    console.error(`[dispatch-cli] timeout=${timeoutMs}ms cwd=${cwd} validate=${validate || 'none'} retries=${maxRetries}`);

    // 執行
    const result = await runCli(command, args, options);

    // Log
    appendLog(logFile, command, args, result);

    // 輸出結果 JSON 至 stdout
    // 失敗時 stdout/stderr 已截斷，安全輸出
    const output = {
        ok: result.ok,
        stdout: result.ok ? result.stdout : truncate(result.stdout, 500),
        stderr: truncate(result.stderr, 500),
        code: result.code,
        error: result.error,
        durationMs: result.durationMs,
    };
    if (result.attempts !== undefined) output.attempts = result.attempts;

    console.log(JSON.stringify(output));
    process.exit(result.ok ? 0 : 1);
}

// 判斷是否為 CLI 直接執行（非 import）
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
    main().catch((e) => {
        console.error(`[dispatch-cli] Unhandled error: ${e.message}`);
        process.exit(1);
    });
}
