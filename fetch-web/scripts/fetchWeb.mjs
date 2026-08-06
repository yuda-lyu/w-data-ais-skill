// fetchWeb.mjs — 抓取網頁並以 Readability 解析出標題與內文，四種方法自動階梯升級
//
// 本檔為 w-fetch-web 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// 階梯升級順序（method='auto' 時由套件內部處理）：
//   curl → playwright 無頭 → playwright 有頭 → camofox
//
// 對外匯出 fetchWeb(url, options)：
//   parse=true （預設）成功 → { status:'success', url, title, content, contentLength, method, fetchedAt, attempts }
//   parse=false        成功 → { status:'success', url, html, method, fetchedAt, attempts }
//   失敗               → { status:'error', url, message, fetchedAt, attempts }
//   本函式不 reject。
//
// options：
//   method='auto'   'auto' | 'curl' | 'playwright' | 'playwright-headed' | 'camofox'
//   parse=true      是否以 Readability 解析標題與內文
//   showLog=true    是否顯示階梯升級過程訊息
//   maxRetries=5    各抓取函式失敗時的最大重試次數（含初始共 maxRetries+1 次）
//   其餘鍵值會轉傳給實際執行抓取的函式
// 完整 API 見 https://yuda-lyu.github.io/w-fetch-web/global.html
//
// 注意：
//   1. w-fetch-web 為 UMD 套件，只能 default import，named import 取不到函式。
//   2. 原本本檔另匯出的 inspectHtml（反爬／驗證頁檢測）未由套件對外提供；
//      該檢測邏輯已內含於套件的階梯升級流程中，故不再單獨匯出。

import wfw from 'w-fetch-web';

export const fetchWeb = wfw.fetchWeb;

export default fetchWeb;
