import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

/**
 * 財報狗 (StatementDog) 新聞抓取程式
 * 目的：抓取財報狗最新新聞
 * 依賴：axios, cheerio
 *
 * 用法:
 * node fetch_statementdog.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 statementdog_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `statementdog_${TODAY}.json`;

const url = 'https://statementdog.com/news/latest';

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

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000; // delay = BASE_DELAY_MS × attempt, capped at MAX_DELAY_MS
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 403 || status === 429;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

async function fetchNews() {
    console.log(`Fetching ${url}...`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                },
                timeout: 30000,
            });

            const $ = cheerio.load(response.data);
            const newsItems = [];

            // 主要 selector；若財報狗改版導致 selector 失效，fallback 使用 article/a 通用結構
            const PRIMARY_ITEM     = '.statementdog-news-list-item';
            const PRIMARY_TITLE    = '.statementdog-news-list-item-title';
            const PRIMARY_LINK     = '.statementdog-news-list-item-link';
            const PRIMARY_DATE     = '.statementdog-news-list-item-date';
            const FALLBACK_ITEM    = 'article, .news-item, [class*="news"][class*="item"]';
            const FALLBACK_TITLE   = 'h2, h3, [class*="title"]';
            const FALLBACK_LINK    = 'a[href]';
            const FALLBACK_DATE    = 'time, [class*="date"], [class*="time"]';

            const usePrimary = $(PRIMARY_ITEM).length > 0;
            const itemSel  = usePrimary ? PRIMARY_ITEM  : FALLBACK_ITEM;
            const titleSel = usePrimary ? PRIMARY_TITLE : FALLBACK_TITLE;
            const linkSel  = usePrimary ? PRIMARY_LINK  : FALLBACK_LINK;
            const dateSel  = usePrimary ? PRIMARY_DATE  : FALLBACK_DATE;

            if (!usePrimary) {
                console.warn('主要 CSS selector 未匹配，嘗試 fallback selector...');
            }

            $(itemSel).each((index, element) => {
                const titleElement = $(element).find(titleSel);
                const linkElement  = usePrimary ? $(element).find(linkSel) : $(element).find(linkSel).first();
                const timeElement  = $(element).find(dateSel);

                const title = titleElement.text().trim();
                let link = linkElement.attr('href');
                let time = timeElement.text().trim();

                if (!title || !link) return;

                if (link && !link.startsWith('http')) {
                    link = `https://statementdog.com${link.startsWith('/') ? '' : '/'}${link}`;
                }

                newsItems.push({ time, title, link });
            });

            console.log(`Extracted News Items: ${newsItems.length}`);

            if (newsItems.length === 0) {
                // 頁面結構問題，非暫時性，不重試
                const errMsg = '抓取到 0 筆新聞，可能是頁面結構改變或 selector 失效，請確認財報狗頁面是否正常。';
                console.error(errMsg);
                writeOutput({ status: 'error', message: errMsg });
                process.exit(1);
            }

            writeOutput({ status: 'success', message: newsItems });
            return;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                console.error('Error fetching news:', error.message);
                writeOutput({ status: 'error', message: error.message });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

fetchNews().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
