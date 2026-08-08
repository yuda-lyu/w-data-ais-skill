#!/usr/bin/env node

/**
 * run_cli.mjs — CLI 包裝（僅調用層）
 *
 * 核心實作在同層之 runCli.mjs；本檔只負責：
 *   argv 解析 → 環境變數讀取 → 呼叫 runCli() → 結構化 log → JSON 輸出 → exit code
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
 * 程式化呼叫請直接匯入核心模組：
 *   import { runCli } from './runCli.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import w from 'wsemi';
import { runCli } from './runCli.mjs';

// 字串超長裁切（log 預覽與輸出截斷用）
// wsemi 1.8.70 起改由主入口之 strTruncate 提供（execCli 不再匯出 truncate）；
// 帶 funWithMsg 以保留「...(truncated, total N chars)」附註，與先前輸出格式一致
const truncate = (str, maxLen) => w.strTruncate(str, maxLen, {
    funWithMsg: (s) => `(truncated, total ${s.length} chars)`,
});

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
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

function _usage() {
    return [
        'Usage: node run_cli.mjs <exe> [args...]',
        '  Environment: CLI_TIMEOUT_MS, CLI_CWD, CLI_INPUT, CLI_INPUT_FILE,',
        '               CLI_VALIDATE, CLI_MAX_RETRIES, CLI_RETRY_DELAY_MS,',
        '               CLI_MAX_BUFFER, CLI_LOG_FILE',
    ].join('\n');
}

async function main() {
    // 解析命令列：node run_cli.mjs <exe> [args...]
    const cliArgs = process.argv.slice(2);
    const command = cliArgs[0];
    if (cliArgs.length === 0 || !w.isestr(command)) {
        console.error(_usage());
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

main().catch((e) => {
    console.error(`[dispatch-cli] Unhandled error: ${e.message}`);
    process.exit(1);
});
