#!/usr/bin/env node
// fetch_hacker_news.mjs — CLI 入口：調用 fetchHackerNews 取得最新文章並輸出結果
//
// 用法：
//   node fetch_hacker_news.mjs [outputPath] [limit]

import { fetchHackerNews } from "./fetchHackerNews.mjs";
import { writeFileSync } from "node:fs";

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

const [outputPath, limitArg] = process.argv.slice(2);
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

try {
  const items = await fetchHackerNews(limit);

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
