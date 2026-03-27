import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * tw-stock-research 主控腳本
 * 依序執行所有資料抓取技能並產出盤前調研報告
 *
 * 用法：node tw-stock-research/scripts/run_research.mjs [YYYYMMDD] [skillsDir] [baseOutputDir]
 *
 * 參數：
 * 1. YYYYMMDD      (選填)：指定日期，預設為今日。
 * 2. skillsDir     (選填)：技能庫根目錄（各子技能腳本與 node_modules 所在位置），預設為 cwd。
 * 3. baseOutputDir (選填)：輸出根目錄；腳本會自動在此目錄下建立
 *                          tw-stock-research/<YYYYMMDD>/ 子目錄。
 *                          agent 調用時應顯式傳入；若省略僅作本地手動執行時的便利 fallback。
 *
 * skillsDir 與 baseOutputDir 是兩個彼此獨立的根路徑：
 * - skillsDir 只負責定位技能腳本
 * - baseOutputDir 只負責存放資料輸出
 *
 * 實際輸出目錄：<baseOutputDir>/tw-stock-research/<YYYYMMDD>/
 */

const TODAY           = process.argv[2] || new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const SKILLS_DIR      = process.argv[3] || process.cwd();
const BASE_OUTPUT_DIR = process.argv[4] || path.join(process.cwd(), 'w-data-news');
const OUTPUT_DIR      = path.join(BASE_OUTPUT_DIR, 'tw-stock-research', TODAY);

function validateBaseOutputDir(baseDir) {
    const resolved = path.resolve(baseDir);
    if (path.basename(resolved) === TODAY && path.basename(path.dirname(resolved)) === 'tw-stock-research') {
        console.error('[run_research] baseOutputDir 應傳入資料根目錄，例如 /path/to/w-data-news；不要傳入最終輸出目錄 /path/to/w-data-news/tw-stock-research/YYYYMMDD');
        process.exit(2);
    }
}

validateBaseOutputDir(BASE_OUTPUT_DIR);

// 往前推一個工作日（跳過週六日）
function prevWeekday(dateStr) {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    const dt = new Date(y, m, d);
    do { dt.setDate(dt.getDate() - 1); } while (dt.getDay() === 0 || dt.getDay() === 6);
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

const RAW_DIR    = path.join(OUTPUT_DIR, 'raw');
const ERROR_LOG  = path.join(OUTPUT_DIR, 'error_log.jsonl');

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
run('fetch-mops',         'fetch-mops/scripts/fetch_mops.mjs',                 [raw('mops.json')],               360000); // 最多 6 分鐘（launch retry 60s×N + goto retry + API fetches）
run('fetch-cnyes',        'fetch-cnyes/scripts/fetch_cnyes.mjs',               [raw('cnyes.json')],               60000);
run('fetch-statementdog', 'fetch-statementdog/scripts/fetch_statementdog.mjs', [raw('statementdog.json')],        60000);
run('fetch-moneydj',      'fetch-moneydj/scripts/fetch_moneydj.mjs',           [raw('moneydj.json')],            300000); // 最多 5 分鐘

// 法人資料腳本：往前偵測，直到找到有效交易日（最多回溯 30 個工作日）
// - 以 TWSE 回應是否成功作為「是否為交易日」的主判斷依據
// - TWSE 成功後才接著執行 TPEX（同日必然也是交易日）
const MAX_INST_LOOKBACK = 30;
let instDate = prevWeekday(TODAY);
let instFetched = false;

for (let i = 0; i < MAX_INST_LOOKBACK; i++) {
    log(`嘗試法人資料日期：${instDate}（第 ${i + 1} 次）`);
    const twseOk = run('fetch-twse-t86',
        'fetch-institutional-net-buy-sell/scripts/fetch_twse_t86.mjs',
        ['all', instDate, raw('institutional_twse.json')], 60000);

    if (twseOk) {
        // TWSE 成功 → 確認為交易日，接著抓 TPEX
        run('fetch-tpex-3insti',
            'fetch-institutional-net-buy-sell/scripts/fetch_tpex_3insti.mjs',
            ['all', instDate, raw('institutional_tpex.json')], 60000);
        log(`法人資料日期確認：${instDate} ✅`);
        instFetched = true;
        break;
    }

    // TWSE 失敗 → 可能為公假日，繼續往前推
    log(`${instDate} 無 TWSE 資料（可能為公假日），往前推一個工作日...`);
    instDate = prevWeekday(instDate);
}

if (!instFetched) {
    log(`⚠️ 已回溯 ${MAX_INST_LOOKBACK} 個工作日，仍無法取得法人資料，繼續產出報告`);
    appendErrorLog('fetch-twse-t86', 'fetch', 'unknown', `回溯 ${MAX_INST_LOOKBACK} 日仍無資料`, '');
}

// ── Step 3.5: 抓取昨日股價 OHLC（用於二次審計）──────────────────────────────
if (instFetched) {
    log(`抓取昨日股價（${instDate}）供二次審計...`);
    run('fetch-twse-prices',
        'fetch-twse/scripts/fetch_twse.mjs',
        ['all', instDate, raw('prices_twse.json')], 60000);
    run('fetch-tpex-prices',
        'fetch-tpex/scripts/fetch_tpex.mjs',
        ['all', instDate, raw('prices_tpex.json')], 60000);
} else {
    log('⚠️ 無法確定前一交易日，跳過 OHLC 抓取');
}

// ── Step 3.6: 抓取前天股價 OHLC（用於新聞日期交叉審計）──────────────────────
const instDateT2 = prevWeekday(instDate);
if (instFetched) {
    log(`抓取前天股價（${instDateT2}）供新聞日期交叉審計...`);
    run('fetch-twse-prices-t2',
        'fetch-twse/scripts/fetch_twse.mjs',
        ['all', instDateT2, raw('prices_twse_t2.json')], 60000);
    run('fetch-tpex-prices-t2',
        'fetch-tpex/scripts/fetch_tpex.mjs',
        ['all', instDateT2, raw('prices_tpex_t2.json')], 60000);
}

// ── Step 4: 產出報告 ──────────────────────────────────────────────────────────
log('產出報告...');
const reportResult = spawnSync(
    'node',
    [path.join(SKILLS_DIR, 'tw-stock-research/scripts/generate_report.mjs'), TODAY, BASE_OUTPUT_DIR],
    { cwd: SKILLS_DIR, encoding: 'utf8', timeout: 300000 }
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
log(`報告位置：${OUTPUT_DIR}/report_${TODAY}.md`);
console.log('RESEARCH_COMPLETE=true');
process.exit(0);
