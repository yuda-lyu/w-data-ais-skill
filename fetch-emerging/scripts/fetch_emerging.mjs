import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

/**
 * Goodinfo (興櫃) 股價抓取程式
 * 目的：抓取指定日期的 OHLC 資料
 * 依賴：puppeteer-core (需本機安裝 Chrome/Chromium)
 * 用法：node fetch_emerging.mjs [date] [code]
 */

const args = process.argv.slice(2);
const dateStr = args[0] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const stockNo = args[1] || '6610'; // 範例代碼

// 民國年轉換 (YYYYMMDD -> YYY/MM/DD)
function toRocDate(yyyymmdd) {
    const year = parseInt(yyyymmdd.substring(0, 4)) - 1911;
    const month = yyyymmdd.substring(4, 6);
    const day = yyyymmdd.substring(6, 8);
    return `${year}/${month}/${day}`; // Goodinfo 格式通常是 115/02/05
}

function findBrowserPath() {
    const platform = process.platform;
    let paths = [];
    if (platform === 'win32') {
        paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
    } else if (platform === 'linux') {
        paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        ];
    } else if (platform === 'darwin') {
        paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ];
    }
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function main() {
    const executablePath = findBrowserPath();
    if (!executablePath) {
        console.error('Error: Browser not found.');
        process.exit(1);
    }

    const targetDate = toRocDate(dateStr); // e.g. "115/02/10"
    console.log(`Fetching Goodinfo ${stockNo} for date ${targetDate}...`);

    const browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Goodinfo K線頁面 (含詳細數據表格)
        const url = `https://goodinfo.tw/StockInfo/ShowK_Chart.asp?STOCK_ID=${stockNo}&CHT_CAT=DAY`;
        
        // 設定 User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Navigating to ${url}...`);
        
        // 訪問頁面，等待 Anti-bot 跳轉完成
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // 有時候需要額外等待表格載入
        await page.waitForSelector('#divDetail table', { timeout: 10000 }).catch(() => console.log('Table not found immediately...'));

        // 抓取表格數據
        const result = await page.evaluate((targetDate) => {
            const table = document.querySelector('#divDetail table');
            if (!table) return { error: 'Table not found' };

            const rows = Array.from(table.querySelectorAll('tr'));
            // 尋找包含目標日期的列
            // Goodinfo 表格第一欄通常是日期 "115/02/10"
            
            // 標頭通常在前面幾行，我們直接找數據列
            for (let row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) continue;
                
                const dateText = cells[0].innerText.trim();
                if (dateText === targetDate) {
                    return {
                        date: dateText,
                        open: parseFloat(cells[1].innerText) || 0,
                        high: parseFloat(cells[2].innerText) || 0,
                        low: parseFloat(cells[3].innerText) || 0,
                        close: parseFloat(cells[4].innerText) || 0,
                        change: parseFloat(cells[5].innerText) || 0,
                        volume: parseFloat(cells[8].innerText.replace(/,/g, '')) || 0 // 交易張數通常在後面
                    };
                }
            }
            return { error: 'Date not found in table' };
        }, targetDate);

        const output = {
            source: 'goodinfo',
            market: 'emerging', // 假設興櫃，但也適用上市櫃
            date: dateStr,
            dateROC: targetDate,
            stock: { code: stockNo },
            ohlc: result.error ? null : result,
            error: result.error ? { type: 'not-found', message: result.error } : null
        };

        // 輸出 JSON
        console.log('JSON_OUTPUT_START');
        console.log(JSON.stringify(output, null, 2));
        console.log('JSON_OUTPUT_END');

        // 本地備份
        fs.writeFileSync(`goodinfo_${stockNo}_${dateStr}.json`, JSON.stringify(output, null, 2), 'utf-8');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
}

main();