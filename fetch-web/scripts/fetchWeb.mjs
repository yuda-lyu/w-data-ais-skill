// fetchWeb.mjs — 核心函式：抓取網頁文章內容，支援四種方法自動階梯升級
//
// 方法 ①: curl（預設，繞過 TLS 指紋偵測）
// 方法 ②: Playwright 無頭（SPA 動態渲染頁面）
// 方法 ③: Playwright 有頭（DataDome 等進階反自動化偵測）
// 方法 ④: Camofox 反偵測瀏覽器（Cloudflare Turnstile 等進階驗證）
//
// 流程：fetch → inspectHtml（原始內容檢測）→ Readability 解析（可選）
// options.parse = true（預設）→ { status, url, title, content, contentLength, method, fetchedAt, attempts }
// options.parse = false        → { status, url, html, method, fetchedAt, attempts }（原始 HTML，由外部自行解析）
// 方法④ 額外回傳 snapshot 欄位（Camofox accessibility snapshot 原始結構化資料）

import { execFileSync, spawn } from "node:child_process";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------- 常數 ----------
const CURL_MAX_TIME = 15;        // curl --max-time（秒）
const EXEC_TIMEOUT = 20000;      // execFileSync timeout（ms）
const MIN_CONTENT = 50;          // 最低有效字數（Readability 解析後）
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;       // ms
const MAX_WAIT = 15000;          // ms
// (NEWTAB_WAIT 已移除，方法④ 改用 Camofox，相關常數在 tryCamofox 區塊)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// 方法名稱常數
const METHOD_CURL = "curl";
const METHOD_PW_HEADLESS = "playwright-headless";
const METHOD_PW_HEADED = "playwright-headed";
const METHOD_CAMOFOX = "camofox";

// 檢測結果類型常數
const DETECT_PASS = "pass";
const DETECT_CAPTCHA = "captcha";
const DETECT_VERIFY = "verify";
const DETECT_REDIRECT = "redirect";
const DETECT_EMPTY = "empty";

// ---------- 工具函式 ----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ts() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
    .replace("T", " ")
    .slice(0, 19);
}

// 重試退避：若仍有重試機會則等待並回傳 true，否則回傳 false
async function canRetry(label, attempt, reason) {
  if (attempt > MAX_RETRIES) return false;
  const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
  console.warn("[fetch-web] " + label + " retry " + attempt + "/" + MAX_RETRIES + ": " + reason + " — wait " + (waitMs / 1000) + "s ...");
  await sleep(waitMs);
  return true;
}

// ---------- URL 轉址判識 ----------
const MAX_REDIRECT_DEPTH = 3;

// 判識 C：已知需要 Playwright 有頭模式的網站（headless 無法正確渲染內容）
const HEADED_REQUIRED_PATTERNS = [
  /^https?:\/\/open\.rankfor\.ai\//,
  /^https?:\/\/brainbaking\.com\//,
];

function requiresHeaded(url) {
  return HEADED_REQUIRED_PATTERNS.some((p) => p.test(url));
}

// 判識 D：已知需要 Camofox 反偵測瀏覽器的網站（方法①②③ 皆無法通過驗證，直接跳方法④）
const CAMOFOX_REQUIRED_PATTERNS = [
  /^https?:\/\/mp\.weixin\.qq\.com\//,
  /^https?:\/\/viitorcloud\.com\//,
];

function requiresCamofox(url) {
  return CAMOFOX_REQUIRED_PATTERNS.some((p) => p.test(url));
}

// 判識 A：已知需要 JS 執行的轉址服務（curl 永遠只拿到包裝頁）
const JS_REDIRECT_PATTERNS = [
  /^https?:\/\/news\.google\.com\/rss\/articles\//,
  /^https?:\/\/news\.google\.com\/articles\//,
  /^https?:\/\/apple\.news\//,
  /^https?:\/\/www\.msn\.com\/.*\/ar-/,
];

function requiresJsRedirect(url) {
  return JS_REDIRECT_PATTERNS.some((p) => p.test(url));
}

// 判識 B：query 參數中含真實 URL 的轉址服務
const URL_PARAM_PATTERNS = [
  { match: /l\.facebook\.com\/l\.php/, param: "u" },
  { match: /lm\.facebook\.com\/l\.php/, param: "u" },
  { match: /linkedin\.com\/redir\/redirect/, param: "url" },
  { match: /youtube\.com\/redirect/, param: "q" },
];

