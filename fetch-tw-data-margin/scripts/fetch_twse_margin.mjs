import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TWSE (證交所) 融資融券抓取程式
 * 目的：抓取上市個股融資融券餘額資料
 * 依賴：axios
 *
 * 用法:
 * node fetch_twse_margin.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號或 "all"（預設）。多檔以逗號分隔（例如: "2330,2317"）。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 twse_margin_YYYYMMDD.json。
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
    ? `twse_margin_${targetCodes.join('_')}_${dateStr}.json`
    : `twse_margin_${dateStr}.json`;
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
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 429;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

function parseNumber(str) {
    if (typeof str !== 'string') return str;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

async function fetchTwseMargin() {
    const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&selectType=ALL&response=json`;

    console.log(`Fetching TWSE margin data: ${dateStr}`);
    console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);
    console.log(`URL: ${url}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000,
            });
            const data = response.data;

            if (data.stat !== 'OK') {
                const errMsg = `TWSE MI_MARGN API returned: ${data.stat}`;
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            // tables[1] = 融資融券彙總 (個股明細)
            // fields: ["代號","名稱","買進","賣出","現金償還","前日餘額","今日餘額","次一營業日限額",
            //          "買進","賣出","現券償還","前日餘額","今日餘額","次一營業日限額","資券互抵","註記"]
            // 前8欄為融資，後6欄(idx 8-13)為融券，idx 14=資券互抵, idx 15=註記
            const detailTable = data.tables?.find(t => t.data?.length > 0 && t.title?.includes('融資融券彙總'));
            if (!detailTable || !detailTable.data || detailTable.data.length === 0) {
                const errMsg = 'TWSE MI_MARGN: 找不到融資融券彙總資料表';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            let rows = detailTable.data;

            // Filter by stock codes if specified
            if (targetCodes.length > 0) {
                rows = rows.filter(row => targetCodes.includes(row[0]?.trim()));
                if (rows.length === 0) {
                    const errMsg = `指定個股 ${targetCodes.join(',')} 不在上市融資融券資料中（可能為上櫃股或代碼有誤）`;
                    console.error(errMsg);
                    writeOutput({ status: 'error', message: errMsg });
                    process.exit(1);
                }
            }

            // Parse rows into structured data
            const parsedData = rows.map(row => {
                const marginBuy     = parseNumber(row[2]);
                const marginSell    = parseNumber(row[3]);
                const marginBalance = parseNumber(row[6]);
                const marginPrev    = parseNumber(row[5]);
                const shortBuy      = parseNumber(row[8]);  // 融券買進 = 券買/回補
                const shortSell     = parseNumber(row[9]);  // 融券賣出 = 券賣/放空
                const shortBalance  = parseNumber(row[12]);
                const shortPrev     = parseNumber(row[11]);

                return {
                    code:          (row[0] || '').trim(),
                    name:          (row[1] || '').trim(),
                    marginBuy,
                    marginSell,
                    marginCashRepay: parseNumber(row[4]),
                    marginPrevBalance: marginPrev,
                    marginBalance,
                    marginChange:  marginBalance - marginPrev,
                    marginLimit:   parseNumber(row[7]),
                    shortSell,
                    shortBuy,
                    shortCashRepay: parseNumber(row[10]),
                    shortPrevBalance: shortPrev,
                    shortBalance,
                    shortChange:   shortBalance - shortPrev,
                    shortLimit:    parseNumber(row[13]),
                    offset:        parseNumber(row[14]),
                    note:          (row[15] || '').trim(),
                };
            });

            console.log(`Fetched ${parsedData.length} records.`);
            writeOutput({
                status: 'success',
                message: {
                    source: 'twse_margin',
                    date: dateStr,
                    count: parsedData.length,
                    data: parsedData
                }
            });
            return;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                console.error('Error fetching TWSE margin data:', error.message);
                writeOutput({ status: 'error', message: error.message });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchTwseMargin().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
