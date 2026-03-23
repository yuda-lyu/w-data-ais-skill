import https from 'https';
import fs from 'fs';
import path from 'path';

/**
 * 台股交易日檢查程式
 * 目的：透過 TWSE API 確認指定日期是否為台股交易日
 * 依賴：無（使用 Node.js 內建 https / fs 模組）
 *
 * 用法：
 * node check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
 *
 * 參數：
 * 1. YYYYMMDD (選填)：指定日期，預設為今日。
 * 2. outputPath (選填)：輸出 JSON 檔案路徑，預設為 check_tw_trading_day_YYYYMMDD.json。
 *
 * 輸出（stdout）：
 * - 交易日：TRADING_DAY=true
 * - 非交易日：TRADING_DAY=false
 * - 錯誤：TRADING_DAY=error
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { date, tradingDay: true/false } }
 * - 錯誤：{ status: 'error', message: '...' }
 *
 * Exit Code：
 * - 0：交易日
 * - 1：非交易日
 * - 2：API 錯誤
 */

const dateArg   = process.argv[2];
const outputArg = process.argv[3];

const TODAY = (dateArg && /^\d{8}$/.test(dateArg))
    ? dateArg
    : new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');

const outputFile = outputArg || `check_tw_trading_day_${TODAY}.json`;

const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${TODAY}&type=IND`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

const MAX_RETRIES   = 10;
const BASE_DELAY_MS = 5000; // 每次重試延遲 = BASE_DELAY_MS × attempt（5s, 10s, 15s...，最多 30s）
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function httpGet(urlStr) {
    return new Promise((resolve, reject) => {
        const req = https.get(urlStr, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            const status = res.statusCode;
            // 非 2xx 回應統一以錯誤處理，讓 isRetryable 判斷是否重試
            if (status < 200 || status >= 300) {
                const err = new Error(`HTTP ${status}`);
                err.statusCode = status;
                res.resume();
                reject(err);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: status, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy(new Error('Request timeout after 30s'));
        });
    });
}

function isRetryable(error) {
    const status = error.statusCode;
    if (status) return status >= 500 || status === 429;
    const code = error.code;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(code);
}

// ── 本地週末前置檢查（星期六/日無需呼叫 API）──────────────────────────────
function isWeekend(dateStr) {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    const day = new Date(y, m, d).getDay();
    return day === 0 || day === 6; // 0=日, 6=六
}

console.log(`檢查日期：${TODAY}`);

if (isWeekend(TODAY)) {
    const dayName = ['日', '一', '二', '三', '四', '五', '六'][new Date(parseInt(TODAY.substring(0, 4)), parseInt(TODAY.substring(4, 6)) - 1, parseInt(TODAY.substring(6, 8))).getDay()];
    const reason = `星期${dayName}，非交易日`;
    console.log(`結果：非交易日 ❌ (${reason})`);
    console.log('TRADING_DAY=false');
    writeOutput({ status: 'success', message: { date: TODAY, tradingDay: false, reason } });
    process.exit(1);
}

console.log(`API：${url}`);

async function checkTradingDay() {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const { body } = await httpGet(url);
            const json = JSON.parse(body);
            const stat = json.stat || '';
            if (stat === 'OK') {
                const tables = json.tables || [];
                const firstTable = tables[0] || {};
                const hasData = Array.isArray(firstTable.data) && firstTable.data.length > 0;
                if (hasData) {
                    console.log(`結果：交易日 ✅`);
                    console.log('TRADING_DAY=true');
                    writeOutput({ status: 'success', message: { date: TODAY, tradingDay: true } });
                    process.exit(0);
                } else {
                    // stat=OK + data=[] 有三種可能：
                    //  (a) 今日盤前/盤中 — 收盤資料尚未就緒（MI_INDEX 約 14:30~16:00 更新）
                    //  (b) 今日已過收盤 — 資料應已就緒卻沒有，推定為非交易日
                    //  (c) 非今日（未來日期等）— 無資料
                    // 注意：國定假日走不到這裡，因為 TWSE 會回 stat≠OK（「很抱歉…」）
                    const nowTW = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
                    const todayTW = `${nowTW.getFullYear()}${String(nowTW.getMonth() + 1).padStart(2, '0')}${String(nowTW.getDate()).padStart(2, '0')}`;
                    const currentMinutes = nowTW.getHours() * 60 + nowTW.getMinutes();
                    const CUTOFF = 14 * 60 + 30; // 14:30 — MI_INDEX 收盤資料最早就緒時間

                    if (TODAY === todayTW && currentMinutes < CUTOFF) {
                        // (a) 盤前/盤中：TWSE 未否認交易日（stat=OK），僅收盤資料尚未產生 → 推定為交易日
                        const reason = '盤前/盤中：API 尚無當日收盤資料，推定為交易日（平日且非 TWSE 已知假日）';
                        console.log(`結果：推定交易日 ✅ (${reason})`);
                        console.log('TRADING_DAY=true');
                        writeOutput({ status: 'success', message: { date: TODAY, tradingDay: true, presumed: true, reason } });
                        process.exit(0);
                    } else {
                        // (b)(c) 已過收盤仍無資料，或非今日查詢 → 非交易日
                        const reason = TODAY !== todayTW
                            ? 'API 回傳 OK 但無交易資料（非當日查詢，可能為未來日期或資料不存在）'
                            : 'API 回傳 OK 但無交易資料（已過收盤時間仍無資料，推定為非交易日）';
                        console.log(`結果：非交易日 ❌ (${reason})`);
                        console.log('TRADING_DAY=false');
                        writeOutput({ status: 'success', message: { date: TODAY, tradingDay: false, reason } });
                        process.exit(1);
                    }
                }
            } else {
                // 非交易日不重試（非暫時性狀態）
                console.log(`結果：非交易日 ❌ (${stat})`);
                console.log('TRADING_DAY=false');
                writeOutput({ status: 'success', message: { date: TODAY, tradingDay: false, reason: stat } });
                process.exit(1);
            }
        } catch (e) {
            const retryable = isRetryable(e);
            const attemptsLeft = MAX_RETRIES + 1 - attempt;

            if (!retryable || attemptsLeft <= 0) {
                console.error(`網路錯誤：${e.message}`);
                console.log('TRADING_DAY=error');
                writeOutput({ status: 'error', message: `網路錯誤：${e.message}` });
                process.exit(2);
            }

            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${e.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

checkTradingDay().catch(e => {
    console.error(`未預期錯誤：${e.message}`);
    console.log('TRADING_DAY=error');
    writeOutput({ status: 'error', message: `未預期錯誤：${e.message}` });
    process.exit(2);
});
