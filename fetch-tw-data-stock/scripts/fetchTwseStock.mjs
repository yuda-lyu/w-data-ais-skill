import axios from 'axios';

/**
 * TWSE (證交所) 股價核心模組
 * 抓取上市個股日成交資訊或全市場收盤資料
 *
 * @param {string} dateStr - 日期字串 (YYYYMMDD)
 * @param {string} [stockCode] - 股票代號 (例如 "2330")；省略或 "all" 表示全市場
 * @returns {Promise<object>} TWSE API 回傳的原始資料物件
 * @throws {Error} API 錯誤、網路錯誤或無資料
 */

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 429;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

export async function fetchTwseStock(dateStr, stockCode) {
    const isSingleStock = stockCode && stockCode.toLowerCase() !== 'all';
    const stockNo = isSingleStock ? stockCode : 'ALLBUT0999';

    let url;
    if (isSingleStock) {
        url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockNo}`;
    } else {
        url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=ALLBUT0999`;
    }

    console.log(`Fetching TWSE data: ${dateStr}, Stock: ${stockNo}`);
    console.log(`URL: ${url}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });

            const data = response.data;

            if (data.stat !== 'OK') {
                throw new Error(`TWSE API returned: ${data.stat}`);
            }

            return data;

        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                throw error;
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}
