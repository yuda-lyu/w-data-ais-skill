// fetchNewsAi.mjs — 核心函式：從多個 RSS / 資料來源取得新聞，填入 from，過濾今日與昨日
//
// 輸出欄位：{ url, time, title, description, from, type }（type 固定為 "news-ai"）
// 依賴技能：fetch-rss、fetch-ai-news-aggregator、fetch-hacker-news（動態 import，啟動時偵測路徑是否存在）

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '..', '..');

// ---------- 動態載入相依技能 ----------
async function loadDependency(absPath, exportName) {
  try {
    const mod = await import(pathToFileURL(absPath).href);
    if (typeof mod[exportName] !== "function") {
      throw new Error(`模組 ${absPath} 未匯出函式 "${exportName}"`);
    }
    return mod[exportName];
  } catch (err) {
    throw new Error(`無法載入相依技能 ${absPath}: ${err.message}`);
  }
}

// ---------- 網域黑名單 ----------
// 文章內容過短（多為一行快訊）無法供後續 AI 選文／摘要使用的來源網域
// 比對方式：URL hostname 等於該網域，或為其子網域（例如 www.gelonghui.com 屬於 gelonghui.com）
const BLOCKED_URL_DOMAINS = [
  "gelonghui.com", // 格隆汇：一行快訊為主，無法摘要
];

function isBlockedUrl(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return BLOCKED_URL_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

// ---------- RSS 來源清單 ----------
const RSS_SOURCES = [
  { from: "橘鴉Juya",   rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCIDll3SRcbHwwcXbrwvBZNw" },
  { from: "最佳拍檔",    rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGWYKICLOE8Wxy7q3eYXmPA" },
  { from: "GitCovery",  rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBnIBXjWVKnkxDOwChuBHFA" },
  { from: "唐国梁Tommy", rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCVezb06mOvkXDwB8ibaOlYQ" },
  { from: "奇客Solidot", rss: "https://www.solidot.org/index.rss" },
  { from: "36氪",       rss: "https://36kr.com/feed" },
  { from: "少数派",      rss: "https://sspai.com/feed" },
  { from: "IT之家",     rss: "https://www.ithome.com/rss/" },
];

// ---------- 工具函式 ----------
const TZ_OFFSET = 8; // UTC+8

/** 取得 UTC+8 的日期字串 YYYY-MM-DD */
function getUTC8DateString(date) {
  const utc8 = new Date(date.getTime() + TZ_OFFSET * 60 * 60 * 1000);
  const y = utc8.getUTCFullYear();
  const m = String(utc8.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc8.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 過濾：僅保留今日與昨日（UTC+8）的資料 */
function filterTodayAndYesterday(items) {
  const now = new Date();
  const today = getUTC8DateString(now);
  const yesterday = getUTC8DateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  return items.filter((item) => {
    const dateStr = (item.time || "").slice(0, 10); // "YYYY-MM-DD"
    return dateStr === today || dateStr === yesterday;
  });
}

// ---------- 主要函式 ----------
export async function fetchNewsAi() {
  // 動態載入相依技能（啟動時偵測，路徑錯誤立即報錯）
  const fetchRSS = await loadDependency(
    path.join(skillsDir, 'fetch-rss', 'scripts', 'fetchRSS.mjs'), "fetchRSS"
  );
  const fetchAiNewsAggregator = await loadDependency(
    path.join(skillsDir, 'fetch-ai-news-aggregator', 'scripts', 'fetchAiNewsAggregator.mjs'), "fetchAiNewsAggregator"
  );
  const fetchHackerNews = await loadDependency(
    path.join(skillsDir, 'fetch-hacker-news', 'scripts', 'fetchHackerNews.mjs'), "fetchHackerNews"
  );

  // 並行取得所有來源（多支獨立來源 → 整批耗時 = 最慢那支，而非各支耗時加總；
  // 上游 trigger 有 timeout 約束，序列模式會線性累加並撞破天花板）
  // 每支再加單支硬上限 45s race timeout，避免單支跑滿重試（最壞 225s）拖慢整批
  const PER_SOURCE_TIMEOUT_MS = 45000;
  function withTimeout(promise, ms, from) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${from} timeout ${ms}ms`)), ms)
      ),
    ]);
  }

  const tasks = [
    withTimeout(fetchAiNewsAggregator(), PER_SOURCE_TIMEOUT_MS, "AI News Aggregator")
      .then((items) => items.map((it) => ({ ...it, from: "AI News Aggregator" })))
      .catch((err) => {
        console.error(`[fetch-news-ai] AI News Aggregator 失敗: ${err.message}`);
        return [];
      }),
    withTimeout(fetchHackerNews(), PER_SOURCE_TIMEOUT_MS, "Hacker News")
      .then((items) => items.map((it) => ({ ...it, from: "Hacker News" })))
      .catch((err) => {
        console.error(`[fetch-news-ai] Hacker News 失敗: ${err.message}`);
        return [];
      }),
    ...RSS_SOURCES.map((src) =>
      withTimeout(fetchRSS(src.rss), PER_SOURCE_TIMEOUT_MS, src.from)
        .then((items) => items.map((it) => ({ ...it, from: src.from })))
        .catch((err) => {
          console.error(`[fetch-news-ai] ${src.from} 失敗: ${err.message}`);
          return [];
        })
    ),
  ];

  const results = await Promise.allSettled(tasks);
  const allItems = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // 網域黑名單過濾（AI 選文前移除無法摘要的來源）
  const allowed = allItems.filter((it) => !isBlockedUrl(it.url));

  // 過濾今日與昨日
  const filtered = filterTodayAndYesterday(allowed);

  // 統一標記 type，避免外部 agent 自行補值導致 sheet 重複
  const typed = filtered.map((item) => ({ ...item, type: "news-ai" }));

  // 依時間降冪排序
  typed.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

  return typed;
}
