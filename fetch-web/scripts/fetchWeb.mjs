// fetchWeb.mjs — 核心函式：抓取網頁文章內容，支援四種方法自動階梯升級
//
// 方法 ①: curl（預設，繞過 TLS 指紋）           → 委派給 fetch-web-by-curl
// 方法 ②: Playwright 無頭（SPA 動態渲染頁面）   → 委派給 fetch-web-by-playwright-headless
// 方法 ③: Playwright 有頭（反自動化偵測）       → 委派給 fetch-web-by-playwright-head
// 方法 ④: Camofox 反偵測瀏覽器（Cloudflare 等）→ 委派給 fetch-web-by-camofox
//
// 本技能僅負責「階梯升級 + 內容判識 + 文章解析（Readability）」之 orchestration；
// 實際抓取由 4 個子技能執行，本檔不含瀏覽器啟動/重試/snapshot 轉換等低階邏輯。
//
// 流程：fetch（委派）→ inspectHtml（原始內容檢測）→ Readability 解析（可選）
// options.parse = true（預設）→ { status, url, title, content, contentLength, method, fetchedAt, attempts }
// options.parse = false        → { status, url, html, method, fetchedAt, attempts }（原始 HTML，由外部自行解析）
// 方法④ 額外回傳 snapshot 欄位（Camofox accessibility snapshot 原始結構化資料）

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

// ---------- 子技能委派 ----------
// 4 個抓取方法委派給同層 sibling 技能；它們各自負責瀏覽器啟動、重試、進程清理等
import { fetchWebByCurl }              from "../../fetch-web-by-curl/scripts/fetchWebByCurl.mjs";
import { fetchWebByPlaywrightHeadless } from "../../fetch-web-by-playwright-headless/scripts/fetchWebByPlaywrightHeadless.mjs";
import { fetchWebByPlaywrightHead }    from "../../fetch-web-by-playwright-head/scripts/fetchWebByPlaywrightHead.mjs";
import { fetchWebByCamofox }            from "../../fetch-web-by-camofox/scripts/fetchWebByCamofox.mjs";

// ---------- 常數 ----------
const MIN_CONTENT = 50;          // 最低有效字數（Readability 解析後）

// 方法名稱常數（與 4 個子技能回傳的 method 字串一致）
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
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// ---------- 子技能結果適配器 ----------
// 把新版子技能的 { status: 'success'|'error', html, ... } 結構轉為
// 內部階梯升級需要的舊版 { success: bool, html?, method, reason?, message? } 結構
function _adapt(r) {
  if (r.status === "success") {
    return { success: true, html: r.html, method: r.method, snapshot: r.snapshot };
  }
  return { success: false, method: r.method, reason: r.reason || "unknown", message: r.message };
}

// ---------- URL 轉址判識 ----------
const MAX_REDIRECT_DEPTH = 3;

// 判識 C：已知需要 Playwright 有頭模式的網站（headless 無法正確渲染內容）
const HEADED_REQUIRED_PATTERNS = [
  /^https?:\/\/(?:www\.)?wsj\.com\//,
];
function requiresHeaded(url) {
  return HEADED_REQUIRED_PATTERNS.some((p) => p.test(url));
}

// 判識 D：已知需要 Camofox 反偵測瀏覽器的網站（方法①②③ 皆無法通過驗證，直接跳方法④）
const CAMOFOX_REQUIRED_PATTERNS = [
  /^https?:\/\/mp\.weixin\.qq\.com\//,
];
function requiresCamofox(url) {
  return CAMOFOX_REQUIRED_PATTERNS.some((p) => p.test(url));
}

// 判識 A：已知需要 JS 執行的轉址服務（curl 永遠只拿到包裝頁）
const JS_REDIRECT_PATTERNS = [
  /^https?:\/\/(?:www\.)?linkedin\.com\/redir\/redirect/,
  /^https?:\/\/(?:www\.)?linkedin\.com\/feed\/update/,
  /^https?:\/\/news\.google\.com\/articles\//,
  /^https?:\/\/news\.google\.com\/rss\/articles\//,
];
function requiresJsRedirect(url) {
  return JS_REDIRECT_PATTERNS.some((p) => p.test(url));
}

// 判識 E：已知 SPA 網站（curl 拿到的是 JS 渲染前空殼，Readability 只解析得到頁尾／導覽）
const HEADLESS_REQUIRED_PATTERNS = [
  /^https?:\/\/(?:www\.)?msn\.com\//,
];
function requiresHeadless(url) {
  return HEADLESS_REQUIRED_PATTERNS.some((p) => p.test(url));
}

