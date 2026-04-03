import fs from 'fs';
import path from 'path';
import { fetchTwseStock } from './fetchTwseStock.mjs';

/**
 * TWSE (證交所) 股價抓取 CLI
 * 目的：抓取上市個股日成交資訊或全市場收盤資料
 * 依賴：axios (via fetchTwseStock)
 *
 * 用法:
 * node fetch_twse_stock.mjs [stockCode] [date] [outputPath]
 *
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "2330") 或 "all" (預設)。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑。預設為 twse_STOCKCODE_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { ... } }
 * - 錯誤/無資料：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all';
const dateArg      = args[1];
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

const isSingleStock = stockCodeArg.toLowerCase() !== 'all';
const stockNo = isSingleStock ? stockCodeArg : 'ALL';

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

(async () => {
    try {
        const data = await fetchTwseStock(dateStr, stockCodeArg);
        writeOutput({ status: 'success', message: data });
    } catch (err) {
        console.error('Error fetching TWSE data:', err.message);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    }
})();
