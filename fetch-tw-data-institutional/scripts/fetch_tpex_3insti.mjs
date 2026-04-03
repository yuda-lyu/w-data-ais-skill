import fs from 'fs';
import path from 'path';
import { fetchTpex3insti } from './fetchTpex3insti.mjs';

/**
 * 櫃買中心 (TPEX) 三大法人買賣超抓取程式 — CLI 包裝
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

// --- resolve dateStr ---
let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    const y = parseInt(dateArg.substring(0, 4));
    const m = parseInt(dateArg.substring(4, 6)) - 1;
    const d = parseInt(dateArg.substring(6, 8));
    const check = new Date(y, m, d);
    if (check.getFullYear() !== y || check.getMonth() !== m || check.getDate() !== d) {
        console.error(`日期無效：${dateArg}`);
        process.exit(1);
    }
    dateStr = dateArg;
} else {
    const taipeiStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10);
    dateStr = taipeiStr.replace(/-/g, '');
}

// --- resolve stockCodes ---
let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

// --- resolve output path ---
const defaultFilename = targetCodes.length > 0
    ? `tpex_3insti_${targetCodes.join('_')}_${dateStr}.json`
    : `tpex_3insti_${dateStr}.json`;
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

// --- run ---
(async () => {
    try {
        const result = await fetchTpex3insti(dateStr, targetCodes.length > 0 ? targetCodes : undefined);
        writeOutput({ status: 'success', message: result });
    } catch (err) {
        console.error(err.message || err);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    }
})();
