import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TPEX (櫃買中心) 股價抓取程式
 * 目的：抓取上櫃個股收盤資料 (全市場)
 * 依賴：axios
 * 
 * 用法:
 * node fetch_tpex.mjs [stockCode] [outputPath]
 * 
 * 參數:
 * 1. stockCode (選填): 指定股票代號 (例如: "6499") 或 "all" (預設)。若要篩選多檔，請在代碼間用逗號分隔 (例如: "6499,6610")。
 * 2. outputPath (選填): 儲存結果的檔案路徑 (例如: /path/to/tpex.json)。若未提供，則根據日期與代碼自動生成檔名。
 * 
 * 範例:
 * node fetch_tpex.mjs all ./data/tpex_20260210.json
 * node fetch_tpex.mjs 6499
 */

const args = process.argv.slice(2);
const stockCodeArg = args[0] || 'all'; // Arg 1: stockCode or 'all'
const outputPath = args[1]; // Arg 2: outputPath

// 取得今日日期 (YYYYMMDD)
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// 解析目標代碼
let targetCodes = [];
if (stockCodeArg.toLowerCase() !== 'all') {
    targetCodes = stockCodeArg.split(',');
}

// 轉換西元 -> 民國 (YYYYMMDD -> YYY/MM/DD)
function toRocDate(yyyymmdd) {
    const year = parseInt(yyyymmdd.substring(0, 4)) - 1911;
    const month = yyyymmdd.substring(4, 6);
    const day = yyyymmdd.substring(6, 8);
    return `${year}/${month}/${day}`;
}

async function fetchTpex() {
    try {
        const rocDate = toRocDate(dateStr);
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&d=${rocDate}&s=0,asc,0&o=json`;

        console.log(`Fetching TPEX data: ${dateStr} (${rocDate})`);
        console.log(`Target: ${stockCodeArg === 'all' ? 'All Market' : targetCodes.join(', ')}`);
        console.log(`URL: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });

        const data = response.data;

        // TPEX 回傳的 aaData 為主要資料
        if (!data.aaData || data.aaData.length === 0) {
             console.error('TPEX API Error: No data found (aaData is empty)');
             if (data.reportDate !== rocDate) {
                 console.log('Possibly a holiday or no data available.');
             }
             return;
        }

        let resultData = data.aaData;

        // 若有指定代碼，進行篩選 (TPEX API 不支援直接指定代碼，需 client-side filter)
        if (targetCodes.length > 0) {
            resultData = resultData.filter(row => targetCodes.includes(row[0])); // row[0] 是代碼
        }

        const output = {
            source: 'tpex',
            date: dateStr,
            count: resultData.length,
            data: resultData
        };

        // 輸出 JSON 到 stdout
        const jsonOutput = JSON.stringify(output, null, 2);
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
                ? `tpex_${targetCodes.join('_')}_${dateStr}.json`
                : `tpex_${dateStr}.json`;
        }

        fs.writeFileSync(filename, jsonOutput, 'utf-8');
        console.log(`Saved to ${filename}`);

    } catch (error) {
        console.error('Error fetching TPEX data:', error.message);
    }
}

fetchTpex();
