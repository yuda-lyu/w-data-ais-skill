// fetchTwDataHoliday.mjs — 核心函式：取得台灣國定假日清單，可查詢指定日期是否為假日
//
// 輸出：{ dataYear, totalHolidays, holidays, checkDate?, isHoliday?, holidayName? }

import https from 'https';

// ---------- 常數 ----------
const API_URL = 'https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule';
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------- 工具函式 ----------
function httpGet(urlStr) {
    return new Promise((resolve, reject) => {
        const req = https.get(urlStr, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            const status = res.statusCode;
            if (status < 200 || status >= 300) {
                const err = new Error(`HTTP ${status}`);
                err.statusCode = status;
                res.resume();
                reject(err);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy(new Error('Request timeout after 30s'));
        });
    });
}

function isRetryable(error) {
    const status = error.statusCode;
    if (status) return status >= 500 || status === 429;
    const code = error.code;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(code);
}

/**
 * 民國日期 YYYMMDD → 西元日期 YYYYMMDD
 */
function rocToWestern(rocDate) {
    const rocYear = parseInt(rocDate.substring(0, rocDate.length - 4));
    const mmdd = rocDate.substring(rocDate.length - 4);
    return `${rocYear + 1911}${mmdd}`;
}

/**
 * 判斷條目是否為非假日條目（應排除）：
 * - 交易日標記：「國曆新年開始交易日」「農曆春節前最後交易日」「農曆春節後開始交易日」
 * - 結算作業日：「市場無交易，僅辦理結算交割作業」
 */
function isNonHolidayEntry(entry) {
    return /交易日/.test(entry.Name) ||
           /市場無交易/.test(entry.Name) ||
           /開始交易/.test(entry.Description) ||
           /最後交易/.test(entry.Description);
}

// ---------- 主要函式 ----------
export async function fetchTwDataHoliday(checkDate) {
    let body;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            body = await httpGet(API_URL);
            break;
        } catch (e) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(e) || attemptsLeft <= 0) throw e;
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[fetch-tw-data-holiday] 重試 ${attempt}/${MAX_RETRIES}: ${e.message} — 等待 ${delay / 1000}s ...`);
            await sleep(delay);
        }
    }

    const raw = JSON.parse(body);
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error('API 回傳空陣列或格式異常');
    }

    // 轉換為結構化假日清單（排除交易日標記與結算作業日）
    const holidays = raw
        .filter(entry => !isNonHolidayEntry(entry))
        .map(entry => ({
            date: rocToWestern(entry.Date),
            rocDate: entry.Date,
            name: entry.Name,
            weekday: entry.Weekday,
            description: (entry.Description || '').replace(/<br\s*\/?>/gi, '').trim()
        }));

    // 去重（同一天可能有多筆同名條目）
    const seen = new Set();
    const uniqueHolidays = holidays.filter(h => {
        if (seen.has(h.date)) return false;
        seen.add(h.date);
        return true;
    });
    uniqueHolidays.sort((a, b) => a.date.localeCompare(b.date));

    const dataYear = uniqueHolidays.length > 0
        ? uniqueHolidays[0].date.substring(0, 4)
        : null;

    const result = {
        dataYear,
        totalHolidays: uniqueHolidays.length,
        holidays: uniqueHolidays
    };

    if (checkDate) {
        result.checkDate = checkDate;
        const match = uniqueHolidays.find(h => h.date === checkDate);
        result.isHoliday = !!match;
        result.holidayName = match ? match.name : null;
    }

    return result;
}
