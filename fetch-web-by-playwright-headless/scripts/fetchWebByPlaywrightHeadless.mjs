// fetchWebByPlaywrightHeadless.mjs — 以 Playwright 無頭 Chrome 抓取網頁原始 HTML
//
// 本檔為 w-fetch-web 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// 對外匯出 fetchWebByPlaywrightHeadless(url, options) → { status, url, html, method, fetchedAt, attempts }
// 失敗時回 { status:'error', ... }；本函式不 reject。
//
// 需求：本機已安裝 Chrome（playwright 以 channel: 'chrome' 啟動）。
// 完整 API 見 https://yuda-lyu.github.io/w-fetch-web/global.html
//
// 注意：w-fetch-web 為 UMD 套件，只能 default import，named import 取不到函式。

import wfw from 'w-fetch-web';

export const fetchWebByPlaywrightHeadless = wfw.fetchWebByPlaywrightHeadless;

export default fetchWebByPlaywrightHeadless;
