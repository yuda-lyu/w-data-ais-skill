import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * MOPS 資料抓取程式
 * 目的：抓取今日重大公告 (上市, 上櫃, 興櫃, 公開發行)
 * 依賴：playwright (透過 channel: 'chrome' 使用本機 Chrome)
 *
 * 用法:
 * node fetch_mops.mjs [outputPath]
 *
 * 參數:
 * 1. outputPath (選填): 儲存結果的檔案路徑。預設為 mops_YYYYMMDD.json。
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: [...] }
 * - 錯誤：{ status: 'error', message: '...' }
 */

const args = process.argv.slice(2);
const outputPathArg = args[0];

const TODAY = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputPathArg || `mops_${TODAY}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`結果已儲存至: ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

const MAX_RETRIES   = 10;
const BASE_DELAY_MS = 5000; // 每次重試延遲 = BASE_DELAY_MS × attempt（5s, 10s, 15s...，最多 30s）
const MAX_DELAY_MS  = 30000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 定義目標與對應參數
const targets = [
    {
        name: '上市',
        marketKind: 'sii',
        url: 'https://mops.twse.com.tw/mops/api/t146sb10',
        payload: { "scopeType": "2", "companyId": "", "dateType": "2", "firstDate": "", "lastDate": "", "marketKind": "sii", "announcementBasis": "0", "dateRangeType": "1", "announcementType": "1", "sort": "1", "encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1 }
    },
    {
        name: '上櫃',
        marketKind: 'otc',
        url: 'https://mops.twse.com.tw/mops/api/t146sb10',
        payload: { "scopeType": "2", "companyId": "", "dateType": "2", "firstDate": "", "lastDate": "", "marketKind": "otc", "announcementBasis": "0", "dateRangeType": "1", "announcementType": "1", "sort": "1", "encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1 }
    },
    {
        name: '興櫃',
        marketKind: 'rotc',
        url: 'https://mops.twse.com.tw/mops/api/t146sb10',
        payload: { "scopeType": "2", "companyId": "", "dateType": "2", "firstDate": "", "lastDate": "", "marketKind": "rotc", "announcementBasis": "0", "dateRangeType": "1", "announcementType": "1", "sort": "1", "encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1 }
    },
    {
        name: '公開發行',
        marketKind: 'pub',
        url: 'https://mops.twse.com.tw/mops/api/t146sb10',
        payload: { "scopeType": "2", "companyId": "", "dateType": "2", "firstDate": "", "lastDate": "", "marketKind": "pub", "announcementBasis": "0", "dateRangeType": "1", "announcementType": "1", "sort": "1", "encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1 }
    }
];

// 帶重試的 page.evaluate fetch（重試條件：HTTP 5xx 或網路錯誤）
async function fetchTargetWithRetry(page, target) {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        const data = await page.evaluate(async (t) => {
            try {
                const response = await fetch(t.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(t.payload)
                });
                if (response.status >= 500 || response.status === 403 || response.status === 429) {
                    return { error: `HTTP ${response.status}`, retryable: true };
                }
                const text = await response.text();
                try {
                    const json = JSON.parse(text);
                    return { json, raw: text.substring(0, 500) };
                } catch (e) {
                    return { error: 'Parse Error', raw: text, retryable: false };
                }
            } catch (err) {
                return { error: err.toString(), retryable: true };
            }
        }, target);

        if (!data.error) return data;

        const retryable = data.retryable !== false;
        const attemptsLeft = MAX_RETRIES + 1 - attempt;

        if (!retryable || attemptsLeft <= 0) {
            return data; // 回傳錯誤結果，由呼叫方處理
        }

        const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
        console.warn(`[${target.name}][Retry ${attempt}/${MAX_RETRIES}] ${data.error} — 等待 ${delay / 1000}s 後重試...`);
        await sleep(delay);
    }
}

async function main() {
    console.log('啟動瀏覽器...');
    let browser;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            browser = await chromium.launch({
                headless: true,
                channel: 'chrome',
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                timeout: 360000
            });
            break;
        } catch (e) {
            const attemptsLeft = MAX_RETRIES + 1 - attempt;
            if (attemptsLeft <= 0) {
                console.error(`瀏覽器啟動失敗（已重試 ${MAX_RETRIES} 次）: ${e.message}`);
                writeOutput({ status: 'error', message: `瀏覽器啟動失敗: ${e.message}` });
                process.exit(1);
            }
            const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
            console.warn(`[browser.launch][Retry ${attempt}/${MAX_RETRIES}] ${e.message} — 等待 ${delay / 1000}s 後重試...`);
            await sleep(delay);
        }
    }

    let exitCode = 0;
    try {
        const page = await browser.newPage();

        // 帶重試的頁面導航
        console.log('前往 MOPS 重大訊息頁面 (t146sb10)...');
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                await page.goto('https://mops.twse.com.tw/mops/#/web/t146sb10', { waitUntil: 'networkidle', timeout: 60000 });
                break;
            } catch (e) {
                const attemptsLeft = MAX_RETRIES + 1 - attempt;
                if (attemptsLeft <= 0) throw e;
                const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
                console.warn(`[page.goto][Retry ${attempt}/${MAX_RETRIES}] ${e.message} — 等待 ${delay / 1000}s 後重試...`);
                await sleep(delay);
            }
        }

        await page.waitForTimeout(2000);

        const results = [];

        for (const target of targets) {
            console.log(`正在抓取 [${target.name}] 資料...`);

            const data = await fetchTargetWithRetry(page, target);

            results.push({
                market: target.name,
                marketKind: target.marketKind,
                data: data.json || data,
                ...(data.error && { error: data.error }),
                timestamp: new Date().toISOString()
            });

            await page.waitForTimeout(1000);
        }

        const summary = results.map((r) => {
            const resultData = r.data && r.data.result ? r.data.result : r.data;
            const count = Array.isArray(resultData) ? resultData.length : 0;
            return `${r.market}: 取得 ${count} 筆資料`;
        });

        console.log('抓取完成。摘要:', summary);

        const hasError = results.some(r => r.error);
        const payload = { status: hasError ? 'error' : 'success', message: results };
        writeOutput(payload);
        if (hasError) exitCode = 1;

    } catch (error) {
        console.error('發生錯誤:', error.message);
        writeOutput({ status: 'error', message: error.message });
        exitCode = 1;
    } finally {
        await browser.close();
    }
    if (exitCode) process.exit(exitCode);
}

main();
