import axios from 'axios';

/**
 * TWSE (證交所) 融資融券核心模組
 * 目的：抓取上市個股融資融券餘額資料，回傳結構化結果
 * 依賴：axios
 *
 * @param {string} dateStr - 日期字串 YYYYMMDD
 * @param {string[]} [stockCodes] - 指定股票代號陣列，省略或空陣列表示全市場
 * @returns {Promise<{source: string, date: string, count: number, data: object[]}>}
 * @throws {Error} 日期無效、API 錯誤、找不到資料、指定個股不存在等
 */

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500 || status === 429;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

function parseNumber(str) {
    if (typeof str !== 'string') return str;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

export async function fetchTwseMargin(dateStr, stockCodes) {
    // Validate dateStr
    if (!dateStr || !/^\d{8}$/.test(dateStr)) {
        throw new Error(`日期參數無效：格式須為 YYYYMMDD (收到 "${dateStr}")`);
    }
    const _y = parseInt(dateStr.substring(0, 4));
    const _m = parseInt(dateStr.substring(4, 6));
    const _d = parseInt(dateStr.substring(6, 8));
    const testDate = new Date(_y, _m - 1, _d);
    if (testDate.getFullYear() !== _y || testDate.getMonth() !== _m - 1 || testDate.getDate() !== _d) {
        throw new Error(`日期參數無效：不合法的日期 (${dateStr})，年=${_y} 月=${_m} 日=${_d}`);
    }

    const targetCodes = Array.isArray(stockCodes) ? stockCodes.filter(Boolean) : [];

    const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&selectType=ALL&response=json`;

    console.log(`Fetching TWSE margin data: ${dateStr}`);
    console.log(`Target: ${targetCodes.length > 0 ? targetCodes.join(', ') : 'All Market'}`);
    console.log(`URL: ${url}`);

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
                throw new Error(`TWSE MI_MARGN API returned: ${data.stat}`);
            }

            // tables[1] = 融資融券彙總 (個股明細)
            // fields: ["代號","名稱","買進","賣出","現金償還","前日餘額","今日餘額","次一營業日限額",
            //          "買進","賣出","現券償還","前日餘額","今日餘額","次一營業日限額","資券互抵","註記"]
            // 前8欄為融資，後6欄(idx 8-13)為融券，idx 14=資券互抵, idx 15=註記
            const detailTable = data.tables?.find(t => t.data?.length > 0 && t.title?.includes('融資融券彙總'));
            if (!detailTable || !detailTable.data || detailTable.data.length === 0) {
                throw new Error('TWSE MI_MARGN: 找不到融資融券彙總資料表');
            }

            let rows = detailTable.data;

            // Filter by stock codes if specified
            if (targetCodes.length > 0) {
                rows = rows.filter(row => targetCodes.includes(row[0]?.trim()));
                if (rows.length === 0) {
                    throw new Error(`指定個股 ${targetCodes.join(',')} 不在上市融資融券資料中（可能為上櫃股或代碼有誤）`);
                }
            }

            // Parse rows into structured data
            const parsedData = rows.map(row => {
                const marginBuy     = parseNumber(row[2]);
                const marginSell    = parseNumber(row[3]);
                const marginBalance = parseNumber(row[6]);
                const marginPrev    = parseNumber(row[5]);
                const shortBuy      = parseNumber(row[8]);  // 融券買進（回補）
                const shortSell     = parseNumber(row[9]);  // 融券賣出（新增放空）
                const shortBalance  = parseNumber(row[12]);
                const shortPrev     = parseNumber(row[11]);

                return {
                    code:          (row[0] || '').trim(),
                    name:          (row[1] || '').trim(),
                    marginBuy,
                    marginSell,
                    marginCashRepay: parseNumber(row[4]),
                    marginPrevBalance: marginPrev,
                    marginBalance,
                    marginChange:  marginBalance - marginPrev,
                    marginLimit:   parseNumber(row[7]),
                    shortSell,
                    shortBuy,
                    shortCashRepay: parseNumber(row[10]),
                    shortPrevBalance: shortPrev,
                    shortBalance,
                    shortChange:   shortBalance - shortPrev,
                    shortLimit:    parseNumber(row[13]),
                    offset:        parseNumber(row[14]),
                    note:          (row[15] || '').trim(),
                };
            });

            console.log(`Fetched ${parsedData.length} records.`);
            return {
                source: 'twse_margin',
                date: dateStr,
                count: parsedData.length,
                data: parsedData
            };

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
