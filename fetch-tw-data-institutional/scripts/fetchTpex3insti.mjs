import axios from 'axios';
import w from 'wsemi';

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

// TPEX 3insti_hedge 端點的 fields 為「裸欄名」——買進股數/賣出股數/買賣超股數各重複 7 次
// （外資不含自營 / 外資自營 / 外資合計 / 投信 / 自營自行 / 自營避險 / 自營合計），群組標籤不在 JSON 內。
// 因此唯一可靠解法是以「固定位置」對應語意欄名（不可用欄名當 key，否則同名後者覆蓋前者、7 組塌成 1 組）。
// 明細欄名對齊 TWSE T86（外陸資.../投信.../自營商...），讓下游（tw-stock-research 主買方判定）
// TWSE/TPEX 共用同一套 key；末欄保留「三大法人買賣超股數合計」（tw-stock-post-market 寫死讀此名，勿改）。
const TPEX_FIELD_MAP = [
    '代號',
    '名稱',
    '外陸資買進股數(不含外資自營商)',
    '外陸資賣出股數(不含外資自營商)',
    '外陸資買賣超股數(不含外資自營商)',
    '外資自營商買進股數',
    '外資自營商賣出股數',
    '外資自營商買賣超股數',
    '外資及陸資買進股數',
    '外資及陸資賣出股數',
    '外資及陸資買賣超股數',
    '投信買進股數',
    '投信賣出股數',
    '投信買賣超股數',
    '自營商買進股數(自行買賣)',
    '自營商賣出股數(自行買賣)',
    '自營商買賣超股數(自行買賣)',
    '自營商買進股數(避險)',
    '自營商賣出股數(避險)',
    '自營商買賣超股數(避險)',
    '自營商買進股數',
    '自營商賣出股數',
    '自營商買賣超股數',
    '三大法人買賣超股數合計',
];

// 結構防呆（fail-loud）：驗證 TPEX 回傳 fields 仍為預期的「24 欄、買進/賣出/買賣超循環 ×7」結構。
// 不符即 throw（非暫時性錯誤，isRetryable 回 false → 不重試、直接報錯），
// 避免 API 改版後靜默把外資的數字貼到投信頭上（財務資料 silent corruption 是最糟失敗模式）。
function assertTpexFieldShape(fields) {
    if (fields.length !== TPEX_FIELD_MAP.length) {
        throw new Error(`TPEX 3insti: 欄數異常，預期 ${TPEX_FIELD_MAP.length} 得 ${fields.length}（疑似 API 改版，請重新校準 TPEX_FIELD_MAP）`);
    }
    if (!String(fields[0]).includes('代號') || !String(fields[1]).includes('名稱')) {
        throw new Error(`TPEX 3insti: 前兩欄非「代號/名稱」（得「${fields[0]}」「${fields[1]}」，疑似 API 改版）`);
    }
    if (!String(fields[fields.length - 1]).includes('合計')) {
        throw new Error(`TPEX 3insti: 末欄非「合計」（得「${fields[fields.length - 1]}」，疑似 API 改版）`);
    }
    const cycle = ['買進股數', '賣出股數', '買賣超股數'];
    for (let i = 2; i < fields.length - 1; i++) {
        const expect = cycle[(i - 2) % 3];
        if (String(fields[i]) !== expect) {
            throw new Error(`TPEX 3insti: 第 ${i} 欄預期「${expect}」得「${fields[i]}」（疑似 API 改版，欄序已變）`);
        }
    }
}

export async function fetchTpex3insti(dateStr, stockCodes) {
    if (!w.isestr(dateStr) || !/^\d{8}$/.test(dateStr)) {
        throw new Error(`dateStr must be YYYYMMDD, got: ${dateStr}`);
    }
    // 合法性驗證：例如 20260230 雖符合 8 碼但日期不存在（與同技能 fetchTwseT86 同款，補齊函數入口防呆）
    {
        const _y = parseInt(dateStr.substring(0, 4));
        const _m = parseInt(dateStr.substring(4, 6));
        const _d = parseInt(dateStr.substring(6, 8));
        const _t = new Date(_y, _m - 1, _d);
        if (_t.getFullYear() !== _y || _t.getMonth() !== _m - 1 || _t.getDate() !== _d) {
            throw new Error(`dateStr 不是合法日期: ${dateStr}（年=${_y} 月=${_m} 日=${_d}）`);
        }
    }

    const targetCodes = w.isearr(stockCodes) ? stockCodes : [];

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

            // 選表：此端點回 tables[0]=資料表、tables[1]=空 {}。取含「代號」「名稱」表頭的資料表，
            // 退而取 tables[0]，避免未來新增其他資料表時誤抓。
            const tables = Array.isArray(data.tables) ? data.tables : [];
            const table = tables.find(t =>
                Array.isArray(t.fields) &&
                t.fields.some(f => String(f).includes('代號')) &&
                t.fields.some(f => String(f).includes('名稱'))
            ) || tables[0];

            const fields  = table?.fields;
            const rawData = table?.data;

            if (!Array.isArray(fields) || !Array.isArray(rawData)) {
                throw new Error('TPEX 3insti: data/fields not found in table.');
            }

            // 套位置對應前先驗結構（fields 為裸欄名，必須靠固定位置才能還原 7 組明細）
            assertTpexFieldShape(fields);

            const processedData = rawData
                .map(row => {
                    const obj = {};
                    TPEX_FIELD_MAP.forEach((key, index) => {
                        let value = row[index];
                        if (typeof value === 'string') value = value.trim();
                        obj[key] = value;
                    });
                    return obj;
                })
                .filter(item => targetCodes.length === 0 || targetCodes.includes(item['代號']));

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