function extractRedirectTarget(url) {
  for (const { match, param } of URL_PARAM_PATTERNS) {
    if (match.test(url)) {
      const u = new URL(url);
      const target = u.searchParams.get(param);
      if (target) return decodeURIComponent(target);
    }
  }
  return null;
}

// ---------- 原始內容檢測中間層 ----------
// 純粹基於原始 HTML 結構判斷頁面是否為有效內容，不依賴 Readability
// 回傳 { pass: boolean, type: string, message: string }

function estimateVisibleText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectHtml(html) {
  const lower = html.toLowerCase();
  const title = html.match(/<title>([^<]*)/i)?.[1]?.trim() || "";
  const titleLower = title.toLowerCase();

  // --- CAPTCHA / anti-bot challenge ---
  // DataDome：真正被 CAPTCHA 擋住時頁面會載入 captcha-delivery.com 且無 <article>；
  // 許多正常網站（如 WSJ）會在文章頁載入 datadome SDK JS，不代表被擋
  if (lower.includes("captcha-delivery.com") && !lower.includes("<article"))
    return { pass: false, type: DETECT_CAPTCHA, message: "DataDome CAPTCHA" };
  if (lower.includes("perimeterx"))
    return { pass: false, type: DETECT_CAPTCHA, message: "PerimeterX challenge" };
  if (lower.includes("cf-challenge-running"))
    return { pass: false, type: DETECT_CAPTCHA, message: "Cloudflare challenge" };
  if (titleLower === "just a moment" || titleLower === "just a quick check")
    return { pass: false, type: DETECT_CAPTCHA, message: "Cloudflare/anti-bot challenge" };
  if (lower.includes("captcha") && lower.includes("challenge") && !lower.includes("<article") && html.length < 50000)
    return { pass: false, type: DETECT_CAPTCHA, message: "generic CAPTCHA" };
  if (titleLower.includes("are you a robot"))
    return { pass: false, type: DETECT_CAPTCHA, message: "robot challenge: \"" + title + "\"" };
  if (lower.includes("cf-turnstile") && !lower.includes("<article"))
    return { pass: false, type: DETECT_CAPTCHA, message: "Cloudflare Turnstile" };
  if (lower.includes("verify you are human"))
    return { pass: false, type: DETECT_CAPTCHA, message: "human verification page" };
  if (lower.includes("blocked by our server") || lower.includes("request has been blocked"))
    return { pass: false, type: DETECT_CAPTCHA, message: "server security block" };
  if (titleLower === "access denied" || (lower.includes("access denied") && lower.includes("edgesuite.net")))
    return { pass: false, type: DETECT_CAPTCHA, message: "access denied (WAF/CDN block)" };
  if (lower.includes("something went wrong") && (lower.includes("x.com") || lower.includes("twitter.com")) && !lower.includes("<article"))
    return { pass: false, type: DETECT_CAPTCHA, message: "X/Twitter error page" };

  // --- 驗證頁面 ---
  // 微信驗證頁會載入 secitptpage/ 路徑的 CSS/JS，真正的文章頁不會
  if (lower.includes("secitptpage") && lower.includes("wx.qq.com"))
    return { pass: false, type: DETECT_VERIFY, message: "WeChat verification page" };

  // --- 轉址包裝頁 ---
  // meta refresh：排除 url='' / url="" / url=\'\' 等空值（部分網站如 CoreWeave 含空 meta refresh，非真正轉址）
  const _metaRefreshUrl = (html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=["']?([^"'\s>]*)["']?/i)?.[1] || "").replace(/[\\'"\s]/g, "");
  if (_metaRefreshUrl.length > 0)
    return { pass: false, type: DETECT_REDIRECT, message: "meta refresh redirect" };
  if (lower.includes("c-wiz") && lower.includes("news.google.com"))
    return { pass: false, type: DETECT_REDIRECT, message: "Google News wrapper" };
  const WRAPPER_TITLES = ["google news", "redirecting", "loading", "msn"];
  if (WRAPPER_TITLES.some((t) => titleLower.includes(t)))
    return { pass: false, type: DETECT_REDIRECT, message: "platform wrapper: \"" + title + "\"" };

  // --- 空內容 / 無實質可見文字 ---
  const visible = estimateVisibleText(html);
  if (html.length > 5000 && visible.length < 200)
    return { pass: false, type: DETECT_EMPTY, message: "minimal visible text (" + visible.length + " chars in " + html.length + " bytes HTML)" };

  return { pass: true, type: DETECT_PASS, message: "ok" };
}

// ---------- 網站專用解析器白名單 ----------
// Readability 是通用解析器，對某些網站結構無法正確提取內容。
// 白名單內的網域會使用指定的解析器取代 Readability。
// 每個解析器簽名：(html, url) => { success, title, content, contentLength } | { success: false, reason, message }

const CUSTOM_PARSERS = [
  { pattern: /^https?:\/\/(?:www\.)?gelonghui\.com\//, parse: parseGelonghui },
];

function findCustomParser(url) {
  for (const entry of CUSTOM_PARSERS) {
    if (entry.pattern.test(url)) return entry.parse;
  }
  return null;
}

// --- 格隆匯（快訊 / 文章）：從 Nuxt SSR state 提取結構化資料 ---
function parseGelonghui(html, url) {
  // 格隆匯使用 Nuxt.js，內容藏在 window.__NUXT__ 中。
  // 不同頁面類型使用不同的物件名稱：
  //   /live/ 快訊頁 → dtbDetail.content（純文字）
  //   /p/    文章頁 → articleDetail.content（含 HTML 標籤）
  // 物件內含巢狀 {}（count, statistic 等），不能用 [^}] 匹配。

  // 依序嘗試各欄位名稱
  const fields = ["dtbDetail", "articleDetail"];
  for (const field of fields) {
    const re = new RegExp(field + ":\\{[\\s\\S]*?(?:,|\\{)content:\"((?:[^\"\\\\]|\\\\.)*)\"");
    const match = html.match(re);
    if (!match) continue;

    const raw = match[1]
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");

    // 移除 HTML 標籤取純文字
    const content = raw.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    const title = extractHtmlTitle(html);

    if (content.length < MIN_CONTENT) {
      return { success: false, reason: "empty-content", message: "content too short (" + content.length + " chars)" };
    }
    return { success: true, title, content, contentLength: content.length };
  }

  // __NUXT__ 中找不到已知結構 → 回報失敗
  return { success: false, reason: "custom-parser-miss", message: "gelonghui: no content found in __NUXT__ state" };
}

function extractHtmlTitle(html) {
  return html.match(/<title>([^<]*)/i)?.[1]?.replace(/-[^-]*$/, "")?.trim() || "";
}

// ---------- Readability 解析 ----------
function parseArticle(html, url) {
  // 優先使用白名單專用解析器
  const customParser = findCustomParser(url);
  if (customParser) {
    const result = customParser(html, url);
    // 專用解析器成功 → 直接回傳；失敗 → 不 fallback Readability（該網站結構不適用）
    return result;
  }

  const doc = new JSDOM(html, { url });
  const article = new Readability(doc.window.document).parse();
  const content = article?.textContent?.trim() || "";
  const title = article?.title?.trim() || "";

  if (content.length < MIN_CONTENT) {
    return {
      success: false,
      reason: "empty-content",
      message: "content too short (" + content.length + " chars)",
    };
  }

  return { success: true, title, content, contentLength: content.length };
}

// ---------- Playwright 轉址等待 ----------
async function navigateWithRedirectWait(page, url) {
  const originalHost = new URL(url).hostname;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForURL(
    (u) => !u.href.includes(originalHost),
    { timeout: 10000 }
  ).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

// ---------- Playwright 共用重試 wrapper ----------
// 統一管理 retry loop + backoff + browser cleanup
async function withBrowserRetry(method, attemptFn) {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const ctx = { browser: null };
    try {
      const html = await attemptFn(ctx);
      return { success: true, html, method };
    } catch (err) {
      if (!(await canRetry(method, attempt, err.message))) {
        return { success: false, reason: "playwright-error", message: err.message };
      }
    } finally {
      if (ctx.browser) await ctx.browser.close().catch(() => {});
    }
  }
  return { success: false, reason: "playwright-error", message: "max retries exceeded" };
}

// ---------- 人機驗證 checkbox 點擊 ----------
// 偵測 Cloudflare Turnstile 等驗證 iframe / checkbox，自動點擊
// 僅在有頭模式（方法③④）中呼叫
const VERIFY_SELECTORS = [
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="/cdn-cgi/challenge-platform"]',
  '.cf-turnstile iframe',
  'iframe[src*="hcaptcha.com"]',
];

async function tryClickVerification(page) {
  // 方式 A：DOM 中可見的 iframe（傳統 Turnstile 嵌入）
  for (const sel of VERIFY_SELECTORS) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0) > 0) {
      const box = await el.boundingBox().catch(() => null);
      if (box) {
        await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
        console.log("[fetch-web] clicked verification iframe (" + sel + ")");
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        return true;
      }
    }
  }

  // 方式 B：Cloudflare managed challenge 整頁驗證（iframe 不在 DOM 中，需透過 page.frames() 偵測）
  const cfFrame = page.frames().find(f => f.url().includes("challenges.cloudflare.com"));
  if (cfFrame) {
    // 優先用 #turnstile-container 定位 checkbox 位置
    const container = page.locator("#turnstile-container, #turnstileWrapper, .cf-turnstile").first();
    const box = await container.boundingBox().catch(() => null);
    if (box) {
      // checkbox 在容器左側，約 x+30, y+中心
      await humanClick(page, box.x + 30, box.y + box.height / 2);
    } else {
      // fallback：challenge 頁面佈局固定，checkbox 通常在頁面中央偏左
      const vp = page.viewportSize() || { width: 1280, height: 720 };
      await humanClick(page, vp.width * 0.39, vp.height * 0.57);
    }
    console.log("[fetch-web] clicked Cloudflare managed challenge checkbox");
    await page.waitForTimeout(8000);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    return true;
  }

  return false;
}

