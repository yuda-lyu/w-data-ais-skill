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

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
                if (!stdout || stdout.length < min) return false;
            }
        }
        return true;
    };
}

// ─── 進程樹清理（跨平台）─────────────────────────────────────────────────

const IS_WIN = process.platform === 'win32';

/**
 * 遞迴蒐集指定 PID 的所有子孫進程 PID
 */
function collectDescendants(parentPid, result) {
    try {
        if (IS_WIN) {
            const output = execSync(
                `wmic process where (ParentProcessId=${parentPid}) get ProcessId /format:csv`,
                { encoding: 'utf8', timeout: 5000, windowsHide: true }
            );
            const pids = output.split('\n')
                .map(line => line.trim().split(',').pop())
                .filter(p => p && /^\d+$/.test(p) && Number(p) !== parentPid);
            for (const childPid of pids) {
                result.push(Number(childPid));
                collectDescendants(Number(childPid), result);
            }
        } else {
            const output = execSync(
                `pgrep -P ${parentPid}`,
                { encoding: 'utf8', timeout: 5000 }
            );
            const pids = output.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s));
            for (const childPid of pids) {
                result.push(Number(childPid));
                collectDescendants(Number(childPid), result);
            }
        }
    } catch {
        // 查詢失敗（進程已退出等），忽略
    }
}

/**
 * 殺掉指定 PID 的整棵進程樹（由葉到根）
 */
function killProcessTree(pid) {
    if (!pid) return;
    const descendants = [];
    collectDescendants(pid, descendants);

    // 由葉到根殺，避免父進程重新派生子進程
    for (const childPid of descendants.reverse()) {
        try {
            if (IS_WIN) {
                execSync(`taskkill /F /PID ${childPid}`, { stdio: 'ignore', timeout: 5000, windowsHide: true });
            } else {
                process.kill(childPid, 'SIGKILL');
            }
        } catch { /* 已退出 */ }
    }
    try {
        if (IS_WIN) {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 5000, windowsHide: true });
        } else {
            process.kill(pid, 'SIGKILL');
        }
    } catch { /* 已退出 */ }
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
        const proc = spawn(command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });

        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;

        // ── stdout 收集 ──
        proc.stdout.on('data', (chunk) => {
            const str = chunk.toString('utf8');
            if (onStdout) onStdout(str);
            if (stdout.length < maxBuffer) stdout += str;
        });

        // ── stderr 收集 ──
        proc.stderr.on('data', (chunk) => {
            const str = chunk.toString('utf8');
            if (onStderr) onStderr(str);
            if (stderr.length < maxBuffer) stderr += str;
        });

        // ── stdin ──
        if (input !== undefined) {
            proc.stdin.write(input, 'utf8');
        }
        proc.stdin.end();

        // ── 超時計時器 ──
        const timer = setTimeout(() => {
            if (settled) return;
            timedOut = true;
            killProcessTree(proc.pid);
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
    const { maxRetries = 0, retryDelayMs = 5000, ...onceOptions } = options;

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
    const args = cliArgs.slice(1);

    // 環境變數
    const timeoutMs    = parseInt(process.env.CLI_TIMEOUT_MS || '120000', 10);
    const maxBuffer    = parseInt(process.env.CLI_MAX_BUFFER || String(10 * 1024 * 1024), 10);
    const cwd          = process.env.CLI_CWD || process.cwd();
    const validate     = process.env.CLI_VALIDATE || undefined;
    const maxRetries   = parseInt(process.env.CLI_MAX_RETRIES || '0', 10);
    const retryDelayMs = parseInt(process.env.CLI_RETRY_DELAY_MS || '5000', 10);
    const logFile      = process.env.CLI_LOG_FILE || undefined;

    // stdin 內容：CLI_INPUT_FILE 優先於 CLI_INPUT
    let input;
    if (process.env.CLI_INPUT_FILE) {
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
    } else if (process.env.CLI_INPUT) {
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
