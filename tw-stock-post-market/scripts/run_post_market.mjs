import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * tw-stock-post-market 主控腳本
 * 依序執行盤後所需資料抓取並產出盤後總結報告
 *
 * 用法：node tw-stock-post-market/scripts/run_post_market.mjs [YYYYMMDD] [skillsDir] [outputDir] [preMarketDir]
 *
 * 參數：
 * 1. YYYYMMDD     (選填)：指定日期，預設為今日。
 * 2. skillsDir    (選填)：技能庫根目錄（node_modules 所在位置），預設為 cwd。
 * 3. outputDir    (選填)：盤後主輸出目錄（raw/ 與 error_log.jsonl 均置於此），
 *                         預設為 <skillsDir>/w-data-news/tw-stock-post-market/<YYYYMMDD>。
 * 4. preMarketDir (選填)：盤前調研輸出目錄（用於比對盤前研判），
 *                         預設為 <skillsDir>/w-data-news/tw-stock-research/<YYYYMMDD>。
 */

const TODAY        = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const SKILLS_DIR   = process.argv[3] || process.cwd();
const OUTPUT_DIR   = process.argv[4] || path.join(SKILLS_DIR, 'w-data-news', 'tw-stock-post-market', TODAY);
const PRE_MARKET_DIR = process.argv[5] || path.join(SKILLS_DIR, 'w-data-news', 'tw-stock-research', TODAY);
const RAW_DIR      = path.join(OUTPUT_DIR, 'raw');
const ERROR_LOG    = path.join(OUTPUT_DIR, 'error_log.jsonl');

function log(msg) {
    console.log(`[run_post_market] ${msg}`);
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

function run(label, scriptRelPath, extraArgs = [], timeoutMs = 120000) {
    log(`執行 ${label}...`);
    const result = spawnSync('node', [path.join(SKILLS_DIR, scriptRelPath), ...extraArgs], {
        cwd: SKILLS_DIR,
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
    [path.join(SKILLS_DIR, 'check-tw-trading-day/scripts/check_tw_trading_day.mjs'), TODAY, raw('trading_day.json')],
    { cwd: SKILLS_DIR, encoding: 'utf8' }
);
if (tradingCheck.error) {
    log(`⚠️ 交易日檢查執行失敗（${tradingCheck.error.message}），繼續執行`);
} else {
    const tradingOutput = tradingCheck.stdout || '';
    if (tradingOutput.includes('TRADING_DAY=false')) {
        log(`今日（${TODAY}）為非交易日，跳過盤後總結。`);
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

// ── Step 3: 抓取收盤價 ────────────────────────────────────────────────────────
run('fetch-twse',
    'fetch-twse/scripts/fetch_twse.mjs',
    ['all', TODAY, raw('prices_twse.json')], 60000);
run('fetch-tpex',
    'fetch-tpex/scripts/fetch_tpex.mjs',
    ['all', TODAY, raw('prices_tpex.json')], 60000);

// ── Step 4: 抓取三大法人買賣超 ────────────────────────────────────────────────
run('fetch-twse-t86',
    'fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs',
    ['all', TODAY, raw('institutional_twse.json')], 60000);
run('fetch-tpex-3insti',
    'fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs',
    ['all', TODAY, raw('institutional_tpex.json')], 60000);

// ── Step 5: 產出報告 ──────────────────────────────────────────────────────────
log('產出報告...');
const reportResult = spawnSync(
    'node',
    [path.join(SKILLS_DIR, 'tw-stock-post-market/scripts/generate_report.mjs'), TODAY, OUTPUT_DIR, PRE_MARKET_DIR],
    { cwd: SKILLS_DIR, encoding: 'utf8', timeout: 30000 }
);
if (reportResult.status !== 0 || reportResult.error) {
    appendErrorLog('generate_report', 'report', 'unknown',
        reportResult.error ? reportResult.error.message : `Exit code ${reportResult.status}`,
        reportResult.stderr || '');
    console.error('報告產出失敗，請查看 error_log.jsonl');
    process.exit(2);
}

if (reportResult.stdout) process.stdout.write(reportResult.stdout);
log(`盤後總結完成 ✅`);
log(`報告位置：${OUTPUT_DIR}/report_${TODAY}.md`);
console.log('POST_MARKET_COMPLETE=true');
process.exit(0);