/** 模擬人類滑鼠軌跡：從隨機起點經數個中途點移到目標再點擊 */
async function humanClick(page, x, y) {
  const startX = 100 + Math.random() * 200;
  const startY = 500 + Math.random() * 100;
  await page.mouse.move(startX, startY);
  // 2~3 個中途點
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

// ---------- 方法①: curl ----------
// 純 fetch — 僅處理 HTTP 層級錯誤與重試，不做內容判斷
async function tryCurl(url) {
  let html = "";
  let httpCode = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const raw = execFileSync(
        "curl",
        [
          "-s", "-L", "--compressed",
          "--max-time", String(CURL_MAX_TIME),
          "--write-out", "\n%{http_code}",
          "-H", "User-Agent: " + UA,
          "-H", "Accept: text/html,application/xhtml+xml",
          "-H", "Accept-Language: en-US,en;q=0.9,zh-TW;q=0.8",
          "-H", "Referer: https://www.google.com/",
          url,
        ],
        { encoding: "utf8", timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
      );

      const lines = raw.trimEnd().split("\n");
      httpCode = parseInt(lines.pop(), 10) || 0;
      html = lines.join("\n");

      if (httpCode >= 500 || httpCode === 429) {
        if (await canRetry("curl", attempt, "HTTP " + httpCode)) continue;
        return { success: false, reason: "http-error", message: "HTTP " + httpCode };
      }

      if (httpCode >= 400) {
        return { success: false, reason: "http-error", message: "HTTP " + httpCode };
      }

      if (!html || html.length < 100) {
        return { success: false, reason: "empty-response", message: "response too short (" + (html ? html.length : 0) + " chars)" };
      }

      break;
    } catch (err) {
      if (!(await canRetry("curl", attempt, err.message))) {
        return { success: false, reason: "curl-error", message: err.message };
      }
    }
  }

  return { success: true, html, method: METHOD_CURL };
}

