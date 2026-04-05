import fs from 'fs';
import path from 'path';
import { fetchTaifex } from './fetchTaifex.mjs';

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
    if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
        throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

/**
 * TAIFEX (台灣期貨交易所) 資料抓取 CLI
 * 目的：抓取台指期行情、三大法人期貨未平倉、Put/Call Ratio
 * 依賴：axios（透過 fetchTaifex 核心模組）
 *
 * 用法:
 * node fetch_taifex.mjs [YYYYMMDD] [outputPath]
 *
 * 參數:
 * 1. YYYYMMDD (選填): 指定日期，預設為今日。
 * 2. outputPath (選填): 儲存結果的檔案路徑。預設為 taifex_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { ... } }
 * - 部分成功：{ status: 'partial', message: { ... }, errors: [...] }
 * - 錯誤/無資料：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const dateArg      = args[0];
const outputPathArg = args[1];

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

const outputFile = outputPathArg || `taifex_${dateStr}.json`;

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

async function main() {
    try {
        const result = await fetchTaifex(dateStr);

        const status = result.errors.length > 0 ? 'partial' : 'success';
        const payload = {
            status,
            message: {
                source: 'taifex',
                date: result.date,
                futures: result.futures,
                institutional: result.institutional,
                pcRatio: result.pcRatio
            }
        };

        if (result.errors.length > 0) {
            payload.errors = result.errors;
        }

        writeOutput(payload);
        console.log(`Done. Status: ${payload.status}`);
    } catch (err) {
        console.error(err);
        const errMsg = err.errors
            ? `所有資料抓取失敗: ${err.errors.join('; ')}`
            : (err.message || String(err));
        writeOutput({ status: 'error', message: errMsg });
        process.exit(1);
    }
}

main();
