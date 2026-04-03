#!/usr/bin/env node
// save_news_to_sheet.mjs — CLI wrapper for saveNewsToSheet core module
//
// Usage:
//   Mode A (JSON file): node save_news_to_sheet.mjs <payload.json> [outputPath]
//   Mode B (direct args): node save_news_to_sheet.mjs <gas_url> <token> <itemsNewJSON> [outputPath]
//
// payload.json format:
//   { "gas_url", "token", "itemsNew": [ { "type", "url", "time"?, "title"?, "description"?, "from"? } ] }
//
// Output: result is always written to a JSON file before exit.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { saveNewsToSheet } from "./saveNewsToSheet.mjs";

// ---------- helpers ----------
function writeResult(outputPath, obj) {
  writeFileSync(outputPath, JSON.stringify(obj, null, 2), "utf-8");
  console.log(`Result written to ${outputPath}`);
}

function defaultOutputPath() {
  return `save_news_result_${new Date()
    .toLocaleString("en-CA", { timeZone: "Asia/Taipei" })
    .slice(0, 10)
    .replace(/-/g, "")}.json`;
}

// ---------- parse args ----------
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage:\n" +
        "  Mode A: node save_news_to_sheet.mjs <payload.json> [outputPath]\n" +
        "  Mode B: node save_news_to_sheet.mjs <gas_url> <token> <itemsNewJSON> [outputPath]"
    );
    process.exit(1);
  }

  // Mode A: first arg ends with .json -> read JSON file
  if (args[0].endsWith(".json")) {
    const outputPath = args[1] || defaultOutputPath();
    try {
      const raw = readFileSync(resolve(args[0]), "utf-8");
      const json = JSON.parse(raw);
      return { payload: json, outputPath };
    } catch (e) {
      writeResult(outputPath, {
        status: "error",
        message: `Failed to read/parse JSON file: ${e.message}`,
      });
      process.exit(1);
    }
  }

  // Mode B: direct arguments
  if (args.length < 3) {
    console.error(
      "Mode B requires at least 3 arguments: <gas_url> <token> <itemsNewJSON> [outputPath]"
    );
    process.exit(1);
  }

  const [gas_url, token, itemsNewJSON, outputPath] = args;
  let itemsNew;
  try {
    itemsNew = JSON.parse(itemsNewJSON);
  } catch (e) {
    console.error(`Failed to parse itemsNewJSON: ${e.message}`);
    process.exit(1);
  }
  return {
    payload: { gas_url, token, itemsNew },
    outputPath: outputPath || defaultOutputPath(),
  };
}

// ---------- main ----------
const { payload, outputPath } = parseArgs();
const result = await saveNewsToSheet(payload);
writeResult(outputPath, result);
process.exit(result.status === "success" ? 0 : 1);
