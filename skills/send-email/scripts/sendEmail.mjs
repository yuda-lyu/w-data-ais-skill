// sendEmail.mjs — core module: send email via a GAS Web App API
//
// Usage:
//   import { sendEmail } from "./sendEmail.mjs";
//   const result = await sendEmail({ gas_url, token, to, from, subject, body, htmlBody });
//
// Returns: { status: "success"|"error", ... }

import w from "wsemi";

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

// ---------- HTTP（node 內建 fetch，取代 axios） ----------
// 保留 axios.post 的關鍵行為，使既有重試判斷與回傳處理無須改動：
//   1. 自動 JSON.stringify 請求 body；回應自動解析 JSON，非 JSON 時保留原始字串
//      （GAS 部署權限不當時會回 HTTP 200 + HTML 登入頁，必須保留字串以供辨識）
//   2. 非 2xx 拋錯，且錯誤帶 response:{status,data}（與 axios 同形），供 catch 沿用
//   3. timeout 以 AbortController 實作；逾時錯誤標 code='ECONNABORTED'（與 axios 同）
// 差異：axios 的 maxRedirects:5 無對應設定，fetch 走 redirect:'follow'
//      （undici 預設上限 20 次）；GAS 實務上僅 1-2 次重導，不影響。
async function _postJson(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  let text;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: ctrl.signal,
    });
    text = await res.text();
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error(`timeout of ${timeoutMs}ms exceeded`);
      e.code = "ECONNABORTED";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const e = new Error(`Request failed with status code ${res.status}`);
    e.response = { status: res.status, data };
    throw e;
  }
  return { data };
}

// ---------- core function ----------
/**
 * Send an email via GAS Web App.
 *
 * @param {object} payload - { gas_url, token, to, from, subject, body, htmlBody }
 * @returns {Promise<object>} result object with status "success" or "error"
 */
export async function sendEmail(payload) {
  if (!w.iseobj(payload)) return { status: "error", message: "payload required (object)" };

  const { gas_url, token, to, from, subject, body, htmlBody } = payload;

  // validate required fields
  const missing = [];
  if (!w.isestr(gas_url)) missing.push("gas_url");
  if (!w.isestr(token)) missing.push("token");
  if (!w.isestr(to)) missing.push("to");
  if (!w.isestr(from)) missing.push("from");
  if (!w.isestr(subject)) missing.push("subject");
  if (!w.isestr(body) && !w.isestr(htmlBody)) missing.push("body or htmlBody");
  if (missing.length > 0) {
    return { status: "error", message: `Missing required fields: ${missing.join(", ")}` };
  }

  const reqBody = { token, to, from, subject };
  if (body) reqBody.body = body;
  if (htmlBody) reqBody.htmlBody = htmlBody;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await _postJson(gas_url, reqBody, TIMEOUT);

      // GAS Web App 契約：成功必為 { ok: true, ... }；應用層失敗為 { ok: false, ... }。
      // 但部署權限非「任何人」或 gas_url 跑到登入/授權頁時，GAS 會回 HTTP 200 + HTML
      // （JSON 解析失敗 → data 為字串）。故成功必須「明確驗證 ok === true」，
      // 不可用「非 ok:false 即成功」，否則 HTML 200 會被誤判成功（信根本沒寄出卻回報成功）。
      if (data && data.ok === true) {
        return {
          status: "success",
          sentAt: ts(),
          to,
          from,
          subject,
          gasResponse: data,
        };
      }

      // 非成功：區分「應用層 ok:false」與「非預期 body（HTML 登入/授權頁、缺 ok 欄位）」
      const _isObj = data && typeof data === "object";
      return {
        status: "error",
        message: _isObj
          ? (data.message || data.error || "GAS returned ok:false")
          : "GAS 回應非預期格式（可能為 HTTP 200 的 HTML 登入/授權頁）：請確認 gas_url 正確且部署權限為「任何人」",
        reason: _isObj ? "gas-error" : "gas-unexpected-response",
        gasResponse: typeof data === "string" ? data.slice(0, 500) : data,
        sentAt: ts(),
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
