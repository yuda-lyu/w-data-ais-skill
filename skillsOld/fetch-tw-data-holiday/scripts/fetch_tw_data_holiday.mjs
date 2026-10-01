#!/usr/bin/env node
// fetch_tw_data_holiday.mjs — CLI 入口：調用 fetchTwDataHoliday 查詢台灣假日並輸出結果
//
// 用法：
//   node fetch_tw_data_holiday.mjs [YYYYMMDD] [outputPath]

import { fetchTwDataHoliday } from './fetchTwDataHoliday.mjs';
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

const checkDate = (dateArg && /^\d{8}$/.test(dateArg)) ? dateArg : null;
const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const outputFile = outputArg || `tw_holiday_${checkDate || today}.json`;

function writeOutput(payload) {
    try {
        const dir = path.dirname(outputFile);
        if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
        _guardPath(outputFile);
        fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`Saved to ${outputFile}`);
    } catch (e) {
        console.error(`寫檔失敗：${e.message}`);
    }
}

try {
    const result = await fetchTwDataHoliday(checkDate);

    if (checkDate) {
        const queryYear = checkDate.substring(0, 4);
        if (result.dataYear && queryYear !== result.dataYear) {
            console.warn(`警告：查詢年份 ${queryYear} 與 API 資料年份 ${result.dataYear} 不同，結果可能不準確`);
        }
    }

    console.log(`共 ${result.totalHolidays} 個台灣假日（${result.dataYear} 年）`);

    if (checkDate) {
        if (result.isHoliday) {
            console.log(`結果：${checkDate} 為台灣假日（${result.holidayName}）`);
            console.log('HOLIDAY=true');
        } else {
            console.log(`結果：${checkDate} 非台灣假日`);
            console.log('HOLIDAY=false');
        }
    } else {
        console.log(`HOLIDAY_COUNT=${result.totalHolidays}`);
    }

    writeOutput({ status: 'success', message: { source: 'twse-openapi', ...result } });
} catch (err) {
    console.error(`錯誤：${err.message}`);
    if (checkDate) console.log('HOLIDAY=error');
    writeOutput({ status: 'error', message: err.message || String(err) });
    process.exit(1);
}
