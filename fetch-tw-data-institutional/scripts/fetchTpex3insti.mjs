import axios from 'axios';

/**
 * 櫃買中心 (TPEX) 三大法人買賣超 — 核心模組
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

export async function fetchTpex3insti(dateStr, stockCodes) {
    if (!/^\d{8}$/.test(dateStr)) {
        throw new Error(`dateStr must be YYYYMMDD, got: ${dateStr}`);
    }

    const targetCodes = Array.isArray(stockCodes) ? stockCodes : [];

    const yyyy   = parseInt(dateStr.substring(0, 4));
    const mm     = dateStr.substring(4, 6);
    const dd     = dateStr.substring(6, 8);
    const rocYear = yyyy - 1911;
    const rocDateStr = `${rocYear}/${mm}/${dd}`;

    const url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&t=D&d=${rocDateStr}&o=json`;
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

            if (!data.tables || data.tables.length === 0) {
                throw new Error('TPEX 3insti: tables not found in response. Possibly a holiday or no data.');
            }

            // 比對策略：以 fields 含「代號」與三大法人欄位（含「外資」「投信」「自營」其一）雙重比對；
            // 失敗退而取 tables[0]，避免未來新增其他資料表時誤抓
            const tables = Array.isArray(data.tables) ? data.tables : [];
            const table = tables.find(t =>
                Array.isArray(t.fields) &&
                t.fields.some(f => String(f).includes('代號')) &&
                t.fields.some(f => /外資|投信|自營/.test(String(f)))
            ) || tables[0];

            const fields  = table.fields;
            const rawData = table.data;

            if (!Array.isArray(fields) || !rawData) {
                throw new Error('TPEX 3insti: data/fields not found in table.');
            }

            let processedData = rawData.map(row => {
                const obj = {};
                fields.forEach((field, index) => {
                    let value = row[index];
                    if (typeof value === 'string') value = value.trim();
                    obj[field] = value;
                });
                return obj;
            });

            if (targetCodes.length > 0) {
                const codeField = fields.find(f => f === '代號') || fields.find(f => f === '證券代號') || fields.find(f => f.includes('代號'));
                if (!codeField) {
                    throw new Error('無法篩選個股：API 回應中找不到代號欄位');
                }
                processedData = processedData.filter(item => targetCodes.includes(item[codeField]));
            }

            console.log(`Fetched ${processedData.length} records.`);
            return { source: 'tpex', date: dateStr, data: processedData };

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
