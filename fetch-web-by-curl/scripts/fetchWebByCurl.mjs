// fetchWebByCurl.mjs — 以系統 curl 抓取網頁原始 HTML
//
// 本檔為 w-fetch-web 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// 對外匯出 fetchWebByCurl(url, options) → { status, url, html, htmlLength, httpCode, method, fetchedAt, attempts }
// 失敗時回 { status:'error', url, message, reason, httpCode, method, fetchedAt, attempts }；本函式不 reject。
//
// options：timeoutMs(15000)、maxRetries(5)、userAgent、referer、acceptLanguage
// 完整 API 見 https://yuda-lyu.github.io/w-fetch-web/global.html
//
// 注意：w-fetch-web 為 UMD 套件，只能 default import，named import 取不到函式。

import wfw from 'w-fetch-web';

export const fetchWebByCurl = wfw.fetchWebByCurl;

export default fetchWebByCurl;
