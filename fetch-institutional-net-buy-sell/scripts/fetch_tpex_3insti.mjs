import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 櫃買中心 (TPEX) 三大法人買賣超抓取程式
 * 目的：抓取 TPEX 三大法人報表
 * 
 * 用法:
 * node fetch_tpex_3insti.mjs [stockCode] [outputPath]
 * 
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "6499") 或 "all" (預設)。若要篩選多檔，請在代碼間用逗號分隔 (例如: "6499,6610")。
 * 2. outputPath (選填): 儲存結果的檔案路徑 (例如: /path/to/tpex_3insti.json)。
 * 
 * 範例:
 * node fetch_tpex_3insti.mjs all ./data/tpex_3insti_20260210.json
 * node fetch_tpex_3insti.mjs 6499
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all'; // Arg 1: stockCode or 'all'
const outputPath = args[1]; // Arg 2: outputPath

// 解析目標代碼
let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

async function fetchTpex3Insti() {
    const today = new Date();
    
    // Gregorian Date components
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const gregorianDateStr = `${yyyy}${mm}${dd}`;

    // ROC Date components for TPEX URL (YYY/MM/DD)
    const rocYear = yyyy - 1911;
    const rocDateStr = `${rocYear}/${mm}/${dd}`;

    const url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&t=D&d=${rocDateStr}&o=json`;
    console.log(`Fetching from: ${url}`);
    console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const data = response.data;

        // Check if tables exist
        if (!data.tables || data.tables.length === 0) {
            console.error('Error: valid data/tables not found in response.', data);
            return;
        }

        // Usually the first table is the main data
        const table = data.tables[0];
        const fields = table.fields;
        const rawData = table.data;

        if (!rawData) {
            console.error('Error: valid data not found in table.', table);
            return;
        }

        // Map data using dynamic fields
        let processedData = rawData.map(row => {
            const obj = {};
            fields.forEach((field, index) => {
                let value = row[index];
                if (typeof value === 'string') {
                    value = value.trim();
                }
                obj[field] = value;
            });
            return obj;
        });

        // Filter if target codes specified
        // 欄位名稱通常包含 "代號"
        if (targetCodes.length > 0) {
            const codeField = fields.find(f => f.includes('代號'));
            if (codeField) {
                processedData = processedData.filter(item => targetCodes.includes(item[codeField]));
            } else {
                console.warn('Cannot filter by code: code field not found in response');
            }
        }

        console.log(`Fetched ${processedData.length} records.`);

        // Output for OpenClaw
        const jsonOutput = JSON.stringify({
            source: 'tpex',
            date: gregorianDateStr,
            data: processedData
        }, null, 2);

        console.log('JSON_OUTPUT_START');
        console.log(jsonOutput);
        console.log('JSON_OUTPUT_END');

        // 決定儲存路徑
        let filename;
        if (outputPath) {
            filename = outputPath;
            const dir = path.dirname(filename);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } else {
            // 預設檔名
            filename = targetCodes.length > 0
                ? `tpex_3insti_${targetCodes.join('_')}_${gregorianDateStr}.json`
                : `tpex_3insti_${gregorianDateStr}.json`;
            const cwdFilename = path.resolve(process.cwd(), filename);
            filename = cwdFilename; // use absolute path for log
        }

        fs.writeFileSync(filename, jsonOutput, 'utf8');
        console.log(`Saved parsed data to: ${filename}`);

    } catch (error) {
        console.error('Request failed:', error.message);
    }
}

fetchTpex3Insti();
