import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * TAIFEX (台灣期貨交易所) 資料抓取程式
 * 目的：抓取台指期行情、三大法人期貨未平倉、Put/Call Ratio
 * 依賴：axios
 *
 * 用法:
 * node fetch_taifex.mjs [YYYYMMDD] [outputPath]
 *
 * 參數:
 * 1. YYYYMMDD (選填): 指定日期，預設為今日。
 * 2. outputPath (選填): 儲存結果的檔案路徑。預設為 taifex_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { ... } }
 * - 部分成功：{ status: 'partial', message: { ... }, errors: [...] }
 * - 錯誤/無資料：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const dateArg      = args[0];
const outputPathArg = args[1];

let dateStr;
if (dateArg && /^\d{8}$/.test(dateArg)) {
    const _y = parseInt(dateArg.substring(0, 4));
    const _m = parseInt(dateArg.substring(4, 6));
    const _d = parseInt(dateArg.substring(6, 8));
    const testDate = new Date(_y, _m - 1, _d);
    if (testDate.getFullYear() !== _y || testDate.getMonth() !== _m - 1 || testDate.getDate() !== _d) {
        console.error(`日期參數無效：不合法的日期 (${dateArg})，年=${_y} 月=${_m} 日=${_d}`);
        process.exit(1);
    }
    dateStr = dateArg;
} else {
    dateStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
}

const dateSlash = `${dateStr.substring(0, 4)}/${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`;
const outputFile = outputPathArg || `taifex_${dateStr}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`Saved to ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// Retry logic (same pattern as fetch-tw-data-stock)
// ---------------------------------------------------------------------------
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isRetryable(error) {
    const status = error.response?.status;
    if (status) return status >= 500;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code);
}

/**
 * Fetch a URL with retry logic. Returns the response data as a decoded string.
 * TAIFEX CSVs are encoded in MS950 (Big5).
 */
async function fetchWithRetry(url, label) {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });
            const decoder = new TextDecoder('big5');
            return decoder.decode(response.data);
        } catch (error) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (!isRetryable(error) || attemptsLeft <= 0) {
                throw error;
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[${label} Retry ${attempt}/${MAX_RETRIES}] ${error.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }
}

/**
 * Parse CSV text into an array of objects using the header row as keys.
 * Handles trailing commas and trims whitespace.
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = values[j] || '';
        }
        rows.push(obj);
    }
    return rows;
}

/**
 * Parse a numeric string: remove commas, return number or null if '-' or empty.
 */
function parseNum(str) {
    if (!str || str === '-' || str === '') return null;
    const cleaned = str.replace(/,/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// A. 台指期行情 (Futures Daily Market)
// ---------------------------------------------------------------------------
async function fetchFuturesData() {
    const url = `https://www.taifex.com.tw/cht/3/futDataDown?down_type=1&queryStartDate=${dateSlash}&queryEndDate=${dateSlash}&commodity_id=TX`;
    console.log(`Fetching futures data: ${url}`);

    const csvText = await fetchWithRetry(url, 'Futures');
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
        throw new Error('台指期行情：無資料（可能非交易日）');
    }

    // Filter TX rows (exclude spreads that have "/" in the contract month)
    // and find the nearest month contract
    const txRows = rows.filter(r =>
        r['契約'] === 'TX' && !r['到期月份(週別)'].includes('/')
    );

    if (txRows.length === 0) {
        throw new Error('台指期行情：找不到 TX 合約資料');
    }

    // Sort by contract month ascending to find the near-month
    txRows.sort((a, b) => {
        const monthA = a['到期月份(週別)'].trim();
        const monthB = b['到期月份(週別)'].trim();
        return monthA.localeCompare(monthB);
    });

    // Near-month = the earliest expiry month
    const nearMonth = txRows[0]['到期月份(週別)'].trim();
    const nearMonthRows = txRows.filter(r => r['到期月份(週別)'].trim() === nearMonth);

    // Find regular session (一般) and after-hours session (盤後)
    const regularRow = nearMonthRows.find(r => r['交易時段'] === '一般');
    const afterHoursRow = nearMonthRows.find(r => r['交易時段'] === '盤後');

    const result = {
        contractMonth: nearMonth,
        open: null,
        high: null,
        low: null,
        close: null,
        settlement: null,
        volume: null,
        afterHoursClose: null,
        afterHoursSettlement: null,
        afterHoursVolume: null
    };

    if (regularRow) {
        result.open       = parseNum(regularRow['開盤價']);
        result.high       = parseNum(regularRow['最高價']);
        result.low        = parseNum(regularRow['最低價']);
        result.close      = parseNum(regularRow['收盤價']);
        result.settlement = parseNum(regularRow['結算價']);
        result.volume     = parseNum(regularRow['成交量']);
    }

    if (afterHoursRow) {
        result.afterHoursClose      = parseNum(afterHoursRow['收盤價']);
        result.afterHoursSettlement = parseNum(afterHoursRow['結算價']);
        result.afterHoursVolume     = parseNum(afterHoursRow['成交量']);
    }

    console.log(`  台指期近月 (${nearMonth}): 開${result.open} 高${result.high} 低${result.low} 收${result.close} 結算${result.settlement} 量${result.volume}`);
    if (result.afterHoursClose !== null) {
        console.log(`  盤後: 收${result.afterHoursClose} 結算${result.afterHoursSettlement} 量${result.afterHoursVolume}`);
    }

    return result;
}

// ---------------------------------------------------------------------------
// B. 三大法人期貨未平倉 (Institutional Futures Positions)
// ---------------------------------------------------------------------------
async function fetchInstitutionalData() {
    const url = `https://www.taifex.com.tw/cht/3/futContractsDateDown?queryStartDate=${dateSlash}&queryEndDate=${dateSlash}&commodityId=TXF`;
    console.log(`Fetching institutional data: ${url}`);

    const csvText = await fetchWithRetry(url, 'Institutional');
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
        throw new Error('三大法人期貨未平倉：無資料（可能非交易日）');
    }

    // Map identity names to keys
    const identityMap = {
        '外資及陸資': 'foreign',
        '外資': 'foreign',
        '投信': 'trust',
        '自營商': 'dealers'
    };

    const result = {};

    for (const row of rows) {
        const identity = row['身份別'];
        const key = identityMap[identity];
        if (!key) continue;

        result[key] = {
            longContracts:       parseNum(row['多方未平倉口數']),
            longAmount:          parseNum(row['多方未平倉契約金額(千元)']),
            shortContracts:      parseNum(row['空方未平倉口數']),
            shortAmount:         parseNum(row['空方未平倉契約金額(千元)']),
            netContracts:        parseNum(row['多空未平倉口數淨額']),
            netAmount:           parseNum(row['多空未平倉契約金額淨額(千元)']),
            tradingLong:         parseNum(row['多方交易口數']),
            tradingShort:        parseNum(row['空方交易口數']),
            tradingNet:          parseNum(row['多空交易口數淨額'])
        };

        console.log(`  ${identity}: 未平倉淨額 ${result[key].netContracts} 口`);
    }

    return result;
}

