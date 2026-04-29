import axios from 'axios';

/**
 * TPEX (櫃買中心) 股價核心模組
 * 抓取上櫃個股收盤資料 (全市場或指定個股)
 *
 * @param {string} dateStr - 日期字串 (YYYYMMDD)
 * @param {string[]} [stockCodes] - 股票代號陣列 (例如 ["6499","6610"])；省略或空陣列表示全市場
 * @returns {Promise<{source: string, date: string, count: number, data: Array}>} 解析後的資料物件
 * @throws {Error} API 錯誤、網路錯誤或無資料
 */

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 429;
    const code = error.code;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(code);
}

function toRocDate(yyyymmdd) {
    const year  = parseInt(yyyymmdd.substring(0, 4)) - 1911;
    const month = yyyymmdd.substring(4, 6);
    const day   = yyyymmdd.substring(6, 8);
    return `${year}/${month}/${day}`;
}

export async function fetchTpexStock(dateStr, stockCodes) {
    const targetCodes = Array.isArray(stockCodes) ? stockCodes : [];
    const rocDate = toRocDate(dateStr);
    const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&d=${rocDate}&s=0,asc,0&o=json`;

    console.log(`Fetching TPEX data: ${dateStr} (${rocDate})`);
    console.log(`Target: ${targetCodes.length > 0 ? targetCodes.join(', ') : 'All Market'}`);
    console.log(`URL: ${url}`);

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });

            const data = response.data;

            // TPEX API 格式（2026 年後）：{ stat, tables: [{ title: '上櫃股票行情', data: [...] }] }
            // 優先以 title 「行情」字樣比對，避免未來新增其他資料表時誤抓
            const tables = Array.isArray(data.tables) ? data.tables : [];
            const targetTable = tables.find(t => t.title?.includes('行情') && t.data?.length > 0)
                || tables.find(t => t.data?.length > 0);
            const rows = targetTable?.data;

            if (!rows || rows.length === 0) {
                throw new Error('TPEX API returned no data. Possibly a holiday or data not yet available.');
            }

            let resultData = rows;
            if (targetCodes.length > 0) {
                resultData = resultData.filter(row => targetCodes.includes(row[0]));
                if (resultData.length === 0) {
                    // 整體有資料但過濾後為空 → 個股不在上櫃市場（與整體無資料的錯誤訊息明確區分）
                    throw new Error(`指定個股 ${targetCodes.join(',')} 在 ${dateStr} 之上櫃資料中查無資料（可能為上市股、代碼有誤、或當日無交易）`);
                }
            }

            return { source: 'tpex', date: dateStr, count: resultData.length, data: resultData };

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
