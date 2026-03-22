import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 櫃買中心 (TPEX) 三大法人買賣超抓取程式
 * 目的：抓取 TPEX 三大法人報表
 *
 * 用法:
 * node fetch_tpex_3insti.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號或 "all"（預設）。多檔以逗號分隔（例如: "6499,6610"）。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 tpex_3insti_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { source, date, data } }
 * - 錯誤/無資料：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const stockCodeArg  = args[0] || 'all';
const dateArg       = args[1];
const outputPathArg = args[2];

let today;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    const y = parseInt(dateArg.substring(0, 4));
    const m = parseInt(dateArg.substring(4, 6)) - 1;
    const d = parseInt(dateArg.substring(6, 8));
    today = new Date(y, m, d);
} else {
    const taipeiStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10);
    const [ty, tm, td] = taipeiStr.split('-').map(Number);
    today = new Date(ty, tm - 1, td);
}

let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

const yyyy              = today.getFullYear();
const mm                = String(today.getMonth() + 1).padStart(2, '0');
const dd                = String(today.getDate()).padStart(2, '0');
const gregorianDateStr  = `${yyyy}${mm}${dd}`;
const rocYear           = yyyy - 1911;
const rocDateStr        = `${rocYear}/${mm}/${dd}`;

const defaultFilename = targetCodes.length > 0
    ? `tpex_3insti_${targetCodes.join('_')}_${gregorianDateStr}.json`
    : `tpex_3insti_${gregorianDateStr}.json`;
const outputFile = outputPathArg || defaultFilename;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`Saved parsed data to: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000; // delay = BASE_DELAY_MS × attempt, capped at MAX_DELAY_MS
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

async function fetchTpex3Insti() {
    const url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&t=D&d=${rocDateStr}&o=json`;
    console.log(`Fetching from: ${url}`);
    console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000,
            });
            const data = response.data;

            if (!data.tables || data.tables.length === 0) {
                // 非交易日或無資料，不重試
                const errMsg = 'TPEX 3insti: tables not found in response. Possibly a holiday or no data.';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            const table  = data.tables[0];
            const fields = table.fields;
            const rawData = table.data;

            if (!rawData) {
                const errMsg = 'TPEX 3insti: data not found in table.';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            let processedData = rawData.map(row => {
                const obj = {};
                fields.forEach((field, index) => {
                    let value = row[index];
                    if (typeof value === 'string') value = value.trim();
                    obj[field] = value;
                });
                return obj;
            });

            if (targetCodes.length > 0) {
                const codeField = fields.find(f => f.trim() === '代號');
                if (codeField) {
                    processedData = processedData.filter(item => targetCodes.includes(item[codeField]));
                } else {
                    console.warn('Cannot filter by code: code field not found in response');
                }
            }

            console.log(`Fetched ${processedData.length} records.`);
            writeOutput({ status: 'success', message: { source: 'tpex', date: gregorianDateStr, data: processedData } });
            return;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                console.error('Request failed:', error.message);
                writeOutput({ status: 'error', message: error.message });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchTpex3Insti().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
