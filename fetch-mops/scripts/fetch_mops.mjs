import puppeteer from 'puppeteer-core';
import { map } from 'lodash-es';
import fs from 'fs';
import path from 'path';

/**
 * MOPS 資料抓取程式
 * 目的：抓取今日重大公告 (上市, 上櫃, 興櫃, 公開發行)
 * 依賴：puppeteer-core (需本機安裝 Chrome/Chromium)
 */

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

// 尋找瀏覽器路徑 (支援 Windows & Linux)
function findBrowserPath() {
    const platform = process.platform;
    let paths = [];

    if (platform === 'win32') {
        paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ];
    } else if (platform === 'linux') {
        paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ];
    } else if (platform === 'darwin') { // macOS (預留)
        paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ];
    }

    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`偵測到瀏覽器: ${p}`);
            return p;
        }
    }
    return null;
}

async function main() {
    const executablePath = findBrowserPath();
    if (!executablePath) {
        console.error('錯誤：找不到 Chrome 或 Edge 瀏覽器。請確認已安裝。');
        process.exit(1);
    }

    console.log('啟動瀏覽器...');
    const browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // 進入頁面以取得 Session/Referer
        console.log('前往 MOPS 重大訊息頁面 (t146sb10)...');
        await page.goto('https://mops.twse.com.tw/mops/#/web/t146sb10', { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        const results = [];

        for (const target of targets) {
            console.log(`正在抓取 [${target.name}] 資料...`);
            
            const data = await page.evaluate(async (t) => {
                try {
                    const jsonBody = JSON.stringify(t.payload);
                    const response = await fetch(t.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: jsonBody
                    });
                    const text = await response.text();
                    try {
                        const json = JSON.parse(text);
                        return { json, raw: text.substring(0, 500) };
                    } catch (e) {
                        return { error: 'Parse Error', raw: text };
                    }
                } catch (err) {
                    return { error: err.toString() };
                }
            }, target);

            results.push({
                market: target.name,
                marketKind: target.marketKind,
                data: data.json || data,
                timestamp: new Date().toISOString()
            });

            await new Promise(r => setTimeout(r, 1000));
        }

        const summary = map(results, (r) => {
            const resultData = r.data && r.data.result ? r.data.result : r.data;
            const count = Array.isArray(resultData) ? resultData.length : 0;
            return `${r.market}: 取得 ${count} 筆資料`;
        });

        console.log('抓取完成。摘要:', summary);

        // 輸出 JSON 到 stdout，供 OpenClaw 讀取
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(results, null, 2));
        console.log('JSON_OUTPUT_END');

    } catch (error) {
        console.error('發生錯誤:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();