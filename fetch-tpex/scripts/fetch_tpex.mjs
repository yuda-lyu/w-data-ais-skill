import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TPEX (櫃買中心) 股價抓取程式
 * 目的：抓取上櫃個股收盤資料 (全市場)
 * 依賴：axios
 *
 * 用法:
 * node fetch_tpex.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號或 "all"（預設）。多檔以逗號分隔（例如: "6499,6610"）。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 tpex_YYYYMMDD.json 或 tpex_CODE_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { source, date, count, data } }
 * - 錯誤/無資料：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const stockCodeArg  = args[0] || 'all';
const dateArg       = args[1];
const outputPathArg = args[2];

let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    const _y = parseInt(dateArg.substring(0, 4));
    const _m = parseInt(dateArg.substring(4, 6));
    const _d = parseInt(dateArg.substring(6, 8));
    const testDate = new Date(_y, _m - 1, _d);
    if (testDate.getFullYear() !== _y || testDate.getMonth() !== _m - 1 || testDate.getDate() !== _d) {
        console.error(`日期參數無效：不合法的日期 (${dateArg})，年=${_y} 月=${_m} 日=${_d}`);
        process.exit(1);
    }
    dateStr = dateArg;
} else {
    dateStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
}

let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

const defaultFilename = targetCodes.length > 0
    ? `tpex_${targetCodes.join('_')}_${dateStr}.json`
    : `tpex_${dateStr}.json`;
const outputFile = outputPathArg || defaultFilename;

function toRocDate(yyyymmdd) {
    const year  = parseInt(yyyymmdd.substring(0, 4)) - 1911;
    const month = yyyymmdd.substring(4, 6);
    const day   = yyyymmdd.substring(6, 8);
    return `${year}/${month}/${day}`;
}

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`Saved to ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000; // 每次重試延遲 = BASE_DELAY_MS × attempt（5s, 10s, 15s...，最多 30s）
const MAX_DELAY_MS  = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500; // HTTP 5xx（502/503 等伺服器錯誤）
    // 網路層錯誤
    const code = error.code;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(code);
}

async function fetchTpex() {
    const rocDate = toRocDate(dateStr);
    const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&d=${rocDate}&s=0,asc,0&o=json`;

    console.log(`Fetching TPEX data: ${dateStr} (${rocDate})`);
    console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);
    console.log(`URL: ${url}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });

            const data = response.data;

            // TPEX API 格式（2026 年後）：{ stat, tables: [{ title: '上櫃股票行情', data: [...] }] }
            const rows = data.tables?.find(t => t.data?.length > 0)?.data;

            if (!rows || rows.length === 0) {
                // 無資料 = 非交易日或資料未就緒，不重試
                const errMsg = 'TPEX API returned no data. Possibly a holiday or data not yet available.';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            let resultData = rows;
            if (targetCodes.length > 0) {
                resultData = resultData.filter(row => targetCodes.includes(row[0]));
                if (resultData.length === 0) {
                    const errMsg = `指定個股 ${targetCodes.join(',')} 不在上櫃資料中（可能為上市股或代碼有誤）`;
                    console.error(errMsg);
                    writeOutput({ status: 'error', message: errMsg });
                    process.exit(1);
                }
            }

            const payload = {
                status: 'success',
                message: { source: 'tpex', date: dateStr, count: resultData.length, data: resultData }
            };
            writeOutput(payload);
            return; // 成功，結束

        } catch (error) {
            const retryable = isRetryable(error);
            const attemptsLeft = MAX_RETRIES + 1 - attempt;

            if (!retryable || attemptsLeft <= 0) {
                console.error(`Error fetching TPEX data: ${error.message}`);
                writeOutput({ status: 'error', message: error.message });
                process.exit(1);
            }

            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchTpex().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
