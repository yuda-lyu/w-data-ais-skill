// fetchWebByPlaywrightHead.mjs — 用 Playwright headed Chrome 抓網頁原始 HTML
//
// 對外匯出 fetchWebByPlaywrightHead(url, options) → { status, url, html?, verificationClicked?, ... }
//
// 特色：
//   - 有頭模式（實體視窗）+ 反自動化偽裝（隱藏 webdriver、disable-blink-features）
//   - 自動偵測並點擊 Cloudflare Turnstile / hCaptcha 驗證 checkbox（模擬人類滑鼠軌跡）
//   - Shadow DOM 穿透
//   - 重試與線性退避（最多 5 次，含初始 6 次）

const MAX_RETRIES = 5;
const INITIAL_WAIT_MS = 3000;
const MAX_WAIT_MS = 15000;
const DEFAULT_NAV_TIMEOUT_MS = 15000;
const DEFAULT_POST_NAV_WAIT_MS = 5000;
const SHADOW_VISIBLE_THRESHOLD = 200;

const VERIFY_SELECTORS = [
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="/cdn-cgi/challenge-platform"]',
  '.cf-turnstile iframe',
  'iframe[src*="hcaptcha.com"]',
];

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

// 模擬人類滑鼠軌跡：隨機起點 → 中途點 → 目標 + 隨機抖動／停頓
async function humanClick(page, x, y) {
  const startX = 100 + Math.random() * 200;
  const startY = 500 + Math.random() * 100;
  await page.mouse.move(startX, startY);

  const steps = 2 + Math.floor(Math.random() * 2);
  for (let i = 1; i <= steps; i++) {
    const ratio = i / (steps + 1);
    const mx = startX + (x - startX) * ratio + (Math.random() - 0.5) * 30;
    const my = startY + (y - startY) * ratio + (Math.random() - 0.5) * 20;
    await page.mouse.move(mx, my);
    await page.waitForTimeout(80 + Math.random() * 120);
  }
  await page.mouse.move(x, y);
  await page.waitForTimeout(50 + Math.random() * 100);
  await page.mouse.click(x, y);
}

// 偵測並點擊驗證 checkbox（Cloudflare Turnstile、hCaptcha 等）
async function tryClickVerification(page) {
  // 模式 A：DOM 中可見的 iframe（傳統嵌入）
  for (const sel of VERIFY_SELECTORS) {
    const el = page.locator(sel).first();
    const count = await el.count().catch(() => 0);
    if (count > 0) {
      const box = await el.boundingBox().catch(() => null);
      if (box) {
        await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
        process.stderr.write(`[fetch-web-by-playwright-head] clicked verification iframe (${sel})\n`);
        await page.waitForTimeout(5000);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        return true;
      }
    }
  }

  // 模式 B：Cloudflare managed challenge 整頁（iframe 不在 DOM，需透過 page.frames）
  const cfFrame = page.frames().find((f) => f.url().includes('challenges.cloudflare.com'));
  if (cfFrame) {
    const container = page.locator('#turnstile-container, #turnstileWrapper, .cf-turnstile').first();
    const box = await container.boundingBox().catch(() => null);
    if (box) {
      await humanClick(page, box.x + 30, box.y + box.height / 2);
    } else {
      const vp = page.viewportSize() || { width: 1280, height: 720 };
      await humanClick(page, vp.width * 0.39, vp.height * 0.57);
    }
    process.stderr.write('[fetch-web-by-playwright-head] clicked Cloudflare managed challenge checkbox\n');
    await page.waitForTimeout(8000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    return true;
  }

  return false;
}

async function navigateWithRedirectWait(page, url, navTimeout) {
  const originalHost = new URL(url).hostname;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
  await page.waitForURL((u) => !u.href.includes(originalHost), { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function extractPageContent(page) {
  const html = await page.content();
  const visible = estimateVisibleText(html);
  if (visible.length >= SHADOW_VISIBLE_THRESHOLD) return html;

  const shadow = await page.evaluate(() => {
    function getDeepInnerText(el) {
      if (!el) return '';
      let text = '';
      if (el.shadowRoot) {
        for (const child of el.shadowRoot.children) text += getDeepInnerText(child);
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
 * 用 Playwright headed Chrome 抓取網頁原始 HTML（含驗證 checkbox 自動點擊）
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.navigationTimeoutMs=15000]
 * @param {number} [options.postNavigationWaitMs=5000]
 * @param {boolean} [options.waitForRedirect=false]
 * @param {boolean} [options.skipVerificationClick=false]
 * @returns {Promise<{status, url, html?, htmlLength?, verificationClicked?, method, fetchedAt, attempts, message?, reason?}>}
 */
export async function fetchWebByPlaywrightHead(url, options = {}) {
  const fetchedAt = new Date().toISOString();
  if (!url || typeof url !== 'string') {
    return { status: 'error', url: String(url), message: 'url is required (string)', reason: 'invalid-url', method: 'playwright-headed', fetchedAt, attempts: 0 };
  }
  if (!_isValidUrl(url)) {
    return { status: 'error', url, message: 'invalid url (must be http/https)', reason: 'invalid-url', method: 'playwright-headed', fetchedAt, attempts: 0 };
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    return {
      status: 'error', url,
      message: 'playwright not installed (npm install playwright)',
      reason: 'missing-deps', method: 'playwright-headed', fetchedAt, attempts: 0,
    };
  }

  const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
  const postWait = options.postNavigationWaitMs ?? DEFAULT_POST_NAV_WAIT_MS;
  const waitForRedirect = !!options.waitForRedirect;
  const skipVerify = !!options.skipVerificationClick;

  let lastMessage = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let browser = null;
    try {
      browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = await browser.newPage();

      // 隱藏 webdriver 標記
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      if (waitForRedirect) {
        await navigateWithRedirectWait(page, url, navTimeout);
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        await page.waitForTimeout(postWait);
      }

      let verificationClicked = false;
      if (!skipVerify) {
        verificationClicked = await tryClickVerification(page);
      }

      const html = await extractPageContent(page);

      return {
        status: 'success', url,
        html, htmlLength: html.length,
        verificationClicked,
        method: 'playwright-headed', fetchedAt, attempts: attempt,
      };
    } catch (err) {
      lastMessage = err.message || String(err);
      if (attempt <= MAX_RETRIES) {
        const w = waitMs(attempt);
        process.stderr.write(`[fetch-web-by-playwright-head] error: ${lastMessage}，等 ${w}ms 後重試 (${attempt}/${MAX_RETRIES})\n`);
        await sleep(w);
        continue;
      }
      return {
        status: 'error', url,
        message: lastMessage, reason: 'playwright-error',
        method: 'playwright-headed', fetchedAt, attempts: attempt,
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  return { status: 'error', url, message: lastMessage || 'max retries exceeded', reason: 'playwright-error', method: 'playwright-headed', fetchedAt, attempts: MAX_RETRIES + 1 };
}

export default fetchWebByPlaywrightHead;
