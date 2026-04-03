import fs from 'fs';
import path from 'path';
import { fetchMoneydj } from './fetchMoneydj.mjs';

/**
 * MoneyDJ 新聞抓取 CLI
 * 薄包裝層：解析參數 → 呼叫核心 fetchMoneydj() → 寫入 JSON 檔案
 *
 * 用法:
 * node fetch_moneydj.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 moneydj_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ status: 'error', message: '...' }
 *
 * ⚠️ 執行約需 1.5~3 分鐘（50 頁 + 隨機延遲）
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `moneydj_${TODAY}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`結果已儲存至: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

async function main() {
    try {
        console.log('Starting to fetch 50 pages from MoneyDJ (MB06)...');

        const items = await fetchMoneydj({
            onPageDone(pageIndex, itemCount, totalPages) {
                console.log(`Page ${pageIndex}/${totalPages}: Found ${itemCount} items`);
            },
        });

        console.log(`Total fetched: ${items.length} items.`);
        writeOutput({ status: 'success', message: items });

    } catch (error) {
        console.error('Error in main:', error.message);
        writeOutput({ status: 'error', message: error.message });
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