// ---------- Shadow DOM 穿透提取 ----------
// SPA 網站（如 MSN）使用 Web Components + Shadow DOM 渲染文章內容，
// page.content() 只回傳 light DOM，Readability 無法解析。
// 此函式在可見文字不足時，透過 page.evaluate 穿透 Shadow DOM 取得文字，
// 再包裝成簡易 HTML 供 Readability 解析。
const SHADOW_VISIBLE_THRESHOLD = 200;

async function extractPageContent(page) {
  const html = await page.content();

  // 快速檢查：regular HTML 可見文字足夠就直接用
  const visible = estimateVisibleText(html);
  if (visible.length >= SHADOW_VISIBLE_THRESHOLD) return html;

  // 穿透 Shadow DOM 提取文字
  const shadow = await page.evaluate(() => {
    function getDeepInnerText(el) {
      if (!el) return "";
      let text = "";
      if (el.shadowRoot) {
        for (const child of el.shadowRoot.children) {
          text += getDeepInnerText(child);
        }
        return text;
      }
      for (const child of el.children) {
        if (child.shadowRoot) {
          text += getDeepInnerText(child);
        }
      }
      if (text.length > 0) return text;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style") return "";
      return el.innerText || "";
    }

    const containers = ["cp-article", "article", "[role=\"article\"]", "main"];
    for (const sel of containers) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const t = getDeepInnerText(el);
          if (t.length > 200) return { title: document.title || "", text: t };
        }
      } catch (_) { /* skip */ }
    }
    // fallback：整個 body
    const all = getDeepInnerText(document.body);
    if (all.length > 200) return { title: document.title || "", text: all };
    return null;
  }).catch(() => null);

  if (!shadow || !shadow.text) return html;

  console.log("[fetch-web] Shadow DOM extraction: " + shadow.text.length + " chars from web components");

  // 包裝成簡易 HTML 供 Readability 解析
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const titleEsc = esc(shadow.title);
  const paragraphs = shadow.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => "<p>" + esc(p) + "</p>")
    .join("\n");

  return "<!DOCTYPE html><html><head><title>" + titleEsc + "</title></head>"
    + "<body><article><h1>" + titleEsc + "</h1>\n" + paragraphs + "</article></body></html>";
}

