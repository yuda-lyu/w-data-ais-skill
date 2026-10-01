#!/usr/bin/env node
// fetch_cnyes.mjs — CLI 入口：調用 fetchCnyes 取得鉅亨網新聞並輸出結果
//
// 用法：
//   node fetch_cnyes.mjs [outputPath]
//
// 參數:
//   1. outputPath (選填): 儲存結果的檔案路徑。預設為 cnyes_YYYYMMDD.json。
//
// 輸出（file）：
//   - 成功：{ status: 'success', message: [...] }
//   - 錯誤：{ status: 'error', message: '...' }

import { fetchCnyes } from "./fetchCnyes.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

const args = process.argv.slice(2);

const TODAY = new Date()
  .toLocaleString("en-CA", { timeZone: "Asia/Taipei" })
  .slice(0, 10)
  .replace(/-/g, "");
const outputFile = args[0] || `cnyes_${TODAY}.json`;

function writeOutput(payload) {
  try {
    const dir = dirname(outputFile);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    _guardPath(outputFile);
    writeFileSync(outputFile, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`結果已儲存至: ${outputFile}`);
  } catch (e) {
    console.error(`寫檔失敗：${e.message}`);
  }
}

try {
  const items = await fetchCnyes();
  writeOutput({ status: "success", message: items });
} catch (err) {
  console.error(`錯誤: ${err.message}`);
  if (err.response) console.error("Response data:", err.response.data);
  writeOutput({ status: "error", message: err.message });
  process.exit(1);
}
