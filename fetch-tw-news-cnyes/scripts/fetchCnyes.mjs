// fetchCnyes.mjs — 核心函式：抓取鉅亨網 (Anue) tw_stock 新聞並回傳統一格式陣列
//
// 輸出欄位：{ time, title, link }

import axios from "axios";

// ---------- 常數 ----------
const TIMEOUT = 30000;
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;
const PAGE_DELAY_MS = 500;
const TARGET_TOTAL = 100;
const PAGE_LIMIT = 30;
const DAYS_BACK = 10;

// ---------- 工具函式 ----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(error) {
  const status = error.response?.status;
  if (status) return status >= 500 || status === 403 || status === 429;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNABORTED"].includes(error.code);
}

async function fetchWithRetry(url, params) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      return await axios.get(url, { params, timeout: TIMEOUT });
    } catch (error) {
      lastError = error;

      const attemptsLeft = MAX_RETRIES + 1 - attempt;
      if (!isRetryable(error) || attemptsLeft <= 0) {
        throw error;
      }

      const delay = Math.min(BASE_DELAY_MS * attempt, MAX_DELAY_MS);
      console.warn(
        `[fetch-cnyes] 重試 ${attempt}/${MAX_RETRIES}: ${error.message} — 等待 ${delay / 1000}s ...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function formatTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  // 明確使用台灣時區，避免在 UTC 伺服器環境下時間偏差 8 小時
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const p = Object.fromEntries(
    parts.filter((x) => x.type !== "literal").map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// ---------- 主要函式 ----------
export async function fetchCnyes() {
  const now = Math.floor(Date.now() / 1000);
  const startAt = now - 86400 * DAYS_BACK;
  const url = "https://api.cnyes.com/media/api/v1/newslist/category/tw_stock";
  let allItems = [];
  let page = 1;

  console.log("Starting to fetch Anue (tw_stock) news...");

  while (allItems.length < TARGET_TOTAL) {
    const params = {
      page,
      limit: PAGE_LIMIT,
      isCategoryHeadline: 1,
      startAt,
      endAt: now,
    };

    const response = await fetchWithRetry(url, params);
    const items = response.data?.items?.data || [];

    if (items.length === 0) {
      console.log("No more items found.");
      break;
    }

    allItems = allItems.concat(items);
    console.log(`Page ${page}: Fetched ${items.length} items. Total so far: ${allItems.length}`);
    page++;

    await sleep(PAGE_DELAY_MS);
  }

  const finalItems = allItems.slice(0, TARGET_TOTAL);
  console.log(`Total items collected: ${finalItems.length}`);

  const parsedItems = finalItems.map((item) => ({
    time: formatTime(item.publishAt),
    title: item.title,
    link: `https://news.cnyes.com/news/id/${item.newsId}`,
  }));

  return parsedItems;
}
