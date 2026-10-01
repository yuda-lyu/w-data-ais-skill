#!/usr/bin/env node
// check_tw_trading_day.mjs — CLI 入口：調用 checkTwTradingDay 檢查台股交易日並輸出結果
//
// 用法：
//   node check_tw_trading_day.mjs [YYYYMMDD] [outputPath]
//
// Exit Code：0=交易日, 1=非交易日, 2=API 錯誤

import { checkTwTradingDay } from './checkTwTradingDay.mjs';
import fs from 'fs';
import path from 'path';

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

const dateArg = process.argv[2];
const outputArg = process.argv[3];

const dateStr = (dateArg && /^\d{8}$/.test(dateArg))
    ? dateArg
    : new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');

const outputFile = outputArg || `check_tw_trading_day_${dateStr}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        _guardPath(outputFile);
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

console.log(`檢查日期：${dateStr}`);

try {
    const result = await checkTwTradingDay(dateStr);

    if (result.tradingDay) {
        const label = result.presumed ? '推定交易日' : '交易日';
        const suffix = result.reason ? ` (${result.reason})` : '';
        console.log(`結果：${label} ✅${suffix}`);
        console.log('TRADING_DAY=true');
        writeOutput({ status: 'success', message: result });
        process.exit(0);
    } else {
        console.log(`結果：非交易日 ❌ (${result.reason})`);
        console.log('TRADING_DAY=false');
        writeOutput({ status: 'success', message: result });
        process.exit(1);
    }
} catch (err) {
    console.error(`錯誤：${err.message}`);
    console.log('TRADING_DAY=error');
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(2);
}
