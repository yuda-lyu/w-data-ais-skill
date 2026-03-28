#!/usr/bin/env node
// fetch_web.mjs — CLI 入口：調用 fetchWeb 抓取網頁文章內容
//
// 用法：
//   node fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed]

import { fetchWeb } from "./fetchWeb.mjs";
import { writeFileSync } from "node:fs";

// ---------- 解析參數 ----------
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    "用法: node fetch_web.mjs <url> [outputPath] [--method=auto|curl|playwright|playwright-headed]"
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
