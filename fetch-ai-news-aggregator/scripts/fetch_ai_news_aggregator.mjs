#!/usr/bin/env node
// fetch_ai_news_aggregator.mjs — CLI 入口：調用 fetchAiNewsAggregator 取得新聞並輸出結果
//
// 用法：
//   node fetch_ai_news_aggregator.mjs [outputPath]

import { fetchAiNewsAggregator } from "./fetchAiNewsAggregator.mjs";
import { writeFileSync } from "node:fs";

const [outputPath] = process.argv.slice(2);

try {
  const items = await fetchAiNewsAggregator();

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
