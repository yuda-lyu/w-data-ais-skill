import axios from 'axios';
import fs from 'fs';
import * as cheerio from 'cheerio';

/**
 * 財報狗 (StatementDog) 新聞抓取程式
 * 目的：抓取財報狗最新新聞
 * 依賴：axios, cheerio
 */

const url = 'https://statementdog.com/news/latest';
const outputFile = 'statementdog_news.html';

async function fetchNews() {
    try {
        console.log(`Fetching ${url}...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // 備份 HTML (可選)
        // fs.writeFileSync(outputFile, response.data);
        // console.log(`HTML saved to ${outputFile}`);

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
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(newsItems, null, 2));
        console.log('JSON_OUTPUT_END');

        // 本地備份
        fs.writeFileSync('statementdog_data.json', JSON.stringify(newsItems, null, 2));
        // console.log('Data saved to statementdog_data.json');

    } catch (error) {
        console.error('Error fetching news:', error);
    }
}

fetchNews();