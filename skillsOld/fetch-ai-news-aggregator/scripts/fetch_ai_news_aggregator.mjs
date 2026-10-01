#!/usr/bin/env node
// fetch_ai_news_aggregator.mjs — CLI 入口：調用 fetchAiNewsAggregator 取得新聞並輸出結果
//
// 用法：
//   node fetch_ai_news_aggregator.mjs [outputPath]

import { fetchAiNewsAggregator } from "./fetchAiNewsAggregator.mjs";
import { writeFileSync } from "node:fs";

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

const [outputPath] = process.argv.slice(2);

try {
  const items = await fetchAiNewsAggregator();

  if (outputPath) {
    _guardPath(outputPath);
    writeFileSync(outputPath, JSON.stringify(items, null, 2), "utf-8");
    console.log(`共 ${items.length} 筆，已寫入 ${outputPath}`);
  } else {
    console.log(JSON.stringify(items, null, 2));
  }
} catch (err) {
  console.error(`錯誤: ${err.message}`);
  process.exit(1);
}
