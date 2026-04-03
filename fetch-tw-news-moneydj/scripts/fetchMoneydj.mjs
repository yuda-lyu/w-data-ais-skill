import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * MoneyDJ 新聞抓取核心模組
 * 抓取 MoneyDJ 台股新聞 (MB06) 前 N 頁（預設 50 頁）
 * 依賴：axios, cheerio
 *
 * @param {object} [options]
 * @param {number} [options.totalPages=50]  要抓取的頁數
 * @param {number} [options.maxRetries=10]  每頁最大重試次數
 * @param {number} [options.baseDelayMs=5000]  重試基礎延遲（毫秒）
 * @param {number} [options.maxDelayMs=30000]  重試最大延遲（毫秒）
 * @param {function} [options.onPageDone]  每頁完成時的回呼 (pageIndex, itemCount, totalPages)
 * @returns {Promise<Array<{time: string, title: string, link: string}>>}
 * @throws {Error} 若抓取到 0 筆新聞或發生不可重試的網路錯誤
 */
export async function fetchMoneydj(options = {}) {
    const {
        totalPages = 50,
        maxRetries = 10,
        baseDelayMs = 5000,
        maxDelayMs = 30000,
        onPageDone = null,
    } = options;

    const domain  = 'https://www.moneydj.com';
    const baseUrl = 'https://www.moneydj.com/kmdj/news/newsreallist.aspx?a=mb06&index1=';

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function isRetryable(error) {
        const status = error.response?.status;
        if (status) return status >= 500 || status === 403 || status === 429;
        return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
    }

    async function fetchPage(pageIndex) {
        const url = `${baseUrl}${pageIndex}`;
        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000,
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
                const attemptsLeft = maxRetries + 1 - attempt;
                if (!isRetryable(error) || attemptsLeft <= 0) throw error;
                const retryDelay = Math.min(baseDelayMs * attempt, maxDelayMs);
                console.warn(`[Page ${pageIndex}][Retry ${attempt}/${maxRetries}] ${error.message} — 等待 ${retryDelay / 1000}s 後重試...`);
                await delay(retryDelay);
            }
        }
    }

    let allNewsItems = [];

    for (let i = 1; i <= totalPages; i++) {
        const items = await fetchPage(i);
        allNewsItems = allNewsItems.concat(items);

        if (typeof onPageDone === 'function') {
            onPageDone(i, items.length, totalPages);
        }

        if (i < totalPages) {
            const waitTime = Math.floor(Math.random() * 2000) + 1000;
            await delay(waitTime);
        }
    }

    if (allNewsItems.length === 0) {
        throw new Error('抓取到 0 筆新聞，可能是頁面結構改變或 selector 失效，請確認 MoneyDJ 頁面是否正常。');
    }

    return allNewsItems;
}

export default fetchMoneydj;
