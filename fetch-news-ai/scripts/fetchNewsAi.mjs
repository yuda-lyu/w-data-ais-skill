// fetchNewsAi.mjs — 核心函式：從多個 RSS / 資料來源取得新聞，填入 from，過濾今日與昨日
//
// 輸出欄位：{ url, time, description, from }
// 依賴技能：fetch-rss、fetch-ai-news-aggregator（動態 import，啟動時偵測路徑是否存在）

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 動態載入相依技能 ----------
async function loadDependency(relPath, exportName) {
  const abs = resolve(__dirname, relPath);
  try {
    const mod = await import(abs);
    if (typeof mod[exportName] !== "function") {
      throw new Error(`模組 ${abs} 未匯出函式 "${exportName}"`);
    }
    return mod[exportName];
  } catch (err) {
    throw new Error(`無法載入相依技能 ${relPath}: ${err.message}`);
  }
}

// ---------- RSS 來源清單 ----------
const RSS_SOURCES = [
  { from: "橘鴉Juya",   rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCIDll3SRcbHwwcXbrwvBZNw" },
  { from: "最佳拍檔",    rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGWYKICLOE8Wxy7q3eYXmPA" },
  { from: "GitCovery",  rss: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBnIBXjWVKnkxDOwChuBHFA" },
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
    "../../fetch-rss/scripts/fetchRSS.mjs", "fetchRSS"
  );
  const fetchAiNewsAggregator = await loadDependency(
    "../../fetch-ai-news-aggregator/scripts/fetchAiNewsAggregator.mjs", "fetchAiNewsAggregator"
  );

  // 並行取得所有來源
  const tasks = [
    // AI News Aggregator（非 RSS，使用專用函式）
    fetchAiNewsAggregator()
      .then((items) => items.map((it) => ({ ...it, from: "AI News Aggregator" })))
      .catch((err) => {
        console.error(`[fetch-news-ai] AI News Aggregator 失敗: ${err.message}`);
        return [];
      }),
    // 各 RSS 來源
    ...RSS_SOURCES.map((src) =>
      fetchRSS(src.rss)
        .then((items) => items.map((it) => ({ ...it, from: src.from })))
        .catch((err) => {
          console.error(`[fetch-news-ai] ${src.from} 失敗: ${err.message}`);
          return [];
        })
    ),
  ];

  const results = await Promise.allSettled(tasks);

  // 彙整所有資料
  const allItems = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  // 過濾今日與昨日
  const filtered = filterTodayAndYesterday(allItems);

  // 依時間降冪排序
  filtered.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

  return filtered;
}