// ---------------------------------------------------------------------------
// C. Put/Call Ratio
// ---------------------------------------------------------------------------
async function fetchPCRatio() {
    const url = `https://www.taifex.com.tw/cht/3/pcRatioDown?queryStartDate=${dateSlash}&queryEndDate=${dateSlash}`;
    console.log(`Fetching P/C ratio: ${url}`);

    const csvText = await fetchWithRetry(url, 'PCRatio');
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
        throw new Error('Put/Call Ratio：無資料（可能非交易日）');
    }

    const row = rows[0];
    const result = {
        putVolume:              parseNum(row['賣權成交量']),
        callVolume:             parseNum(row['買權成交量']),
        ratio:                  parseNum(row['買賣權成交量比率%']),
        putOpenInterest:        parseNum(row['賣權未平倉量']),
        callOpenInterest:       parseNum(row['買權未平倉量']),
        openInterestRatio:      parseNum(row['買賣權未平倉量比率%'])
    };

    console.log(`  Put ${result.putVolume} / Call ${result.callVolume} = ${result.ratio}%`);

    return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log(`Fetching TAIFEX data for ${dateStr} (${dateSlash})`);

    const errors = [];
    let futures = null;
    let institutional = null;
    let pcRatio = null;

    // Fetch all three in parallel
    const [futResult, instResult, pcResult] = await Promise.allSettled([
        fetchFuturesData(),
        fetchInstitutionalData(),
        fetchPCRatio()
    ]);

    if (futResult.status === 'fulfilled') {
        futures = futResult.value;
    } else {
        const msg = `台指期行情: ${futResult.reason?.message || futResult.reason}`;
        console.error(msg);
        errors.push(msg);
    }

    if (instResult.status === 'fulfilled') {
        institutional = instResult.value;
    } else {
        const msg = `三大法人: ${instResult.reason?.message || instResult.reason}`;
        console.error(msg);
        errors.push(msg);
    }

    if (pcResult.status === 'fulfilled') {
        pcRatio = pcResult.value;
    } else {
        const msg = `Put/Call Ratio: ${pcResult.reason?.message || pcResult.reason}`;
        console.error(msg);
        errors.push(msg);
    }

    // Determine overall status
    const hasAnyData = futures || institutional || pcRatio;
    if (!hasAnyData) {
        const errMsg = `所有資料抓取失敗: ${errors.join('; ')}`;
        console.error(errMsg);
        writeOutput({ status: 'error', message: errMsg });
        process.exit(1);
    }

    const payload = {
        status: errors.length > 0 ? 'partial' : 'success',
        message: {
            source: 'taifex',
            date: dateStr,
            futures: futures ? { tx: futures } : null,
            institutional: institutional || null,
            pcRatio: pcRatio || null
        }
    };

    if (errors.length > 0) {
        payload.errors = errors;
    }

    writeOutput(payload);
    console.log(`Done. Status: ${payload.status}`);
}

main().catch(err => {
    console.error(err);
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
});
