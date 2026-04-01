#!/usr/bin/env node
// fetch_hacker_news.mjs — CLI 入口：調用 fetchHackerNews 取得最新文章並輸出結果
//
// 用法：
//   node fetch_hacker_news.mjs [outputPath] [limit]

import { fetchHackerNews } from "./fetchHackerNews.mjs";
import { writeFileSync } from "node:fs";

const [outputPath, limitArg] = process.argv.slice(2);
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

try {
  const items = await fetchHackerNews(limit);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(items, null, 2), "utf-8");
    console.log(`共 ${items.length} 筆，已寫入 ${outputPath}`);
  } else {
    console.log(JSON.stringify(items, null, 2));
  }
} catch (err) {
  console.error(`錯誤: ${err.message}`);
  process.exit(1);
}
