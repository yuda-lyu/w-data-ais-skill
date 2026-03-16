import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * 鉅亨網 (Anue) 新聞抓取程式
 * 目的：抓取台股新聞 (tw_stock) 最近 100 筆
 * 依賴：axios
 *
 * 用法:
 * node fetch_cnyes.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 cnyes_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ type: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `cnyes_${TODAY}.json`;

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

async function fetchWithRetry(url, params) {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            return await axios.get(url, { params });
        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) throw error;
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`結果已儲存至: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

function formatTime(unixSeconds) {
    const date = new Date(unixSeconds * 1000);
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
        const oneDayAgo = now - 86400 * 10;
        const url = 'https://api.cnyes.com/media/api/v1/newslist/category/tw_stock';
        const targetTotal = 100;
        let allItems = [];
        let page = 1;

        console.log('Starting to fetch Anue (tw_stock) news...');

        while (allItems.length < targetTotal) {
            const params = {
                page: page,
                limit: 30,
                isCategoryHeadline: 1,
                startAt: oneDayAgo,
                endAt: now
            };

            const response = await fetchWithRetry(url, params);
            const items = response.data?.items?.data || [];

            if (items.length === 0) {
                console.log('No more items found.');
                break;
            }

            allItems = allItems.concat(items);
            console.log(`Page ${page}: Fetched ${items.length} items. Total so far: ${allItems.length}`);
            page++;

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const finalItems = allItems.slice(0, targetTotal);
        console.log(`Total items collected: ${finalItems.length}`);

        const parsedItems = finalItems.map(item => ({
            time: formatTime(item.publishAt),
            title: item.title,
            href: `https://news.cnyes.com/news/id/${item.newsId}`
        }));

        const payload = { status: 'success', message: parsedItems };
        writeOutput(payload);

    } catch (error) {
        console.error('Error in fetchNews:', error.message);
        if (error.response) console.error('Response data:', error.response.data);
        writeOutput({ type: 'error', message: error.message });
        process.exit(1);
    }
}

fetchNews().catch(err => {
    console.error(err);
    writeOutput({ type: 'error', message: err.message || String(err) });
    process.exit(1);
});
