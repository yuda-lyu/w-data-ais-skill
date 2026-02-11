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
 * 1. outputPath (選填): 儲存結果的檔案路徑 (例如: /path/to/statementdog.json)
 */

// 取得輸入參數
const args = process.argv.slice(2);
const outputPath = args[0]; // Arg 1: 儲存路徑

const url = 'https://statementdog.com/news/latest';

async function fetchNews() {
    try {
        console.log(`Fetching ${url}...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Parse HTML
        const $ = cheerio.load(response.data);
        const newsItems = [];

        $('.statementdog-news-list-item').each((index, element) => {
            const titleElement = $(element).find('.statementdog-news-list-item-title');
            const linkElement = $(element).find('.statementdog-news-list-item-link');
            const timeElement = $(element).find('.statementdog-news-list-item-date');

            if (titleElement.length && linkElement.length) {
                const title = titleElement.text().trim();
                let link = linkElement.attr('href');
                let time = timeElement.text().trim();

                // Handle relative URLs
                if (link && !link.startsWith('http')) {
                    link = `https://statementdog.com${link}`;
                }

                newsItems.push({ time, title, link });
            }
        });

        console.log(`Extracted News Items: ${newsItems.length}`);

        // 輸出 JSON 到 stdout，供 OpenClaw 讀取
        const jsonOutput = JSON.stringify(newsItems, null, 2);
        console.log('JSON_OUTPUT_START');
        console.log(jsonOutput);
        console.log('JSON_OUTPUT_END');

        // 若有指定儲存路徑，則寫入檔案
        if (outputPath) {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, jsonOutput, 'utf-8');
            console.log(`結果已儲存至: ${outputPath}`);
        } else {
            // 本地備份 (預設)
            fs.writeFileSync('statementdog_data.json', jsonOutput);
            // console.log('Data saved to statementdog_data.json');
        }

    } catch (error) {
        console.error('Error fetching news:', error);
    }
}

fetchNews();
