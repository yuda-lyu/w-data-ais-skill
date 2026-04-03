import fs from 'fs';
import path from 'path';
import { fetchStatementdog } from './fetchStatementdog.mjs';

/**
 * 財報狗 (StatementDog) 新聞抓取 CLI
 * 薄殼：解析參數 → 呼叫核心 → 寫檔 → 結束
 *
 * 用法:
 * node fetch_statementdog.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 statementdog_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `statementdog_${TODAY}.json`;

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

fetchStatementdog()
    .then((newsItems) => {
        writeOutput({ status: 'success', message: newsItems });
    })
    .catch((err) => {
        console.error('Error fetching news:', err.message);
        writeOutput({ status: 'error', message: err.message || String(err) });
        process.exit(1);
    });
