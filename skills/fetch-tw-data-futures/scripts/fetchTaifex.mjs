// fetchTaifex.mjs — 抓取期交所 (TAIFEX) 期貨、三大法人與 P/C ratio 資料
//
// 本檔為 w-dwdata-hub 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// fetchTaifex(dateStr, opt) → { date, futures, institutional, pcRatio, errors }
// 完整 API 見 https://yuda-lyu.github.io/w-dwdata-hub/global.html
//
// 注意：w-dwdata-hub 為 UMD 套件，只能 default import，named import 取不到函式。

import hub from 'w-dwdata-hub';

export const fetchTaifex = hub.fetchTaifex;

export default fetchTaifex;
