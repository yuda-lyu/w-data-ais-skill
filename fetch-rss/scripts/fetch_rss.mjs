#!/usr/bin/env node
// fetch_rss.mjs — CLI 入口：調用 fetchRSS 取得 RSS 並輸出結果
//
// 用法：
//   node fetch_rss.mjs <rssUrl> [outputPath]

import { fetchRSS } from "./fetchRSS.mjs";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("用法: node fetch_rss.mjs <rssUrl> [outputPath]");
  process.exit(1);
}

const [rssUrl, outputPath] = args;

try {
  const items = await fetchRSS(rssUrl);

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
