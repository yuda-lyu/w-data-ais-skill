// fetchAisixiang.mjs — 愛思想（aisixiang.com）抓取邏輯模組
//
// 本檔為 w-dwdata-hub 套件之轉發層：實作已抽出至該套件統一維護，
// 此處僅保留技能既有的匯入路徑與具名匯出，故既有呼叫端無須改動。
//
// 套件以 hub.fetchAisixiang 物件承載本站全部函式，此處展開為技能慣用的具名匯出。
// 完整 API 見 https://yuda-lyu.github.io/w-dwdata-hub/global.html
//
// 注意：
//   1. w-dwdata-hub 為 UMD 套件，只能 default import，named import 取不到函式。
//   2. PAGE_DELAY_MS 與 sleep 未由套件對外提供，於本檔就地保留，維持既有匯出介面
//      （test_fetch_aisixiang.mjs 會 import sleep）。

import hub from 'w-dwdata-hub';

const a = hub.fetchAisixiang;

export const BASE_URL = a.BASE_URL;
export const USER_AGENT = a.USER_AGENT;
export const MAX_PAGES = a.MAX_PAGES;

// 套件未提供，就地保留以維持既有匯出介面
export const PAGE_DELAY_MS = 1000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const safeFilename = a.safeFilename;
export const fetchAuthorsList = a.fetchAuthorsList;
export const lookupAuthor = a.lookupAuthor;
export const fetchTopicsList = a.fetchTopicsList;
export const lookupTopic = a.lookupTopic;
export const fetchAuthorArticles = a.fetchAuthorArticles;
export const fetchKeywordArticles = a.fetchKeywordArticles;
export const fetchTitleArticles = a.fetchTitleArticles;
export const fetchTopicArticles = a.fetchTopicArticles;
export const fetchArticle = a.fetchArticle;
