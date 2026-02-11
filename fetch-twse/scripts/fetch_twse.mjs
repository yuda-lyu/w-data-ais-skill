import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TWSE (證交所) 股價抓取程式
 * 目的：抓取上市個股日成交資訊或全市場收盤資料
 * 依賴：axios
 * 
 * 用法:
 * node fetch_twse.mjs [stockCode] [date] [outputPath]
 * 
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "2330") 或 "all" (預設)。目前 TWSE API 僅支援單檔或全市場，不支援多檔同時篩選。
 * 2. date (選填): 指定日期 (YYYYMMDD)，預設為今日。
 * 3. outputPath (選填): 儲存結果的檔案路徑 (例如: /path/to/twse.json)。若未提供，則根據日期與代碼自動生成檔名。
 * 
 * 範例:
 * node fetch_twse.mjs all 20260210 ./data/twse_20260210.json
 * node fetch_twse.mjs 2330
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all'; // Arg 1: stockCode or 'all'
const dateArg = args[1]; // Arg 2: date (YYYYMMDD) or undefined
const outputPath = args[2]; // Arg 3: outputPath or undefined

// 解析日期：若未提供或格式錯誤，預設為今日
let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    dateStr = dateArg;
} else {
    dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchTwse() {
    try {
        let url;
        let isSingleStock = stockCodeArg.toLowerCase() !== 'all';
        let stockNo = isSingleStock ? stockCodeArg : 'ALLBUT0999'; // TWSE API 全市場參數

        if (isSingleStock) {
            // 個股日成交資訊
            url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockNo}`;
        } else {
            // 全市場成交資訊 (排除權證)
            url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=ALLBUT0999`;
        }

        console.log(`Fetching TWSE data: ${dateStr}, Stock: ${stockNo}`);
        console.log(`URL: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const data = response.data;

        if (data.stat !== 'OK') {
            console.error(`TWSE API Error: ${data.stat}`);
            if (data.stat.includes('很抱歉')) {
                 console.log('Possibly a holiday or no data available.');
            }
            return;
        }

        // 輸出 JSON 到 stdout
        const jsonOutput = JSON.stringify(data, null, 2);
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
            filename = isSingleStock 
                ? `twse_${stockNo}_${dateStr}.json` 
                : `twse_ALL_${dateStr}.json`;
        }
        
        fs.writeFileSync(filename, jsonOutput, 'utf-8');
        console.log(`Saved to ${filename}`);

    } catch (error) {
        console.error('Error fetching TWSE data:', error.message);
    }
}

fetchTwse();
