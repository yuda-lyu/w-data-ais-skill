import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

/**
 * MoneyDJ 新聞抓取程式
 * 目的：抓取 MoneyDJ 台股新聞 (MB06) 前 50 頁
 * 依賴：axios, cheerio
 *
 * 用法:
 * node fetch_moneydj.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 moneydj_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ type: 'error', message: '...' }
 *
 * ⚠️ 執行約需 1.5~3 分鐘（50 頁 + 隨機延遲）
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `moneydj_${TODAY}.json`;

const domain  = 'https://www.moneydj.com';
const baseUrl = 'https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=mb06&index1=';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`結果已儲存至: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

async function fetchPage(pageIndex) {
    const url = `${baseUrl}${pageIndex}`;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                responseType: 'arraybuffer'
            });

            // NOTE: MoneyDJ 已確認使用 UTF-8 編碼（多次實測結果正確），無需 Big5 解碼。
            const decoder = new TextDecoder('utf-8');
            const html = decoder.decode(response.data);
            const $ = cheerio.load(html);
            const newsItems = [];

            $('tr').each((i, el) => {
                const $row = $(el);
                const timeText = $row.find('td').eq(0).text().trim();
                const $link = $row.find('td').eq(1).find('a');

                if (timeText && /^(\d{2}\/\d{2}\s+\d{2}:\d{2}|\d{2}:\d{2}|昨\s*\d{2}:\d{2})$/.test(timeText) && $link.length > 0) {
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
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) throw error;
            const retryDelay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Page ${pageIndex}][Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${retryDelay / 1000}s 後重試...`);
            await delay(retryDelay);
        }
    }
}

async function main() {
    try {
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

        if (allNewsItems.length === 0) {
            const errMsg = '抓取到 0 筆新聞，可能是頁面結構改變或 selector 失效，請確認 MoneyDJ 頁面是否正常。';
            console.error(errMsg);
            writeOutput({ type: 'error', message: errMsg });
            process.exit(1);
        }

        const payload = { status: 'success', message: allNewsItems };
        writeOutput(payload);

    } catch (error) {
        console.error('Error in main:', error.message);
        writeOutput({ type: 'error', message: error.message });
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    writeOutput({ type: 'error', message: err.message || String(err) });
    process.exit(1);
});
