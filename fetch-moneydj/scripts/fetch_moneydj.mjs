import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio'; // 使用 cheerio 解析 HTML

/**
 * MoneyDJ 新聞抓取程式
 * 目的：抓取 MoneyDJ 台股新聞 (MB06) 前 50 頁
 * 依賴：axios, cheerio
 */

const domain = 'https://www.moneydj.com';
const baseUrl = 'https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=mb06&index1=';

// 延遲函式
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(pageIndex) {
    const url = `${baseUrl}${pageIndex}`;
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'arraybuffer'
        });
        
        const decoder = new TextDecoder('utf-8');
        const html = decoder.decode(response.data);
        const $ = cheerio.load(html);
        const newsItems = [];

        // 使用 CSS Selector 抓取
        // 觀察 MoneyDJ 結構，新聞列表通常在 table.forumgrid 或類似結構中
        // 策略：遍歷所有 tr，檢查是否包含時間與連結
        $('tr').each((i, el) => {
            const $row = $(el);
            // 假設第一欄是時間，第二欄是標題
            const timeText = $row.find('td').eq(0).text().trim();
            const $link = $row.find('td').eq(1).find('a');
            
            // 簡單驗證時間格式 (MM/DD HH:mm)
            if (timeText && /^\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(timeText) && $link.length > 0) {
                const title = $link.attr('title') || $link.text().trim();
                const linkRel = $link.attr('href');
                
                if (linkRel) {
                    const link = linkRel.startsWith('http') ? linkRel : domain + linkRel;
                    newsItems.push({ time: timeText, title, link });
                }
            }
        });

        return newsItems;

    } catch (error) {
        console.error(`Error fetching page ${pageIndex}:`, error.message);
        return [];
    }
}

async function main() {
    console.log('Starting to fetch 50 pages from MoneyDJ (MB06)...');
    let allNewsItems = [];
    const totalPages = 50;

    for (let i = 1; i <= totalPages; i++) {
        const items = await fetchPage(i);
        console.log(`Page ${i}/${totalPages}: Found ${items.length} items`);
        allNewsItems = allNewsItems.concat(items);

        if (i < totalPages) {
            const waitTime = Math.floor(Math.random() * 2000) + 1000;
            await delay(waitTime);
        }
    }

    console.log(`Total fetched: ${allNewsItems.length} items.`);

    // 輸出 JSON 到 stdout (包在標記中)
    console.log('JSON_OUTPUT_START');
    console.log(JSON.stringify(allNewsItems, null, 2));
    console.log('JSON_OUTPUT_END');

    // 本地備份 (可選)
    try {
        fs.writeFileSync('moneydj_data.json', JSON.stringify(allNewsItems, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving file:', err);
    }
}

main();