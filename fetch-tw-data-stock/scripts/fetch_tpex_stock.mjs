import fs from 'fs';
import path from 'path';
import { fetchTpexStock } from './fetchTpexStock.mjs';

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

/**
 * TPEX (櫃買中心) 股價抓取 CLI
 * 目的：抓取上櫃個股收盤資料 (全市場)
 * 依賴：axios (via fetchTpexStock)
 *
 * 用法:
 * node fetch_tpex_stock.mjs [stockCode] [date] [outputPath]
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

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        _guardPath(outputFile);
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`Saved to ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

(async () => {
    try {
        const result = await fetchTpexStock(dateStr, targetCodes.length > 0 ? targetCodes : undefined);
        writeOutput({ status: 'success', message: result });
    } catch (err) {
        console.error(`Error fetching TPEX data: ${err.message}`);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    }
})();
