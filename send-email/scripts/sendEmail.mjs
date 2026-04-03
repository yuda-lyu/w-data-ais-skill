// sendEmail.mjs — core module: send email via a GAS Web App API
//
// Usage:
//   import { sendEmail } from "./sendEmail.mjs";
//   const result = await sendEmail({ gas_url, token, to, from, subject, body, htmlBody });
//
// Returns: { status: "success"|"error", ... }

import axios from "axios";

// ---------- constants ----------
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;   // ms
const MAX_WAIT = 15000;      // ms
const TIMEOUT = 30000;       // ms

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
 * Send an email via GAS Web App.
 *
 * @param {object} payload - { gas_url, token, to, from, subject, body, htmlBody }
 * @returns {Promise<object>} result object with status "success" or "error"
 */
export async function sendEmail(payload) {
  const { gas_url, token, to, from, subject, body, htmlBody } = payload;

  // validate required fields
  const missing = [];
  if (!gas_url) missing.push("gas_url");
  if (!token) missing.push("token");
  if (!to) missing.push("to");
  if (!from) missing.push("from");
  if (!subject) missing.push("subject");
  if (!body && !htmlBody) missing.push("body or htmlBody");
  if (missing.length > 0) {
    return { status: "error", message: `Missing required fields: ${missing.join(", ")}` };
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
