import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TWSE (證交所) 股價抓取程式
 * 目的：抓取上市個股日成交資訊或全市場收盤資料
 * 依賴：axios
 *
 * 用法:
 * node fetch_twse.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "2330") 或 "all" (預設)。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 twse_STOCKCODE_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { ... } }
 * - 錯誤/無資料：{ type: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all';
const dateArg      = args[1];
const outputPathArg = args[2];

let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    dateStr = dateArg;
} else {
    dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

const isSingleStock = stockCodeArg.toLowerCase() !== 'all';
const stockNo = isSingleStock ? stockCodeArg : 'ALLBUT0999';

const defaultFilename = isSingleStock
    ? `twse_${stockNo}_${dateStr}.json`
    : `twse_ALL_${dateStr}.json`;
const outputFile = outputPathArg || defaultFilename;

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
const BASE_DELAY_MS = 5000; // delay = BASE_DELAY_MS × attempt, capped at MAX_DELAY_MS
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

async function fetchTwse() {
    let url;
    if (isSingleStock) {
        url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockNo}`;
    } else {
        url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=ALLBUT0999`;
    }

    console.log(`Fetching TWSE data: ${dateStr}, Stock: ${stockNo}`);
    console.log(`URL: ${url}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });

            const data = response.data;

            if (data.stat !== 'OK') {
                // 非交易日或無資料，不重試
                const errMsg = `TWSE API returned: ${data.stat}`;
                console.error(errMsg);
                writeOutput({ type: 'error', message: errMsg });
                process.exit(1);
            }

            writeOutput({ status: 'success', message: data });
            return;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                console.error('Error fetching TWSE data:', error.message);
                writeOutput({ type: 'error', message: error.message });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchTwse().catch(err => {
    console.error(err);
    writeOutput({ type: 'error', message: err.message || String(err) });
    process.exit(1);
});
