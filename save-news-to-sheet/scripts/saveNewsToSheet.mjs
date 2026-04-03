// saveNewsToSheet.mjs — core module: POST news items to a GAS Web App for Google Sheet storage
//
// Usage:
//   import { saveNewsToSheet } from "./saveNewsToSheet.mjs";
//   const result = await saveNewsToSheet({ gas_url, token, itemsNew });
//
// Returns: { status: "success"|"error", ... }

import axios from "axios";

// ---------- constants ----------
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms
const TIMEOUT = 15 * 60 * 1000; // ms

// ---------- helpers ----------
function ts() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
    .replace("T", " ")
    .slice(0, 19);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- core function ----------
/**
 * Save news items to Google Sheet via GAS Web App.
 *
 * @param {object} payload - { gas_url, token, itemsNew }
 * @returns {Promise<object>} result object with status "success" or "error"
 */
export async function saveNewsToSheet(payload) {
  const { gas_url, token, itemsNew } = payload;

  // validate required fields
  const missing = [];
  if (!gas_url) missing.push("gas_url");
  if (!token) missing.push("token");
  if (!Array.isArray(itemsNew) || itemsNew.length === 0)
    missing.push("itemsNew (needs to be a non-empty array)");
  if (missing.length > 0) {
    return { status: "error", message: `Missing required fields: ${missing.join(", ")}` };
  }

  // validate each item has url
  const invalid = itemsNew.filter((item) => !item.url);
  if (invalid.length > 0) {
    return {
      status: "error",
      message: `${invalid.length} item(s) missing the url field`,
    };
  }

  const reqBody = { token, itemsNew };

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await axios.post(gas_url, reqBody, {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeout: TIMEOUT,
        maxRedirects: 5,
      });

      return {
        status: "success",
        savedAt: ts(),
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
            ? `HTTP ${status}: ${typeof err.response.data === "string" ? err.response.data.slice(0, 200) : "server error"}`
            : err.message,
          attempt,
        };
      }

      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.error(
        `[${ts()}] attempt ${attempt} failed (${status || err.code}), retrying in ${waitMs / 1000}s...`
      );
      await sleep(waitMs);
    }
  }
}
