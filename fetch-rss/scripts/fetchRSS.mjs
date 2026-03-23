// fetchRSS.mjs — 核心函式：取得 RSS 內容並轉換為統一格式的 items 陣列
//
// 輸出欄位：{ url, time, title, description, from }

import axios from "axios";
import Parser from "rss-parser";

// ---------- 常數 ----------
const TIMEOUT = 30000;
const TIMEZONE_OFFSET = 8; // UTC+8
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms

// ---------- 工具函式 ----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(error) {
  const status = error.response?.status;
  // YouTube RSS 會回傳暫時性 404，因此將 404 也納入重試範圍
  if (status) return status >= 500 || status === 404;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNABORTED"].includes(error.code);
}

function toUTC8(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const utc8 = new Date(d.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())} ` +
    `${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`
  );
}

// ---------- 主要函式 ----------
export async function fetchRSS(rssUrl) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data: xml } = await axios.get(rssUrl, {
        timeout: TIMEOUT,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
        responseType: "text",
      });

      const parser = new Parser();
      const feed = await parser.parseString(xml);

      const feedFrom = (feed.title || "").trim();

      const items = feed.items.map((item) => ({
        url: (item.link || "").trim(),
        time: toUTC8(item.isoDate || item.pubDate || ""),
        title: (item.title || "").trim(),
        description: (item.contentSnippet || item.summary || "").trim(),
        from: (item.creator || feedFrom).trim(),
      }));

      return items;
    } catch (err) {
      lastError = err;

      const attemptsLeft = MAX_RETRIES + 1 - attempt;
      if (!isRetryable(err) || attemptsLeft <= 0) {
        throw err;
      }

      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.warn(
        `[fetch-rss] 重試 ${attempt}/${MAX_RETRIES}: ${err.message} — 等待 ${waitMs / 1000}s ...`
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}
