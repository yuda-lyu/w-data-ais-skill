// fetchWebByCurl.mjs — 用系統 curl 抓網頁原始 HTML（不解析）
//
// 對外匯出 fetchWebByCurl(url, options) → { status, url, html?, ... }
//
// 設計：
//   - 純 curl 抓取，回原始 HTML 字串
//   - HTTP 5xx/429 與 curl 錯誤 → 重試（最多 5 次，含初始 6 次，線性退避 3-15s）
//   - HTTP 4xx（除 429）→ 不重試
//   - URL 經 execFileSync 參數陣列傳遞，無命令注入風險

import { execFileSync } from 'node:child_process';

const MAX_RETRIES = 5;
const INITIAL_WAIT_MS = 3000;
const MAX_WAIT_MS = 15000;
const DEFAULT_TIMEOUT_MS = 15000;
const MIN_HTML_LENGTH = 100;
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_REFERER = 'https://www.google.com/';
const DEFAULT_ACCEPT_LANG = 'en-US,en;q=0.9,zh-TW;q=0.8';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function _waitMs(attempt) {
  return Math.min(INITIAL_WAIT_MS * attempt, MAX_WAIT_MS);
}

function _isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 用 curl 抓取網頁原始 HTML
 * @param {string} url - 目標 URL
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000] - curl --max-time（毫秒）
 * @param {string} [options.userAgent] - 自訂 User-Agent
 * @param {string} [options.referer]   - 自訂 Referer
 * @param {string} [options.acceptLanguage] - 自訂 Accept-Language
 * @returns {Promise<{status, url, html?, htmlLength?, httpCode?, method, fetchedAt, attempts, message?, reason?}>}
 */
export async function fetchWebByCurl(url, options = {}) {
  const fetchedAt = new Date().toISOString();
  if (!url || typeof url !== 'string') {
    return { status: 'error', url: String(url), message: 'url is required (string)', reason: 'invalid-url', method: 'curl', fetchedAt, attempts: 0 };
  }
  if (!_isValidUrl(url)) {
    return { status: 'error', url, message: 'invalid url (must be http/https)', reason: 'invalid-url', method: 'curl', fetchedAt, attempts: 0 };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ua = options.userAgent || DEFAULT_UA;
  const referer = options.referer || DEFAULT_REFERER;
  const acceptLang = options.acceptLanguage || DEFAULT_ACCEPT_LANG;

  let lastReason = '';
  let lastMessage = '';
  let lastHttpCode = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const raw = execFileSync(
        'curl',
        [
          '-s', '-L', '--compressed',
          '--max-time', String(Math.ceil(timeoutMs / 1000)),
          '--write-out', '\n%{http_code}',
          '-H', 'User-Agent: ' + ua,
          '-H', 'Accept: text/html,application/xhtml+xml',
          '-H', 'Accept-Language: ' + acceptLang,
          '-H', 'Referer: ' + referer,
          url,
        ],
        { encoding: 'utf8', timeout: timeoutMs + 5000, maxBuffer: 10 * 1024 * 1024 }
      );

      const lines = raw.trimEnd().split('\n');
      const httpCode = parseInt(lines.pop(), 10) || 0;
      const html = lines.join('\n');
      lastHttpCode = httpCode;

      // 5xx / 429 → 可重試
      if (httpCode >= 500 || httpCode === 429) {
        lastReason = 'http-error';
        lastMessage = `HTTP ${httpCode}`;
        if (attempt <= MAX_RETRIES) {
          const wait = _waitMs(attempt);
          process.stderr.write(`[fetch-web-by-curl] HTTP ${httpCode} ${url}，等 ${wait}ms 後重試 (${attempt}/${MAX_RETRIES})\n`);
          await sleep(wait);
          continue;
        }
        return { status: 'error', url, message: lastMessage, reason: lastReason, httpCode, method: 'curl', fetchedAt, attempts: attempt };
      }

      // 4xx（除 429）→ 不重試
      if (httpCode >= 400) {
        return { status: 'error', url, message: `HTTP ${httpCode}`, reason: 'http-error', httpCode, method: 'curl', fetchedAt, attempts: attempt };
      }

      // 內容過短
      if (!html || html.length < MIN_HTML_LENGTH) {
        return {
          status: 'error', url,
          message: `response too short (${html ? html.length : 0} chars)`,
          reason: 'empty-response', httpCode, method: 'curl', fetchedAt, attempts: attempt,
        };
      }

      // 成功
      return {
        status: 'success', url,
        html, htmlLength: html.length, httpCode,
        method: 'curl', fetchedAt, attempts: attempt,
      };
    } catch (err) {
      lastReason = 'curl-error';
      lastMessage = err.message || String(err);
      if (attempt <= MAX_RETRIES) {
        const wait = _waitMs(attempt);
        process.stderr.write(`[fetch-web-by-curl] curl error: ${lastMessage}，等 ${wait}ms 後重試 (${attempt}/${MAX_RETRIES})\n`);
        await sleep(wait);
        continue;
      }
      return {
        status: 'error', url,
        message: lastMessage, reason: lastReason, httpCode: lastHttpCode || undefined,
        method: 'curl', fetchedAt, attempts: attempt,
      };
    }
  }

  return { status: 'error', url, message: 'max retries exceeded', reason: lastReason || 'curl-error', method: 'curl', fetchedAt, attempts: MAX_RETRIES + 1 };
}

export default fetchWebByCurl;
