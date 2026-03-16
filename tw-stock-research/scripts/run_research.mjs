import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * tw-stock-research 主控腳本
 * 依序執行所有資料抓取技能並產出盤前調研報告
 *
 * 用法：node tw-stock-research/scripts/run_research.mjs [YYYYMMDD]
 * 必須從專案根目錄執行（node_modules 所在位置）
 */

const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BASE_DIR = process.cwd();
const RAW_DIR = path.join(BASE_DIR, 'w-data-news', 'tw-stock-research', TODAY, 'raw');
const ERROR_LOG = path.join(BASE_DIR, 'w-data-news', 'tw-stock-research', TODAY, 'error_log.jsonl');

function log(msg) {
    console.log(`[run_research] ${msg}`);
}

function appendErrorLog(source, phase, type, message, details = '') {
    try {
        fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
        const entry = {
            timestamp: new Date().toISOString(),
            date: TODAY,
            source,
            phase,
            error: { type, message, details },
            resolution: 'failed',
        };
        fs.appendFileSync(ERROR_LOG, JSON.stringify(entry) + '\n');
    } catch (_) { /* ignore log errors */ }
    console.error(`[ERROR] ${source}/${phase}: ${message}`);
}

function run(label, nodeArgs, timeoutMs = 120000) {
    log(`執行 ${label}...`);
    const result = spawnSync('node', nodeArgs, {
        cwd: BASE_DIR,
        timeout: timeoutMs,
        encoding: 'utf8',
    });
    if (result.error) {
        const msg = result.error.code === 'ETIMEDOUT'
            ? `執行逾時（>${timeoutMs / 1000}s）`
            : result.error.message;
        appendErrorLog(label, 'fetch', result.error.code === 'ETIMEDOUT' ? 'timeout' : 'unknown', msg, '');
        log(`${label} ⚠️ 失敗（繼續執行下一步）`);
        return false;
    }
    if (result.status !== 0) {
        appendErrorLog(label, 'fetch', 'unknown', `Exit code ${result.status}`, result.stderr || '');
        log(`${label} ⚠️ 失敗（繼續執行下一步）`);
        return false;
    }
    log(`${label} ✅`);
    return true;
}

// ── Step 1: 交易日檢查 ────────────────────────────────────────────────────────
fs.mkdirSync(RAW_DIR, { recursive: true });
const raw = (name) => path.join(RAW_DIR, name);

log(`檢查交易日：${TODAY}`);
const tradingCheck = spawnSync(
    'node',
    ['check-tw-trading-day/scripts/check_tw_trading_day.mjs', TODAY, raw('trading_day.json')],
    { cwd: BASE_DIR, encoding: 'utf8' }
);
if (tradingCheck.error) {
    log(`⚠️ 交易日檢查執行失敗（${tradingCheck.error.message}），繼續執行`);
} else {
    const tradingOutput = tradingCheck.stdout || '';
    if (tradingOutput.includes('TRADING_DAY=false')) {
        log(`今日（${TODAY}）為非交易日，跳過盤前調研。`);
        process.exit(1);
    }
    if (tradingOutput.includes('TRADING_DAY=error')) {
        log('⚠️ 交易日 API 無法存取，繼續執行（請確認網路）');
    } else {
        log('交易日確認 ✅');
    }
}

// ── Step 2: 建立輸出目錄 ──────────────────────────────────────────────────────
// （目錄已於 Step 1 前建立）

// ── Step 3: 依序抓取（各步驟失敗不中斷整體流程）────────────────────────────
// 新聞類腳本：只接受 outputPath，不接受日期參數
run('fetch-mops',         ['fetch-mops/scripts/fetch_mops.mjs',                 raw('mops.json')],               120000);
run('fetch-cnyes',        ['fetch-cnyes/scripts/fetch_cnyes.mjs',               raw('cnyes.json')],               60000);
run('fetch-statementdog', ['fetch-statementdog/scripts/fetch_statementdog.mjs', raw('statementdog.json')],        60000);
run('fetch-moneydj',      ['fetch-moneydj/scripts/fetch_moneydj.mjs',           raw('moneydj.json')],            300000); // 最多 5 分鐘

// 法人資料腳本：接受 [all|code] [YYYYMMDD] [outputPath]
run('fetch-twse-t86',
    ['fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs',    'all', TODAY, raw('institutional_twse.json')],
    60000);
run('fetch-tpex-3insti',
    ['fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs', 'all', TODAY, raw('institutional_tpex.json')],
    60000);

// ── Step 4: 產出報告 ──────────────────────────────────────────────────────────
log('產出報告...');
const reportResult = spawnSync(
    'node',
    ['tw-stock-research/scripts/generate_report.mjs', TODAY],
    { cwd: BASE_DIR, encoding: 'utf8', timeout: 30000 }
);
if (reportResult.status !== 0 || reportResult.error) {
    appendErrorLog('generate_report', 'report', 'unknown',
        reportResult.error ? reportResult.error.message : `Exit code ${reportResult.status}`,
        reportResult.stderr || '');
    console.error('報告產出失敗，請查看 error_log.jsonl');
    process.exit(2);
}

if (reportResult.stdout) process.stdout.write(reportResult.stdout);
log(`盤前調研完成 ✅`);
log(`報告位置：w-data-news/tw-stock-research/${TODAY}/report_${TODAY}.md`);
