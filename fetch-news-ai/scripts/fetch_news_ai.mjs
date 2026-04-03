#!/usr/bin/env node
// fetch_news_ai.mjs — CLI 入口：調用 fetchNewsAi 取得多來源新聞並輸出結果
//
// 用法：
//   node fetch_news_ai.mjs [outputPath]

import { fetchNewsAi } from "./fetchNewsAi.mjs";
import { writeFileSync } from "node:fs";

const [outputPath] = process.argv.slice(2);

try {
  const items = await fetchNewsAi();

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(items, null, 2), "utf-8");
    console.log(`共 ${items.length} 筆（今日+昨日），已寫入 ${outputPath}`);
  } else {
    console.log(JSON.stringify(items, null, 2));
  }
} catch (err) {
  console.error(`錯誤: ${err.message}`);
  process.exit(1);
}
