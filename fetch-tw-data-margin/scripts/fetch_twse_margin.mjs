import fs from 'fs';
import path from 'path';
import { fetchTwseMargin } from './fetchTwseMargin.mjs';

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

/**
 * TWSE (證交所) 融資融券 CLI 包裝
 * 目的：解析命令列參數，呼叫核心模組，將結果寫入 JSON 檔案
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

// Resolve dateStr
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

// Resolve target codes
let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

// Resolve output file path
const defaultFilename = targetCodes.length > 0
    ? `twse_margin_${targetCodes.join('_')}_${dateStr}.json`
    : `twse_margin_${dateStr}.json`;
const outputFile = outputPathArg || defaultFilename;

function writeOutput(payload) {
    try {
        _guardPath(outputFile);
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
        const result = await fetchTwseMargin(dateStr, targetCodes);
        writeOutput({ status: 'success', message: result });
    } catch (err) {
        console.error(err.message || err);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    }
})();
