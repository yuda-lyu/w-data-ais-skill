// fetchWebByPlaywrightHeadless.mjs — 用 Playwright headless Chrome 抓網頁原始 HTML
//
// 對外匯出 fetchWebByPlaywrightHeadless(url, options) → { status, url, html?, ... }

const MAX_RETRIES = 5;
const INITIAL_WAIT_MS = 3000;
const MAX_WAIT_MS = 15000;
const DEFAULT_NAV_TIMEOUT_MS = 15000;
const DEFAULT_POST_NAV_WAIT_MS = 3000;
const SHADOW_VISIBLE_THRESHOLD = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitMs = (attempt) => Math.min(INITIAL_WAIT_MS * attempt, MAX_WAIT_MS);

function _isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// 估算可見文字長度（去 script/style/tag）
function estimateVisibleText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 等待 JS 轉址完成（host 變更後再等 networkidle）
async function navigateWithRedirectWait(page, url, navTimeout) {
  const originalHost = new URL(url).hostname;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
  await page
    .waitForURL((u) => !u.href.includes(originalHost), { timeout: 10000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

// 提取 page content；若可見文字過少則穿透 Shadow DOM
async function extractPageContent(page) {
  const html = await page.content();
  const visible = estimateVisibleText(html);
  if (visible.length >= SHADOW_VISIBLE_THRESHOLD) return html;

  // 穿透 Shadow DOM
  const shadow = await page.evaluate(() => {
    function getDeepInnerText(el) {
      if (!el) return '';
      let text = '';
      if (el.shadowRoot) {
        for (const child of el.shadowRoot.children) {
          text += getDeepInnerText(child);
        }
        return text;
      }
      if (el.children && el.children.length > 0) {
        for (const child of el.children) text += getDeepInnerText(child);
        return text;
      }
      return el.innerText || '';
    }
    return getDeepInnerText(document.body || document.documentElement);
  });

  if (!shadow || shadow.length < 50) return html;

  const title = await page.title().catch(() => '');
  const titleEsc = (title || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const bodyEsc = shadow.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  return `<!DOCTYPE html><html><head><title>${titleEsc}</title></head><body><article>${bodyEsc.split(/\n+/).map((p) => `<p>${p}</p>`).join('\n')}</article></body></html>`;
}

/**
 * 用 Playwright headless Chrome 抓取網頁原始 HTML
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.navigationTimeoutMs=15000]
 * @param {number} [options.postNavigationWaitMs=3000]
 * @param {boolean} [options.waitForRedirect=false]
 * @returns {Promise<{status, url, html?, htmlLength?, method, fetchedAt, attempts, message?, reason?}>}
 */
export async function fetchWebByPlaywrightHeadless(url, options = {}) {
  const fetchedAt = new Date().toISOString();
  if (!url || typeof url !== 'string') {
    return { status: 'error', url: String(url), message: 'url is required (string)', reason: 'invalid-url', method: 'playwright-headless', fetchedAt, attempts: 0 };
  }
  if (!_isValidUrl(url)) {
    return { status: 'error', url, message: 'invalid url (must be http/https)', reason: 'invalid-url', method: 'playwright-headless', fetchedAt, attempts: 0 };
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    return {
      status: 'error', url,
      message: 'playwright not installed (npm install playwright)',
      reason: 'missing-deps', method: 'playwright-headless', fetchedAt, attempts: 0,
    };
  }

  const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
  const postWait = options.postNavigationWaitMs ?? DEFAULT_POST_NAV_WAIT_MS;
  const waitForRedirect = !!options.waitForRedirect;

  let lastMessage = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let browser = null;
    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
      const page = await browser.newPage();

      if (waitForRedirect) {
        await navigateWithRedirectWait(page, url, navTimeout);
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        await page.waitForTimeout(postWait);
      }

      const html = await extractPageContent(page);

      return {
        status: 'success', url,
        html, htmlLength: html.length,
        method: 'playwright-headless', fetchedAt, attempts: attempt,
      };
    } catch (err) {
      lastMessage = err.message || String(err);
      if (attempt <= MAX_RETRIES) {
        const w = waitMs(attempt);
        process.stderr.write(`[fetch-web-by-playwright-headless] error: ${lastMessage}，等 ${w}ms 後重試 (${attempt}/${MAX_RETRIES})\n`);
        await sleep(w);
        continue;
      }
      return {
        status: 'error', url,
        message: lastMessage, reason: 'playwright-error',
        method: 'playwright-headless', fetchedAt, attempts: attempt,
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  return { status: 'error', url, message: lastMessage || 'max retries exceeded', reason: 'playwright-error', method: 'playwright-headless', fetchedAt, attempts: MAX_RETRIES + 1 };
}

export default fetchWebByPlaywrightHeadless;
