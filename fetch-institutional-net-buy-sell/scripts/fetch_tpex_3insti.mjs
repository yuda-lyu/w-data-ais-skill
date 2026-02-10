import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 櫃買中心 (TPEX) 三大法人買賣超抓取程式
 * 目的：抓取 TPEX 三大法人報表
 */

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

        console.log(`Fetched ${rawData.length} records.`);

        // Map data using dynamic fields
        const processedData = rawData.map(row => {
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

        // Output for OpenClaw
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify({
            source: 'tpex',
            date: gregorianDateStr,
            data: processedData
        }, null, 2));
        console.log('JSON_OUTPUT_END');

        // Local backup
        const filename = `tpex_3insti_${gregorianDateStr}.json`;
        const filepath = path.resolve(process.cwd(), filename);
        fs.writeFileSync(filepath, JSON.stringify(processedData, null, 2), 'utf8');
        // console.log(`Saved parsing data to: ${filepath}`);

    } catch (error) {
        console.error('Request failed:', error.message);
    }
}

fetchTpex3Insti();