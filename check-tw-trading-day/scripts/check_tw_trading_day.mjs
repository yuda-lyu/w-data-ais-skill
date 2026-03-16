import https from 'https';
import fs from 'fs';
import path from 'path';

/**
 * 台股交易日檢查程式
 * 目的：透過 TWSE API 確認指定日期是否為台股交易日
 * 依賴：無（使用 Node.js 內建 https / fs 模組）
 *
 * 用法：
 * node check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
 *
 * 參數：
 * 1. YYYYMMDD (選填)：指定日期，預設為今日。
 * 2. outputPath (選填)：輸出 JSON 檔案路徑，預設為 check_tw_trading_day_YYYYMMDD.json。
 *
 * 輸出（stdout）：
 * - 交易日：TRADING_DAY=true
 * - 非交易日：TRADING_DAY=false
 * - 錯誤：TRADING_DAY=error
 *
 * 輸出（file）：
 * - 成功：{ status: 'success', message: { date, tradingDay: true/false } }
 * - 錯誤：{ type: 'error', message: '...' }
 *
 * Exit Code：
 * - 0：交易日
 * - 1：非交易日
 * - 2：API 錯誤
 */

const dateArg   = process.argv[2];
const outputArg = process.argv[3];

const TODAY = (dateArg && /^\d{8}$/.test(dateArg))
    ? dateArg
    : new Date().toISOString().slice(0, 10).replace(/-/g, '');

const outputFile = outputArg || `check_tw_trading_day_${TODAY}.json`;

const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${TODAY}&type=IND`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

console.log(`檢查日期：${TODAY}`);
console.log(`API：${url}`);

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const stat = json.stat || '';
            if (stat === 'OK') {
                console.log(`結果：交易日 ✅`);
                console.log('TRADING_DAY=true');
                writeOutput({ status: 'success', message: { date: TODAY, tradingDay: true } });
                process.exit(0);
            } else {
                console.log(`結果：非交易日 ❌ (${stat})`);
                console.log('TRADING_DAY=false');
                writeOutput({ status: 'success', message: { date: TODAY, tradingDay: false, reason: stat } });
                process.exit(1);
            }
        } catch (e) {
            console.error(`解析失敗：${e.message}`);
            console.log('TRADING_DAY=error');
            writeOutput({ type: 'error', message: `解析失敗：${e.message}` });
            process.exit(2);
        }
    });
}).on('error', (e) => {
    console.error(`網路錯誤：${e.message}`);
    console.log('TRADING_DAY=error');
    writeOutput({ type: 'error', message: `網路錯誤：${e.message}` });
    process.exit(2);
});
