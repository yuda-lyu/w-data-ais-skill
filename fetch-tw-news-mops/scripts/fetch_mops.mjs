import fs from 'fs';
import path from 'path';
import { fetchMops } from './fetchMops.mjs';

/**
 * MOPS 資料抓取 CLI
 * 目的：抓取今日重大公告 (上市, 上櫃, 興櫃, 公開發行)
 * 依賴：./fetchMops.mjs (核心模組), playwright
 *
 * 用法:
 * node fetch_mops.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 mops_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `mops_${TODAY}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`結果已儲存至: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

async function main() {
    try {
        const { results, hasError } = await fetchMops();

        const payload = { status: hasError ? 'error' : 'success', message: results };
        writeOutput(payload);

        if (hasError) process.exit(1);
    } catch (error) {
        console.error('發生錯誤:', error.message);
        writeOutput({ status: 'error', message: error.message });
        process.exit(1);
    }
}

main();
