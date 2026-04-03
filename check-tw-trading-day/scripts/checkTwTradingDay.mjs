// checkTwTradingDay.mjs — 核心函式：檢查指定日期是否為台股交易日
//
// 判斷流程：週末 → 國定假日（引用 fetchTwDataHoliday）→ MI_INDEX API
// 輸出：{ date, tradingDay, presumed?, reason? }

import https from 'https';
import { fetchTwDataHoliday } from '../../fetch-tw-data-holiday/scripts/fetchTwDataHoliday.mjs';

// ---------- 常數 ----------
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

function isWeekend(dateStr) {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    const day = new Date(y, m, d).getDay();
    return day === 0 || day === 6;
}

function getDayName(dateStr) {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    return ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m, d).getDay()];
}

// ---------- 主要函式 ----------
export async function checkTwTradingDay(dateStr) {
    // 1. 週末前置檢查
    if (isWeekend(dateStr)) {
        return { date: dateStr, tradingDay: false, reason: `星期${getDayName(dateStr)}，非交易日` };
    }

    // 2. 台灣假日前置檢查（引用 fetch-tw-data-holiday 技能）
    try {
        const holidayResult = await fetchTwDataHoliday(dateStr);
        if (holidayResult.isHoliday) {
            return { date: dateStr, tradingDay: false, reason: `台灣假日：${holidayResult.holidayName}` };
        }
    } catch {
        console.warn('假日排程 API 查詢失敗，略過假日前置檢查');
    }

    // 3. MI_INDEX API 查詢
    const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=IND`;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const body = await httpGet(url);
            const json = JSON.parse(body);
            const stat = json.stat || '';

            if (stat === 'OK') {
                const tables = json.tables || [];
                const firstTable = tables[0] || {};
                const hasData = Array.isArray(firstTable.data) && firstTable.data.length > 0;

                if (hasData) {
                    return { date: dateStr, tradingDay: true };
                }

                // stat=OK + data=[] — 依時間區分
                const nowTW = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
                const todayTW = `${nowTW.getFullYear()}${String(nowTW.getMonth() + 1).padStart(2, '0')}${String(nowTW.getDate()).padStart(2, '0')}`;
                const currentMinutes = nowTW.getHours() * 60 + nowTW.getMinutes();
                const CUTOFF = 14 * 60 + 30;

                if (dateStr === todayTW && currentMinutes < CUTOFF) {
                    return {
                        date: dateStr,
                        tradingDay: true,
                        presumed: true,
                        reason: '盤前/盤中：API 尚無當日收盤資料，推定為交易日（平日且非 TWSE 已知假日）'
                    };
                }

                const reason = dateStr !== todayTW
                    ? 'API 回傳 OK 但無交易資料（非當日查詢，可能為未來日期或資料不存在）'
                    : 'API 回傳 OK 但無交易資料（已過收盤時間仍無資料，推定為非交易日）';
                return { date: dateStr, tradingDay: false, reason };
            }

            // stat≠OK — 非交易日（不重試）
            return { date: dateStr, tradingDay: false, reason: stat };
        } catch (e) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(e) || attemptsLeft <= 0) throw e;
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[check-tw-trading-day] 重試 ${attempt}/${MAX_RETRIES}: ${e.message} — 等待 ${delay / 1000}s ...`);
            await sleep(delay);
        }
    }
}
