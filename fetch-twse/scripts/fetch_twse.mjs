import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TWSE (證交所) 股價抓取程式
 * 目的：抓取上市個股日成交資訊或全市場收盤資料
 * 依賴：axios
 * 
 * 用法:
 * node fetch_twse.mjs [date] [stockNo]
 * 
 * 範例:
 * node fetch_twse.mjs 20260210 2330  (抓取台積電)
 * node fetch_twse.mjs 20260210 ALL   (抓取全市場)
 */

const args = process.argv.slice(2);
const dateStr = args[0] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const stockNo = args[1] || 'ALL'; // 預設抓全市場 (ALLBUT0999)

async function fetchTwse() {
    try {
        let url;
        let isSingleStock = stockNo !== 'ALL' && stockNo !== 'ALLBUT0999';

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
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(data, null, 2));
        console.log('JSON_OUTPUT_END');

        // 本地備份
        const filename = isSingleStock 
            ? `twse_${stockNo}_${dateStr}.json` 
            : `twse_ALL_${dateStr}.json`;
        
        fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
        // console.log(`Saved to ${filename}`);

    } catch (error) {
        console.error('Error fetching TWSE data:', error.message);
    }
}

fetchTwse();