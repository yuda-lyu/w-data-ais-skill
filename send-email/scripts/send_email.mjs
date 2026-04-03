#!/usr/bin/env node
// send_email.mjs — CLI wrapper for sendEmail core module
//
// Usage:
//   Mode A (JSON file): node send_email.mjs <payload.json> [outputPath]
//   Mode B (direct args): node send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]
//
// payload.json format:
//   { "gas_url", "token", "to", "from", "subject", "body", "htmlBody"(optional) }
//
// Output: result is always written to a JSON file before exit.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendEmail } from "./sendEmail.mjs";

// ---------- helpers ----------
function writeResult(outputPath, obj) {
  writeFileSync(outputPath, JSON.stringify(obj, null, 2), "utf-8");
  console.log(`Result written to ${outputPath}`);
}

function defaultOutputPath() {
  return `send_email_result_${new Date()
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
        "  Mode A: node send_email.mjs <payload.json> [outputPath]\n" +
        "  Mode B: node send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]"
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
  if (args.length < 6) {
    console.error(
      "Mode B requires at least 6 arguments: <gas_url> <token> <to> <from> <subject> <body> [outputPath]"
    );
    process.exit(1);
  }

  const [gas_url, token, to, from, subject, body, outputPath] = args;
  return {
    payload: { gas_url, token, to, from, subject, body },
    outputPath: outputPath || defaultOutputPath(),
  };
}

// ---------- main ----------
const { payload, outputPath } = parseArgs();
const result = await sendEmail(payload);
writeResult(outputPath, result);
process.exit(result.status === "success" ? 0 : 1);
