import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TPEX (櫃買中心) 融資融券抓取程式
 * 目的：抓取上櫃個股融資融券餘額資料
 * 依賴：axios
 *
 * 用法:
 * node fetch_tpex_margin.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號或 "all"（預設）。多檔以逗號分隔（例如: "6499,6610"）。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 tpex_margin_YYYYMMDD.json。
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
    ? `tpex_margin_${targetCodes.join('_')}_${dateStr}.json`
    : `tpex_margin_${dateStr}.json`;
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
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

function parseNumber(str) {
    if (typeof str !== 'string') return str;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

async function fetchTpexMargin() {
    const rocDate = toRocDate(dateStr);
    const url = `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&d=${rocDate}&o=json`;

    console.log(`Fetching TPEX margin data: ${dateStr} (${rocDate})`);
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

            // TPEX format: { stat: 'ok', tables: [{ title, fields, data }] }
            // fields: ["代號","名稱","前資餘額(張)","資買","資賣","現償","資餘額","資屬證金","資使用率(%)",
            //          "資限額","前券餘額(張)","券賣","券買","券償","券餘額","券屬證金","券使用率(%)","券限額","資券相抵(張)","備註"]
            const marginTable = data.tables?.find(t => t.data?.length > 0);
            if (!marginTable || !marginTable.data || marginTable.data.length === 0) {
                const errMsg = 'TPEX margin API returned no data. Possibly a holiday or data not yet available.';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            let rows = marginTable.data;

            // Filter by stock codes if specified
            if (targetCodes.length > 0) {
                rows = rows.filter(row => targetCodes.includes(row[0]?.trim()));
                if (rows.length === 0) {
                    const errMsg = `指定個股 ${targetCodes.join(',')} 不在上櫃融資融券資料中（可能為上市股或代碼有誤）`;
                    console.error(errMsg);
                    writeOutput({ status: 'error', message: errMsg });
                    process.exit(1);
                }
            }

            // Parse rows into structured data
            // idx: 0=代號, 1=名稱, 2=前資餘額, 3=資買, 4=資賣, 5=現償, 6=資餘額,
            //      7=資屬證金, 8=資使用率, 9=資限額, 10=前券餘額, 11=券賣, 12=券買,
            //      13=券償, 14=券餘額, 15=券屬證金, 16=券使用率, 17=券限額, 18=資券相抵, 19=備註
            const parsedData = rows.map(row => {
                const marginPrev    = parseNumber(row[2]);
                const marginBuy     = parseNumber(row[3]);
                const marginSell    = parseNumber(row[4]);
                const marginBalance = parseNumber(row[6]);
                const shortPrev     = parseNumber(row[10]);
                const shortSell     = parseNumber(row[11]);
                const shortBuy      = parseNumber(row[12]);
                const shortBalance  = parseNumber(row[14]);

                return {
                    code:          (row[0] || '').trim(),
                    name:          (row[1] || '').trim(),
                    marginBuy,
                    marginSell,
                    marginCashRepay: parseNumber(row[5]),
                    marginPrevBalance: marginPrev,
                    marginBalance,
                    marginChange:  marginBalance - marginPrev,
                    marginLimit:   parseNumber(row[9]),
                    shortSell,
                    shortBuy,
                    shortCashRepay: parseNumber(row[13]),
                    shortPrevBalance: shortPrev,
                    shortBalance,
                    shortChange:   shortBalance - shortPrev,
                    shortLimit:    parseNumber(row[17]),
                    offset:        parseNumber(row[18]),
                    note:          (row[19] || '').trim(),
                };
            });

            console.log(`Fetched ${parsedData.length} records.`);
            writeOutput({
                status: 'success',
                message: {
                    source: 'tpex_margin',
                    date: dateStr,
                    count: parsedData.length,
                    data: parsedData
                }
            });
            return;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                console.error('Error fetching TPEX margin data:', error.message);
                writeOutput({ status: 'error', message: error.message });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchTpexMargin().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
