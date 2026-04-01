// fetchHackerNews.mjs — 核心函式：取得 Hacker News 最新文章並轉換為統一格式
//
// 輸出欄位：{ url, time, title, description, from }

import axios from "axios";

const API_BASE = "https://hacker-news.firebaseio.com/v0";
const TIMEOUT = 30000;
const TZ_OFFSET = 8; // UTC+8
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms
const DEFAULT_LIMIT = 30;
const CONCURRENCY = 10;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(error) {
  const status = error.response?.status;
  if (status) return status >= 500 || status === 429;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNABORTED"].includes(error.code);
}

function toUTC8(unixSeconds) {
  if (!unixSeconds) return "";
  const d = new Date(unixSeconds * 1000);
  if (isNaN(d.getTime())) return "";
  const utc8 = new Date(d.getTime() + TZ_OFFSET * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())} ` +
    `${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`
  );
}

async function fetchWithRetry(url) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await axios.get(url, { timeout: TIMEOUT });
      return data;
    } catch (err) {
      lastError = err;

      const attemptsLeft = MAX_RETRIES + 1 - attempt;
      if (!isRetryable(err) || attemptsLeft <= 0) {
        throw err;
      }

      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.warn(
        `[fetch-hacker-news] 重試 ${attempt}/${MAX_RETRIES}: ${err.message} — 等待 ${waitMs / 1000}s ...`
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}

export async function fetchHackerNews(limit = DEFAULT_LIMIT) {
  // 1. 取得最新文章 ID 列表
  const ids = await fetchWithRetry(`${API_BASE}/newstories.json`);
  const selected = (ids || []).slice(0, limit);

  // 2. 批次取得文章詳情（控制併發數）
  const items = [];
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const batch = selected.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((id) => fetchWithRetry(`${API_BASE}/item/${id}.json`))
    );
    items.push(...results);
  }

  // 3. 轉換為統一格式
  return items
    .filter((item) => item && item.type === "story")
    .map((item) => ({
      url: (item.url || `https://news.ycombinator.com/item?id=${item.id}`).trim(),
      time: toUTC8(item.time),
      title: (item.title || "").trim(),
      description: "",
      from: "Hacker News",
    }));
}
