import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * MoneyDJ 新聞抓取程式
 * 目的：抓取 MoneyDJ 台股新聞 (MB06) 前 50 頁
 * 依賴：axios
 */

const domain = 'https://www.moneydj.com';
const baseUrl = 'https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=mb06&index1=';

// 延遲函式
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(pageIndex) {
    const url = `${baseUrl}${pageIndex}`;
    // console.log(`Fetching page ${pageIndex}: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = response.data;
        const newsItems = [];

        // Regex: 尋找時間、連結與標題
        // MB06 頁面結構特徵：td width="100" 包含時間，後續有 a href 包含連結與標題
        const regex = /<td width="100"[^>]*>[\s\S]*?(\d{2}\/\d{2}\s+\d{2}:\d{2})[\s\S]*?<\/font><\/td>[\s\S]*?<a href='([^']+)' title="([^"]+)">/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const time = match[1].trim();
            const linkRel = match[2].trim();
            const title = match[3].trim();

            // 組合完整連結
            const link = linkRel.startsWith('http') ? linkRel : domain + linkRel;
            newsItems.push({ time, title, link });
        }
        return newsItems;
    } catch (error) {
        console.error(`Error fetching page ${pageIndex}:`, error.message);
        return [];
    }
}

async function main() {
    console.log('Starting to fetch 50 pages from MoneyDJ (MB06)...');
    let allNewsItems = [];
    const totalPages = 50; // 抓取 50 頁

    for (let i = 1; i <= totalPages; i++) {
        const items = await fetchPage(i);
        console.log(`Page ${i}/${totalPages}: Found ${items.length} items`);
        allNewsItems = allNewsItems.concat(items);

        // 隨機延遲 1-3 秒，避免被封鎖
        if (i < totalPages) {
            const waitTime = Math.floor(Math.random() * 2000) + 1000;
            await delay(waitTime);
        }
    }

    console.log(`Total fetched: ${allNewsItems.length} items.`);

    // 輸出 JSON 到 stdout，供 OpenClaw 讀取 (包在標記中)
    console.log('JSON_OUTPUT_START');
    console.log(JSON.stringify(allNewsItems, null, 2));
    console.log('JSON_OUTPUT_END');

    // 本地備份 (可選)
    try {
        fs.writeFileSync('moneydj_data.json', JSON.stringify(allNewsItems, null, 2), 'utf8');
        // console.log('Saved data to moneydj_data.json');
    } catch (err) {
        console.error('Error saving file:', err);
    }
}

main();