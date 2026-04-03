import axios from 'axios';

/**
 * 證交所 (TWSE) 三大法人買賣超 — 核心模組
 *
 * @param {string} dateStr - 日期字串 YYYYMMDD
 * @param {string[]} [stockCodes] - 股票代號陣列，省略或空陣列表示全市場
 * @returns {Promise<{source: string, date: string, data: object[]}>}
 */

const MAX_RETRIES   = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 429;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

export async function fetchTwseT86(dateStr, stockCodes) {
    if (!/^\d{8}$/.test(dateStr)) {
        throw new Error(`dateStr must be YYYYMMDD, got: ${dateStr}`);
    }

    const targetCodes = Array.isArray(stockCodes) ? stockCodes : [];
    const url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
    console.log(`Fetching from: ${url}`);
    console.log(`Target: ${targetCodes.length === 0 ? 'All Market' : targetCodes.join(', ')}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000,
            });
            const data = response.data;

            if (data.stat !== 'OK') {
                throw new Error(`TWSE T86 API returned: ${data.stat}`);
            }

            const fields  = data.fields;
            const rawData = data.data;

            if (!rawData) {
                throw new Error('TWSE T86: data not found in response.');
            }

            let parsedData = rawData.map(row => {
                const obj = {};
                fields.forEach((field, index) => {
                    let value = row[index];
                    if (typeof value === 'string') value = value.trim();
                    obj[field] = value;
                });
                return obj;
            });

            if (targetCodes.length > 0) {
                const codeField = fields.find(f => f.includes('證券代號'));
                if (!codeField) {
                    throw new Error('無法篩選個股：API 回應中找不到證券代號欄位');
                }
                parsedData = parsedData.filter(item => targetCodes.includes(item[codeField]));
            }

            console.log(`Fetched ${parsedData.length} records.`);
            return { source: 'twse', date: dateStr, data: parsedData };

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
