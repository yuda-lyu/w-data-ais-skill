import axios from 'axios';
import fs from 'fs';

/**
 * 鉅亨網 (Anue) 新聞抓取程式
 * 目的：抓取台股新聞 (tw_stock) 最近 100 筆
 * 依賴：axios
 */

// Helper to format unix timestamp (seconds) to YYYY-MM-DD HH:mm:ss
function formatTime(unixSeconds) {
    const date = new Date(unixSeconds * 1000); // ms
    const pad = (n) => n.toString().padStart(2, '0');
    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());
    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

async function fetchNews() {
    try {
        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400 * 10; // 抓取近 10 天，確保資料量足夠
        const url = 'https://api.cnyes.com/media/api/v1/newslist/category/tw_stock';
        const targetTotal = 100;
        let allItems = [];
        let page = 1;

        console.log('Starting to fetch Anue (tw_stock) news...');

        // 分頁抓取邏輯
        while (allItems.length < targetTotal) {
            const params = {
                page: page,
                limit: 30, // API 單次上限約 30
                isCategoryHeadline: 1,
                startAt: oneDayAgo,
                endAt: now
            };

            // console.log(`Fetching page ${page} from API...`);
            const response = await axios.get(url, { params });
            const items = response.data?.items?.data || [];

            if (items.length === 0) {
                console.log('No more items found.');
                break;
            }

            allItems = allItems.concat(items);
            console.log(`Page ${page}: Fetched ${items.length} items. Total so far: ${allItems.length}`);
            page++;

            // Add a small delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Limit to targetTotal
        const finalItems = allItems.slice(0, targetTotal);
        console.log(`Total items collected: ${finalItems.length}`);

        const parsedItems = finalItems.map(item => {
            return {
                time: formatTime(item.publishAt),
                title: item.title,
                href: `https://news.cnyes.com/news/id/${item.newsId}`
            };
        });

        // 輸出 JSON 到 stdout，供 OpenClaw 讀取 (包在標記中)
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(parsedItems, null, 2));
        console.log('JSON_OUTPUT_END');

        // 本地備份 (可選)
        try {
            fs.writeFileSync('cnyes_news_data.json', JSON.stringify(parsedItems, null, 2), 'utf-8');
            // console.log('Successfully saved to cnyes_news_data.json');
        } catch (err) {
            console.error('Error saving file:', err);
        }

    } catch (error) {
        console.error('Error in fetchNews:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

fetchNews();