// 判識 B：query 參數中含真實 URL 的轉址服務
const URL_PARAM_PATTERNS = [
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
  if (lower.includes("secitptpage") && lower.includes("wx.qq.com"))
    return { pass: false, type: DETECT_VERIFY, message: "WeChat verification page" };

  // --- 轉址包裝頁 ---
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
const CUSTOM_PARSERS = [
  { pattern: /^https?:\/\/(?:www\.)?gelonghui\.com\//, parse: parseGelonghui },
  { pattern: /^https?:\/\/(?:www\.)?bloomberg\.com\/(?:news\/articles|opinion|features)\//, parse: parseBloomberg },
];

function findCustomParser(url) {
  for (const entry of CUSTOM_PARSERS) {
    if (entry.pattern.test(url)) return entry.parse;
  }
  return null;
}

// --- 格隆匯（快訊 / 文章）：從 Nuxt SSR state 提取結構化資料 ---
function parseGelonghui(html, url) {
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

    const content = raw.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    const title = extractHtmlTitle(html);

    if (content.length < MIN_CONTENT) {
      return { success: false, reason: "empty-content", message: "content too short (" + content.length + " chars)" };
    }
    return { success: true, title, content, contentLength: content.length };
  }

  return { success: false, reason: "custom-parser-miss", message: "gelonghui: no content found in __NUXT__ state" };
}

function extractHtmlTitle(html) {
  return html.match(/<title>([^<]*)/i)?.[1]?.replace(/-[^-]*$/, "")?.trim() || "";
}

// --- Bloomberg：從 __NEXT_DATA__ 提取 story.body.content ---
function parseBloomberg(html, _url) {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    return { success: false, reason: "custom-parser-miss", message: "bloomberg: no __NEXT_DATA__" };
  }

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (_e) {
    return { success: false, reason: "custom-parser-miss", message: "bloomberg: __NEXT_DATA__ JSON parse failed" };
  }

  const story = data?.props?.pageProps?.story;
  const blocks = story?.body?.content;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { success: false, reason: "custom-parser-miss", message: "bloomberg: no story.body.content" };
  }

  const SKIP = new Set(["ad", "inline-newsletter", "inline-recirc", "media", "image", "video", "blockquote-instagram"]);
  const nodeText = (n) => {
    if (n == null || typeof n !== "object") return "";
    let t = typeof n.value === "string" ? n.value : "";
    if (Array.isArray(n.content)) t += n.content.map(nodeText).join("");
    return t;
  };

  const paragraphs = [];
  for (const block of blocks) {
    if (SKIP.has(block?.type)) continue;
    const t = nodeText(block).replace(/\s+/g, " ").trim();
    if (t.length > 0) paragraphs.push(t);
  }

  const content = paragraphs.join("\n\n");
  const title = (typeof story.headline === "string" ? story.headline : extractHtmlTitle(html)).trim();

  if (content.length < MIN_CONTENT) {
    return { success: false, reason: "empty-content", message: "bloomberg: content too short (" + content.length + " chars)" };
  }
  return { success: true, title, content, contentLength: content.length };
}

// ---------- Readability 解析 ----------
function parseArticle(html, url) {
  const customParser = findCustomParser(url);
  if (customParser) {
    return customParser(html, url);
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

// ---------- 子技能呼叫（含適配器）----------
async function tryCurl(url) {
  return _adapt(await fetchWebByCurl(url));
}

async function tryPlaywrightHeadless(url, { redirect = false } = {}) {
  return _adapt(await fetchWebByPlaywrightHeadless(url, { waitForRedirect: redirect }));
}

async function tryPlaywrightHead(url, { redirect = false } = {}) {
  return _adapt(await fetchWebByPlaywrightHead(url, { waitForRedirect: redirect }));
}

async function tryCamofox(url) {
  return _adapt(await fetchWebByCamofox(url));
}

// ---------- 主要匯出函式 ----------
export async function fetchWeb(url, options = {}) {
  const method = options.method || "auto";
  const parse = options.parse !== false;

  // --- 指定特定方法：fetch → inspect → parse ---
  if (method !== "auto") {
    const methodMap = {
      "curl":              { fn: () => tryCurl(url),              name: METHOD_CURL },
      "playwright":        { fn: () => tryPlaywrightHeadless(url), name: METHOD_PW_HEADLESS },
      "playwright-headed": { fn: () => tryPlaywrightHead(url),    name: METHOD_PW_HEADED },
      "camofox":           { fn: () => tryCamofox(url),           name: METHOD_CAMOFOX },
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

  // 判識 E：已知 SPA 網站 — 跳過 curl，直接 Playwright 無頭
  if (requiresHeadless(url)) {
    console.log("[fetch-web] headless-required SPA domain, skipping curl ...");
    return autoEscalate(url, parse, { redirect: false, skipCurl: true });
  }

  // 階梯式升級：curl → headless → headed → camofox
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
async function autoEscalate(url, parse, { redirect, skipCurl, skipHeadless = false }) {
  const attempts = [];
  let lastBlockType = null;
  let lastFetchOk = true;

  const steps = [
    { label: "curl",                  guard: false, skip: skipCurl,
      fetch: () => tryCurl(url) },
    { label: "Playwright headless",   guard: false, skip: skipHeadless, showRedirect: true,
      fetch: () => tryPlaywrightHeadless(url, { redirect }) },
    { label: "Playwright headed",     guard: !skipHeadless,  skip: false, showRedirect: true,
      fetch: () => tryPlaywrightHead(url, { redirect }) },
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
