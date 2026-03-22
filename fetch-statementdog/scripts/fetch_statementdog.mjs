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
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

async function fetchNews() {
    console.log(`Fetching ${url}...`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 30000,
            });

            const $ = cheerio.load(response.data);
            const newsItems = [];

            $('.statementdog-news-list-item').each((index, element) => {
                const titleElement = $(element).find('.statementdog-news-list-item-title');
                const linkElement  = $(element).find('.statementdog-news-list-item-link');
                const timeElement  = $(element).find('.statementdog-news-list-item-date');

                if (titleElement.length && linkElement.length) {
                    const title = titleElement.text().trim();
                    let link = linkElement.attr('href');
                    let time = timeElement.text().trim();

                    if (link && !link.startsWith('http')) {
                        link = `https://statementdog.com${link}`;
                    }

                    newsItems.push({ time, title, link });
                }
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
