// fetchWebByCamofox.mjs — 以 Camofox 反偵測瀏覽器抓取網頁（經 accessibility snapshot）
//
// 本檔為 w-fetch-web 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
//
// 對外匯出 fetchWebByCamofox(url, options) → { status, url, html, snapshot, method, fetchedAt, attempts }
// 失敗時回 { status:'error', ... }；本函式不 reject。
//
// 需求：@askjo/camofox-browser（w-fetch-web v1.0.1 起已內含此相依，無須另裝；
//       v1.0.0 未含，呼叫時會回 reason:'camofox-not-found'）。
// 完整 API 見 https://yuda-lyu.github.io/w-fetch-web/global.html
//
// 注意：w-fetch-web 為 UMD 套件，只能 default import，named import 取不到函式。

import wfw from 'w-fetch-web';

export const fetchWebByCamofox = wfw.fetchWebByCamofox;

export default fetchWebByCamofox;
