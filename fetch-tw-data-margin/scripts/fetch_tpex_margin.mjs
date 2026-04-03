import fs from 'fs';
import path from 'path';
import { fetchTpexMargin } from './fetchTpexMargin.mjs';

/**
 * TPEX (櫃買中心) 融資融券 CLI 包裝
 * 目的：解析命令列參數，呼叫核心模組，將結果寫入 JSON 檔案
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

// Resolve dateStr
let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
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
    ? `tpex_margin_${targetCodes.join('_')}_${dateStr}.json`
    : `tpex_margin_${dateStr}.json`;
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
        const result = await fetchTpexMargin(dateStr, targetCodes);
        writeOutput({ status: 'success', message: result });
    } catch (err) {
        console.error(err.message || err);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    }
})();
