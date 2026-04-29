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

// 將 YYYYMMDD 轉為民國 ROC 日期字串（用以與 STOCK_DAY 回傳之日期欄位比對）
function toRocDateString(yyyymmdd) {
    const y = parseInt(yyyymmdd.substring(0, 4)) - 1911;
    const m = yyyymmdd.substring(4, 6);
    const d = yyyymmdd.substring(6, 8);
    return `${y}/${m}/${d}`;
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

            // STOCK_DAY 回傳整月資料；若呼叫者明確指定單一日期，過濾為該日單筆
            // 保留原欄位結構（fields/data/title/...），僅替換 data 為篩選後陣列
            if (isSingleStock && Array.isArray(data.data)) {
                const rocDate = toRocDateString(dateStr);
                const filtered = data.data.filter(row => row[0] === rocDate);
                data.data = filtered;
                if (filtered.length === 0) {
                    // 整月有資料但指定日無 → 當日停盤／假日／未開市
                    throw new Error(`TWSE 個股 ${stockCode} 於 ${dateStr} 無交易資料（可能為假日或停盤）`);
                }
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