// ---------- 方法②③: Playwright ----------
// 純 fetch — 僅處理瀏覽器層級錯誤與重試，不做內容判斷
async function tryPlaywright(url, headless, { redirect = false } = {}) {
  const method = headless ? METHOD_PW_HEADLESS : METHOD_PW_HEADED;
  return withBrowserRetry(method, async (ctx) => {
    const launchOpts = { headless, channel: "chrome" };
    if (!headless) {
      launchOpts.args = ["--disable-blink-features=AutomationControlled"];
    }

    ctx.browser = await chromium.launch(launchOpts);
    const page = await ctx.browser.newPage();

    if (!headless) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });
    }

    if (redirect) {
      await navigateWithRedirectWait(page, url);
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(headless ? 3000 : 5000);
    }

    // 有頭模式：嘗試點擊人機驗證 checkbox（Cloudflare Turnstile 等）
    if (!headless) {
      await tryClickVerification(page);
    }

    return extractPageContent(page);
  });
}

// ---------- 方法④: Camofox 反偵測瀏覽器 ----------
// 使用 Camoufox（修改版 Firefox）繞過 Cloudflare Turnstile 等進階反自動化偵測
// 流程：啟動 Camofox server → 建立 tab → 取得 accessibility snapshot → 轉換為 HTML → 關閉
const CAMOFOX_PORT = 19377;
const CAMOFOX_MAX_WAIT = 30000;     // server 啟動最長等待（ms）
const CAMOFOX_SNAPSHOT_RETRIES = 3; // snapshot 重試次數（部分網站需等驗證通過）
const CAMOFOX_SNAPSHOT_WAIT = 5000; // 每次重試等待（ms）

function _findCamofoxDir() {
  // 從此腳本位置向上找 node_modules/@askjo/camofox-browser
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "../../node_modules/@askjo/camofox-browser"),
    resolve(thisDir, "../node_modules/@askjo/camofox-browser"),
  ];
  for (const p of candidates) {
    try { execFileSync("node", ["-e", ""], { cwd: p, timeout: 3000 }); return p; } catch (_) {}
  }
  return null;
}

async function _waitCamofoxReady(base, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(base + "/tabs");
      if (r.ok) return true;
    } catch (_) {}
    await sleep(300);
  }
  return false;
}

