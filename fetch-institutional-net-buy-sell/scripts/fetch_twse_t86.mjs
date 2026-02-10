import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 證交所 (TWSE) 三大法人買賣超抓取程式
 * 目的：抓取 TWSE T86 報表
 */

async function fetchTwseT86() {
    // Get today's date in YYYYMMDD format
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
    console.log(`Fetching from: ${url}`);

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

        console.log(`Fetched ${rawData.length} records.`);

        // Convert array of arrays to array of objects
        const parsedData = rawData.map(row => {
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
            source: 'twse',
            date: dateStr,
            data: parsedData
        }, null, 2));
        console.log('JSON_OUTPUT_END');

        // Local backup
        const filename = `twse_t86_${dateStr}.json`;
        const filepath = path.resolve(process.cwd(), filename);
        fs.writeFileSync(filepath, JSON.stringify(parsedData, null, 2), 'utf8');
        // console.log(`Saved parsed data to: ${filepath}`);

    } catch (error) {
        console.error('Request failed:', error.message);
    }
}

fetchTwseT86();