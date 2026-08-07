// fetchRSS.mjs — 取得 RSS 內容並轉換為統一格式的 items 陣列
//
// 本檔為 w-dwdata-hub 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// fetchRSS(rssUrl, opt) → [{ url, time, title, description, from }]
// 完整 API 見 https://yuda-lyu.github.io/w-dwdata-hub/global.html
//
// 注意：w-dwdata-hub 為 UMD 套件，只能 default import，named import 取不到函式。

import hub from 'w-dwdata-hub';

export const fetchRSS = hub.fetchRSS;

export default fetchRSS;