// accessibility snapshot → HTML 轉換
// 完整保留結構化資料中的語意元素，供 Readability 解析
function snapshotToHtml(snapshot, pageTitle) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = snapshot.split("\n");
  const htmlParts = [];

  for (const line of lines) {
    const trimmed = line.replace(/^ *- */, "").trim();
    if (!trimmed) continue;

    // heading "..." [level=N]
    const headingMatch = trimmed.match(/^(?:')?heading\s+"(.+?)"\s*\[level=(\d)\]/);
    if (headingMatch) {
      const lvl = headingMatch[2];
      htmlParts.push("<h" + lvl + ">" + esc(headingMatch[1]) + "</h" + lvl + ">");
      continue;
    }

    // link "text" [eN]: 或 link "text":
    const linkMatch = trimmed.match(/^(?:')?link\s+"(.+?)"\s*(?:\[e\d+\])?\s*:/);
    if (linkMatch) { continue; } // link 行本身只是容器，URL 和文字在子行

    // /url: ...
    const urlMatch = trimmed.match(/^\/url:\s+(.+)/);
    if (urlMatch) { continue; } // URL 行由 link 上下文處理，不獨立輸出

    // img "alt"
    const imgMatch = trimmed.match(/^img\s+"(.+?)"/);
    if (imgMatch) {
      htmlParts.push('<img alt="' + esc(imgMatch[1]) + '">');
      continue;
    }

    // paragraph / paragraph: text
    const paraMatch = trimmed.match(/^paragraph(?::\s*(.+))?$/);
    if (paraMatch) {
      if (paraMatch[1]) htmlParts.push("<p>" + esc(paraMatch[1]) + "</p>");
      continue;
    }

    // listitem / listitem: text
    const liMatch = trimmed.match(/^listitem(?::\s*(.+))?$/);
    if (liMatch) {
      if (liMatch[1]) htmlParts.push("<li>" + esc(liMatch[1]) + "</li>");
      continue;
    }

    // strong: text
    const strongMatch = trimmed.match(/^strong:\s*"?(.+?)"?\s*$/);
    if (strongMatch) {
      htmlParts.push("<strong>" + esc(strongMatch[1]) + "</strong>");
      continue;
    }

    // emphasis: text
    const emMatch = trimmed.match(/^emphasis:\s*"?(.+?)"?\s*$/);
    if (emMatch) {
      htmlParts.push("<em>" + esc(emMatch[1]) + "</em>");
      continue;
    }

    // text: "..."
    const textMatch = trimmed.match(/^text:\s*"?(.+?)"?\s*$/);
    if (textMatch) {
      htmlParts.push("<span>" + esc(textMatch[1]) + "</span>");
      continue;
    }

    // option "..." (微信等平台的附註文字)
    const optionMatch = trimmed.match(/^(?:')?option\s+"(.+?)"/);
    if (optionMatch) {
      htmlParts.push("<p>" + esc(optionMatch[1]) + "</p>");
      continue;
    }

    // button "text"
    // banner / navigation / main / contentinfo / complementary — 結構標記，跳過
    // list — 容器標記，跳過
    if (/^(button|banner|navigation|main|contentinfo|complementary|list)\b/.test(trimmed)) continue;

    // 純文字行（不屬於任何已知標記）
    const plainText = trimmed.replace(/\[e\d+\]/g, "").replace(/^['"]|['"]$/g, "").trim();
    if (plainText.length > 0 && !/^(link|img|heading|paragraph|listitem|strong|emphasis|text|option|button|banner|navigation|main|contentinfo|complementary|list)\b/.test(plainText)) {
      htmlParts.push("<p>" + esc(plainText) + "</p>");
    }
  }

  const titleEsc = esc(pageTitle || "");
  return "<!DOCTYPE html><html><head><title>" + titleEsc + "</title></head>"
    + "<body><article><h1>" + titleEsc + "</h1>\n"
    + htmlParts.join("\n")
    + "</article></body></html>";
}

async function tryCamofox(url) {
  const camofoxDir = _findCamofoxDir();
  if (!camofoxDir) {
    return { success: false, reason: "camofox-not-found", message: "camofox-browser not installed (npm install @askjo/camofox-browser)" };
  }

  const base = "http://localhost:" + CAMOFOX_PORT;
  let serverProc = null;

  try {
    // 啟動 Camofox server
    serverProc = spawn("node", ["server.js"], {
      cwd: camofoxDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CAMOFOX_PORT: String(CAMOFOX_PORT) },
    });
    serverProc.stderr.on("data", () => {});
    serverProc.stdout.on("data", () => {});

    if (!(await _waitCamofoxReady(base, CAMOFOX_MAX_WAIT))) {
      return { success: false, reason: "camofox-error", message: "camofox server failed to start" };
    }

    // 建立 tab
    const createRes = await fetch(base + "/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "fetchWeb", sessionKey: "s-" + Date.now(), url }),
    });
    const { tabId } = await createRes.json();

    // 取 snapshot（帶重試，部分網站需等驗證頁通過）
    let snap = null;
    let chars = 0;
    for (let i = 0; i < CAMOFOX_SNAPSHOT_RETRIES; i++) {
      const snapRes = await fetch(base + "/tabs/" + tabId + "/snapshot?userId=fetchWeb");
      snap = await snapRes.json();
      chars = snap.totalChars || 0;
      if (chars > 200) break;
      if (i < CAMOFOX_SNAPSHOT_RETRIES - 1) {
        console.warn("[fetch-web] camofox snapshot " + (i + 1) + ": " + chars + " chars, waiting ...");
        await sleep(CAMOFOX_SNAPSHOT_WAIT);
      }
    }

    // 關閉 tab
    await fetch(base + "/tabs/" + tabId + "?userId=fetchWeb", { method: "DELETE" }).catch(() => {});

    if (!snap || chars < 50) {
      return { success: false, reason: "camofox-empty", message: "camofox snapshot empty (" + chars + " chars)" };
    }

    // 轉換 snapshot → HTML
    const pageTitle = (snap.snapshot.match(/heading\s+"(.+?)"\s*\[level=1\]/)?.[1]) || "";
    const html = snapshotToHtml(snap.snapshot, pageTitle);

    console.log("[fetch-web] camofox snapshot: " + chars + " chars → HTML " + html.length + " bytes");

    return { success: true, html, method: METHOD_CAMOFOX, snapshot: snap.snapshot };
  } catch (err) {
    return { success: false, reason: "camofox-error", message: err.message };
  } finally {
    if (serverProc) {
      serverProc.kill("SIGTERM");
      await sleep(500);
    }
  }
}

// ---------- 主要匯出函式 ----------
export async function fetchWeb(url, options = {}) {
  const method = options.method || "auto";
  const parse = options.parse !== false;

  // --- 指定特定方法：fetch → inspect → parse ---
  if (method !== "auto") {
    const methodMap = {
      "curl":                     { fn: () => tryCurl(url),                name: METHOD_CURL },
      "playwright":               { fn: () => tryPlaywright(url, true),    name: METHOD_PW_HEADLESS },
      "playwright-headed":        { fn: () => tryPlaywright(url, false),   name: METHOD_PW_HEADED },
      "camofox":                  { fn: () => tryCamofox(url),             name: METHOD_CAMOFOX },
    };
    const spec = methodMap[method];
    if (!spec) {
      const valid = Object.keys(methodMap).join(", ");
      return finalize(url, { success: false, reason: "invalid-method", message: `unknown method "${method}" (valid: ${valid})` }, []);
    }

    const r = await spec.fn();
    if (!r.success) return finalize(url, r, [{ method: spec.name, ...summarizeFail(r) }]);

    const inspection = inspectHtml(r.html);
    if (!inspection.pass) {
      console.warn("[fetch-web] " + spec.name + " blocked: " + inspection.message);
      return finalize(url, { success: false, reason: inspection.type, message: inspection.message },
        [{ method: spec.name, status: "blocked", type: inspection.type, message: inspection.message }]);
    }

    return finalize(url, applyParse(r, url, parse),
      [{ method: spec.name, status: "success", contentLength: r.html.length }]);
  }

  // --- auto 模式 ---
  const depth = options._depth || 0;

  // 判識 B：URL 參數中含真實 URL — 提取後重走完整流程
  if (depth < MAX_REDIRECT_DEPTH) {
    const target = extractRedirectTarget(url);
    if (target) {
      console.log("[fetch-web] redirect param extracted → " + target);
      return fetchWeb(target, { ...options, _depth: depth + 1 });
    }
  }

  // 判識 D：已知需要 Camofox 的網站 — 跳過方法①②③，直接方法④
  if (requiresCamofox(url)) {
    console.log("[fetch-web] camofox-required domain, jumping to camofox ...");
    const r = await tryCamofox(url);
    if (r.success) {
      const parsed = applyParse(r, url, parse);
      if (parsed.success) return finalize(url, parsed, [{ method: METHOD_CAMOFOX, status: "success", contentLength: r.html.length }]);
      // Readability 解析失敗（驗證頁、空內容等）→ 回報為失敗
      return finalize(url, { success: false, reason: parsed.reason || "parse-failed", message: parsed.message || "content extraction failed" },
        [{ method: METHOD_CAMOFOX, status: "blocked", type: DETECT_EMPTY, message: parsed.message || "parse failed" }]);
    }
    return finalize(url, r, [{ method: METHOD_CAMOFOX, ...summarizeFail(r) }]);
  }

  // 判識 C：已知需要 headed 模式的網站 — 跳過 curl 和 headless，直接 headed
  if (requiresHeaded(url)) {
    console.log("[fetch-web] headed-required domain, jumping to playwright-headed ...");
    return autoEscalate(url, parse, { redirect: false, skipCurl: true, skipHeadless: true });
  }

  // 判識 A：已知 JS 轉址域名 — 跳過 curl，直接 Playwright + 轉址等待
  if (requiresJsRedirect(url)) {
    console.log("[fetch-web] JS redirect domain, skipping curl ...");
    return autoEscalate(url, parse, { redirect: true, skipCurl: true });
  }

  // 階梯式升級：curl → headless → headed → headed-newtab
  return autoEscalate(url, parse, { redirect: false, skipCurl: false });
}

// ---------- 階梯升級判斷 ----------
function shouldEscalate(lastBlockType, lastFetchOk) {
  return !lastFetchOk ||
    lastBlockType === DETECT_CAPTCHA ||
    lastBlockType === DETECT_VERIFY ||
    lastBlockType === DETECT_EMPTY;
}

// ---------- auto 模式：階梯升級邏輯 ----------
// 依序嘗試各方法，每步統一走 fetch → inspectHtml → 決定升級或回傳
async function autoEscalate(url, parse, { redirect, skipCurl, skipHeadless = false }) {
  const attempts = [];
  let lastBlockType = null;
  let lastFetchOk = true;

  // 步驟定義：label 用於 log，guard 為 true 表示需通過 shouldEscalate 才嘗試
  const steps = [
    { label: "curl",                  guard: false, skip: skipCurl,
      fetch: () => tryCurl(url) },
    { label: "Playwright headless",   guard: false, skip: skipHeadless, showRedirect: true,
      fetch: () => tryPlaywright(url, true, { redirect }) },
    { label: "Playwright headed",     guard: !skipHeadless,  skip: false, showRedirect: true,
      fetch: () => tryPlaywright(url, false, { redirect }) },
    { label: "Camofox", guard: true, skip: false,
      fetch: () => tryCamofox(url) },
  ];

  for (const step of steps) {
    if (step.skip) continue;
    if (step.guard && !shouldEscalate(lastBlockType, lastFetchOk)) continue;

    const tag = step.label + (redirect && step.showRedirect ? " (redirect)" : "");
    console.log("[fetch-web] trying " + tag + " ...");

    const r = await step.fetch();
    if (!r.success) {
      attempts.push({ method: r.method || step.label, ...summarizeFail(r) });
      console.warn("[fetch-web] " + tag + " failed: " + r.message);
      lastBlockType = null;
      lastFetchOk = false;
      continue;
    }

    const inspection = inspectHtml(r.html);
    if (inspection.pass) {
      const parsed = applyParse(r, url, parse);
      if (parsed.success) {
        attempts.push({ method: r.method, status: "success", contentLength: r.html.length });
        return finalize(url, parsed, attempts);
      }
      // Readability 解析失敗（SPA / JS 渲染頁面）→ 視為 empty，繼續升級
      attempts.push({ method: r.method, status: "blocked", type: DETECT_EMPTY, message: parsed.message || "parse failed" });
      console.warn("[fetch-web] " + tag + " parse failed: " + (parsed.message || "empty content") + " — escalating");
      lastBlockType = DETECT_EMPTY;
      lastFetchOk = true;
      continue;
    }

    attempts.push({ method: r.method, status: "blocked", type: inspection.type, message: inspection.message });
    console.warn("[fetch-web] " + tag + " blocked: " + inspection.message);
    lastBlockType = inspection.type;
    lastFetchOk = true;
    if (inspection.type === DETECT_REDIRECT) redirect = true;
  }

  // 所有方法皆失敗
  const last = attempts[attempts.length - 1];
  return finalize(url, {
    success: false,
    reason: last?.reason || last?.type || "unknown",
    message: last?.message || "all methods exhausted",
  }, attempts);
}

// ---------- 輔助 ----------
function applyParse(r, url, parse) {
  if (!r.success) return r;
  if (!parse) return r;
  const parsed = parseArticle(r.html, url);
  if (!parsed.success) return parsed;
  const out = { ...parsed, method: r.method };
  if (r.snapshot) out.snapshot = r.snapshot;
  return out;
}

function summarizeFail(r) {
  return { status: "failed", reason: r.reason, message: r.message };
}

function finalize(url, result, attempts) {
  if (result.success) {
    const out = { status: "success", url, method: result.method, fetchedAt: ts(), attempts };
    if (result.html !== undefined) {
      out.html = result.html;
    } else {
      out.title = result.title;
      out.content = result.content;
      out.contentLength = result.contentLength;
    }
    // Camofox 方法額外回傳原始 accessibility snapshot，方便盤查
    if (result.snapshot) out.snapshot = result.snapshot;
    return out;
  }
  return {
    status: "error",
    url,
    message: result.message || "all methods failed",
    fetchedAt: ts(),
    attempts,
  };
}
