// fetchAiNewsAggregator.mjs — 核心函式：取得 AI News Aggregator 新聞並轉換為統一格式
//
// 輸出欄位：{ url, time, description, from }

import axios from "axios";

const DATA_URL =
  "https://raw.githubusercontent.com/SuYxh/ai-news-aggregator/refs/heads/main/data/latest-24h.json";
const TIMEOUT = 30000;
const TZ_OFFSET = 8; // UTC+8
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(error) {
  const status = error.response?.status;
  if (status) return status >= 500;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNABORTED"].includes(error.code);
}

function toUTC8(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const utc8 = new Date(d.getTime() + TZ_OFFSET * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())} ` +
    `${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`
  );
}

export async function fetchAiNewsAggregator() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await axios.get(DATA_URL, { timeout: TIMEOUT });
      const rawItems = data.items || [];

      return rawItems.map((item) => ({
        url: (item.url || "").trim(),
        time: toUTC8(item.published_at || ""),
        description: (item.title || "").trim(),
        from: (item.source || "").trim(),
      }));
    } catch (err) {
      lastError = err;

      const attemptsLeft = MAX_RETRIES + 1 - attempt;
      if (!isRetryable(err) || attemptsLeft <= 0) {
        throw err;
      }

      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.warn(
        `[fetch-ai-news-aggregator] 重試 ${attempt}/${MAX_RETRIES}: ${err.message} — 等待 ${waitMs / 1000}s ...`
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}
