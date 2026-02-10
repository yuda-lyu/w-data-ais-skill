import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TPEX (櫃買中心) 股價抓取程式
 * 目的：抓取上櫃個股收盤資料 (全市場)
 * 依賴：axios
 * 
 * 用法:
 * node fetch_tpex.mjs [date] [code1] [code2] ...
 * 
 * 範例:
 * node fetch_tpex.mjs 20260210        (抓取全市場)
 * node fetch_tpex.mjs 20260210 6499   (抓取單檔並篩選)
 */

const args = process.argv.slice(2);
const dateStr = args[0] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const targetCodes = args.slice(1); // Optional: filter by codes

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
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(output, null, 2));
        console.log('JSON_OUTPUT_END');

        // 本地備份
        const filename = `tpex_${dateStr}.json`;
        fs.writeFileSync(filename, JSON.stringify(output, null, 2), 'utf-8');
        // console.log(`Saved to ${filename}`);

    } catch (error) {
        console.error('Error fetching TPEX data:', error.message);
    }
}

fetchTpex();