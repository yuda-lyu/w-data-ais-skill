#!/usr/bin/env node
// send_email.mjs — 透過 GAS Web App API 寄送 Email
//
// 用法：
//   模式 A（JSON 檔案）: node send_email.mjs <payload.json> [outputPath]
//   模式 B（直接參數）:   node send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]
//
// payload.json 格式：
//   { "gas_url", "token", "to", "from", "subject", "body", "htmlBody"(optional) }
//
// 輸出：結果一律寫入檔案（JSON），無論成功或錯誤均寫入後才 exit。

import axios from "axios";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------- 常數 ----------
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms
const TIMEOUT = 30000;       // ms

// ---------- 工具函式 ----------
function ts() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace("T", " ").slice(0, 19);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeResult(outputPath, obj) {
  writeFileSync(outputPath, JSON.stringify(obj, null, 2), "utf-8");
  console.log(`結果已寫入 ${outputPath}`);
}

// ---------- 解析參數 ----------
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "用法:\n" +
        "  模式 A: node send_email.mjs <payload.json> [outputPath]\n" +
        "  模式 B: node send_email.mjs <gas_url> <token> <to> <from> <subject> <body> [outputPath]"
    );
    process.exit(1);
  }

  // 模式 A：第一個參數以 .json 結尾 → 讀取 JSON 檔
  if (args[0].endsWith(".json")) {
    const outputPath = args[1] || `send_email_result_${new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, "")}.json`;
    try {
      const raw = readFileSync(resolve(args[0]), "utf-8");
      const json = JSON.parse(raw);
      return { payload: json, outputPath };
    } catch (e) {
      writeResult(outputPath, { status: "error", message: `JSON 檔案讀取或解析失敗: ${e.message}` });
      process.exit(1);
    }
  }

  // 模式 B：直接傳參數
  if (args.length < 6) {
    console.error("模式 B 至少需要 6 個參數: <gas_url> <token> <to> <from> <subject> <body> [outputPath]");
    process.exit(1);
  }

  const [gas_url, token, to, from, subject, body, outputPath] = args;
  return {
    payload: { gas_url, token, to, from, subject, body },
    outputPath: outputPath || `send_email_result_${new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, "")}.json`,
  };
}

// ---------- 發送 ----------
async function sendEmail(payload) {
  const { gas_url, token, to, from, subject, body, htmlBody } = payload;

  // 驗證必填欄位
  const missing = [];
  if (!gas_url) missing.push("gas_url");
  if (!token) missing.push("token");
  if (!to) missing.push("to");
  if (!from) missing.push("from");
  if (!subject) missing.push("subject");
  if (!body && !htmlBody) missing.push("body 或 htmlBody");
  if (missing.length > 0) {
    return { status: "error", message: `缺少必填欄位: ${missing.join(", ")}` };
  }

  const reqBody = { token, to, from, subject };
  if (body) reqBody.body = body;
  if (htmlBody) reqBody.htmlBody = htmlBody;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await axios.post(gas_url, reqBody, {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeout: TIMEOUT,
        maxRedirects: 5,
      });

      return {
        status: "success",
        sentAt: ts(),
        to,
        from,
        subject,
        gasResponse: data,
      };
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = !status || status >= 500 || status === 429;
      const attemptsLeft = MAX_RETRIES + 1 - attempt;

      if (!isRetryable || attemptsLeft <= 0) {
        return {
          status: "error",
          message: err.response
            ? `HTTP ${status}: ${typeof err.response.data === 'string' ? err.response.data.slice(0, 200) : '伺服器錯誤'}`
            : err.message,
          attempt,
        };
      }

      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.error(`[${ts()}] 第 ${attempt} 次失敗 (${status || err.code})，${waitMs / 1000}s 後重試...`);
      await sleep(waitMs);
    }
  }
}

// ---------- 主程式 ----------
const { payload, outputPath } = parseArgs();
const result = await sendEmail(payload);
writeResult(outputPath, result);
process.exit(result.status === "success" ? 0 : 1);
