import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 證交所 (TWSE) 三大法人買賣超抓取程式
 * 目的：抓取 TWSE T86 報表
 * 
 * 用法:
 * node fetch_twse_t86.mjs [stockCode] [date] [outputPath]
 * 
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "2330") 或 "all" (預設)。若要篩選多檔，請在代碼間用逗號分隔 (例如: "2330,2317")。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑 (例如: /path/to/twse_t86.json)。
 * 
 * 範例:
 * node fetch_twse_t86.mjs all 20260210 ./data/twse_t86_20260210.json
 * node fetch_twse_t86.mjs 2330
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all'; // Arg 1: stockCode or 'all'
const dateArg = args[1]; // Arg 2: date (YYYYMMDD) or undefined
const outputPath = args[2]; // Arg 3: outputPath or undefined

// 解析日期：若未提供或格式錯誤，預設為今日
let today;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    const y = parseInt(dateArg.substring(0, 4));
    const m = parseInt(dateArg.substring(4, 6)) - 1;
    const d = parseInt(dateArg.substring(6, 8));
    today = new Date(y, m, d);
} else {
    today = new Date();
}

// 解析目標代碼
let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

async function fetchTwseT86() {
    // Gregorian Date components
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
    console.log(`Fetching from: ${url}`);
    console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const data = response.data;

        if (data.stat !== 'OK') {
            console.error('Error fetching data:', data.stat);
            if (data.stat.includes('很抱歉')) {
                console.log('Today might be a holiday or data is not yet available.');
            }
            return;
        }

        const fields = data.fields;
        const rawData = data.data;

        // Convert array of arrays to array of objects
        let parsedData = rawData.map(row => {
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
        // 欄位名稱通常包含 "證券代號"
        if (targetCodes.length > 0) {
            const codeField = fields.find(f => f.includes('證券代號'));
            if (codeField) {
                parsedData = parsedData.filter(item => targetCodes.includes(item[codeField]));
            } else {
                console.warn('Cannot filter by code: code field not found in response');
            }
        }

        console.log(`Fetched ${parsedData.length} records.`);

        // Output for OpenClaw
        const jsonOutput = JSON.stringify({
            source: 'twse',
            date: dateStr,
            data: parsedData
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
                ? `twse_t86_${targetCodes.join('_')}_${dateStr}.json`
                : `twse_t86_${dateStr}.json`;
            const cwdFilename = path.resolve(process.cwd(), filename);
            filename = cwdFilename;
        }

        fs.writeFileSync(filename, jsonOutput, 'utf8');
        console.log(`Saved parsed data to: ${filename}`);

    } catch (error) {
        console.error('Request failed:', error.message);
    }
}

fetchTwseT86();
