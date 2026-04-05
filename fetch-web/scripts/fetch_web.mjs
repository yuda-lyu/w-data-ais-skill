#!/usr/bin/env node
// fetch_web.mjs — CLI 入口：調用 fetchWeb 抓取網頁文章內容
//
// 用法：
//   node fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed|playwright-headed-newtab]

import { fetchWeb } from "./fetchWeb.mjs";
import { writeFileSync } from "node:fs";

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

// ---------- 解析參數 ----------
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    "用法: node fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed|playwright-headed-newtab]"
  );
  process.exit(1);
}

let url = "";
let outputPath = "";
let method = "auto";

for (const arg of args) {
  if (arg.startsWith("--method=")) {
    method = arg.slice("--method=".length);
  } else if (!url) {
    url = arg;
  } else if (!outputPath) {
    outputPath = arg;
  }
}

if (!url) {
  console.error("錯誤: 未提供 URL");
  process.exit(1);
}

// ---------- 執行 ----------
const result = await fetchWeb(url, { method });

if (outputPath) {
  _guardPath(outputPath);
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(
    result.status === "success"
      ? "OK (" + result.method + "): " + result.contentLength + " chars -> " + outputPath
      : "FAIL: " + result.message + " -> " + outputPath
  );
} else {
  console.log(JSON.stringify(result, null, 2));
}

process.exit(result.status === "success" ? 0 : 1);
