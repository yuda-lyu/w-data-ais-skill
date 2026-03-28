// fetchWeb.mjs — 核心函式：抓取網頁文章內容，支援三種方法自動階梯升級
//
// 方法 ①: curl + Readability（預設，繞過 TLS 指紋偵測）
// 方法 ②: Playwright 無頭（SPA 動態渲染頁面）
// 方法 ③: Playwright 有頭（DataDome 等進階反自動化偵測）
//
// 輸出：{ status, url, title, content, contentLength, method, fetchedAt, attempts }

import { execFileSync } from "node:child_process";

// ---------- 常數 ----------
const CURL_MAX_TIME = 15;        // curl --max-time（秒）
const EXEC_TIMEOUT = 20000;      // execFileSync timeout（ms）
const PAGE_TIMEOUT = 30000;      // Playwright page.goto timeout（ms）
const MIN_CONTENT = 50;          // 最低有效字數
const MAX_RETRIES = 5;
const INITIAL_WAIT = 3000;       // ms
const MAX_WAIT = 15000;          // ms
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

function isCaptchaHtml(html) {
  const lower = html.toLowerCase();
  return (
    lower.includes("captcha-delivery.com") ||
    lower.includes("datadome") ||
    lower.includes("perimeterx") ||
    (lower.includes("captcha") && lower.includes("challenge"))
  );
}

// ---------- 動態載入依賴 ----------
async function loadCurlDeps() {
  try {
    const [readabilityMod, jsdomMod] = await Promise.all([
      import("@mozilla/readability"),
      import("jsdom"),
    ]);
    const Readability =
      readabilityMod.Readability || readabilityMod.default?.Readability;
    const JSDOM = jsdomMod.JSDOM || jsdomMod.default?.JSDOM;
    if (!Readability || !JSDOM) return null;
    return { Readability, JSDOM };
  } catch {
    return null;
  }
}

async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod.chromium || mod.default?.chromium;
  } catch {
    return null;
  }
}

// ---------- 方法①: curl + Readability ----------
async function tryCurlReadability(url) {
  const deps = await loadCurlDeps();
  if (!deps) {
    return {
      success: false,
      reason: "missing-deps",
      message: "缺少 @mozilla/readability 或 jsdom",
    };
  }
  const { Readability, JSDOM } = deps;

  let html = "";
  let httpCode = 0;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      // 使用 execFileSync（非 shell）避免命令注入風險
      const raw = execFileSync(
        "curl",
        [
          "-s",
          "-L",
          "--compressed",
          "--max-time",
          String(CURL_MAX_TIME),
          "--write-out",
          "\n%{http_code}",
          "-H", "User-Agent: " + UA,
          "-H", "Accept: text/html,application/xhtml+xml",
          "-H", "Accept-Language: en-US,en;q=0.9,zh-TW;q=0.8",
          "-H", "Referer: https://www.google.com/",
          url,
        ],
        { encoding: "utf8", timeout: EXEC_TIMEOUT }
      );

      // 從最後一行提取 HTTP 狀態碼
      const lines = raw.trimEnd().split("\n");
      httpCode = parseInt(lines.pop(), 10) || 0;
      html = lines.join("\n");

      // 5xx → 重試
      if (httpCode >= 500) {
        lastError = new Error("HTTP " + httpCode);
        const attemptsLeft = MAX_RETRIES + 1 - attempt;
        if (attemptsLeft > 0) {
          const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
          console.warn(
            "[fetch-web] curl retry " + attempt + "/" + MAX_RETRIES +
            ": HTTP " + httpCode + " — wait " + (waitMs / 1000) + "s ..."
          );
          await sleep(waitMs);
          continue;
        }
        return {
          success: false,
          reason: "http-error",
          message: "HTTP " + httpCode,
        };
      }

      // 4xx → 不重試，直接回傳以便升級方法
      if (httpCode >= 400) {
        return {
          success: false,
          reason: "http-error",
          message: "HTTP " + httpCode,
        };
      }

      // 回應過短
      if (!html || html.length < 100) {
        return {
          success: false,
          reason: "empty-response",
          message: "response too short (" + (html ? html.length : 0) + " chars)",
        };
      }

      break; // 200 OK
    } catch (err) {
      lastError = err;
      const attemptsLeft = MAX_RETRIES + 1 - attempt;
      if (attemptsLeft <= 0) {
        return { success: false, reason: "curl-error", message: err.message };
      }
      const waitMs = Math.min(INITIAL_WAIT * attempt, MAX_WAIT);
      console.warn(
        "[fetch-web] curl retry " + attempt + "/" + MAX_RETRIES +
        ": " + err.message + " — wait " + (waitMs / 1000) + "s ..."
      );
      await sleep(waitMs);
    }
  }

  // 檢查 CAPTCHA 頁面
  if (isCaptchaHtml(html)) {
    return { success: false, reason: "captcha", message: "CAPTCHA or challenge page" };
  }

  // Readability 解析文章主體
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

  return {
    success: true,
    title,
    content,
    contentLength: content.length,
    method: "curl+readability",
  };
}

// ---------- 方法②③: Playwright ----------
async function tryPlaywright(url, headless) {
  const chromium = await loadPlaywright();
  if (!chromium) {
    return { success: false, reason: "missing-deps", message: "missing playwright" };
  }

  const modeName = headless ? "playwright-headless" : "playwright-headed";
  let browser;
  try {
    const launchOpts = { headless, channel: "chrome" };
    if (!headless) {
      launchOpts.args = ["--disable-blink-features=AutomationControlled"];
    }

    browser = await chromium.launch(launchOpts);
    const page = await browser.newPage();

    // 有頭模式：隱藏 webdriver 標記
    if (!headless) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });
    }

    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT });
    await page.waitForTimeout(headless ? 3000 : 5000);

    // 檢查 CAPTCHA（僅無頭模式，有頭模式通常能繞過）
    if (headless) {
      const pageHtml = await page.content();
      if (isCaptchaHtml(pageHtml)) {
        return { success: false, reason: "captcha", message: "CAPTCHA detected (headless blocked)" };
      }
    }

    // 提取文章內容
    const { title, text } = await page.evaluate(() => {
      const selectors = ["article", '[role="main"]', "main", ".article-content", ".post-content"];
      let el;
      for (const s of selectors) {
        el = document.querySelector(s);
        if (el && el.innerText.length > 200) break;
        el = null;
      }
      return {
        title: document.title || "",
        text: (el || document.body)?.innerText || "",
      };
    });

    const content = text.trim();
    if (content.length < MIN_CONTENT) {
      return {
        success: false,
        reason: "empty-content",
        message: "content too short (" + content.length + " chars)",
      };
    }

    return {
      success: true,
      title: title.trim(),
      content,
      contentLength: content.length,
      method: modeName,
    };
  } catch (err) {
    return { success: false, reason: "playwright-error", message: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------- 主要匯出函式 ----------
export async function fetchWeb(url, options = {}) {
  const method = options.method || "auto";
  const attempts = [];

  // 指定特定方法
  if (method === "curl") {
    const r = await tryCurlReadability(url);
    return finalize(url, r, [{ method: "curl+readability", ...summarize(r) }]);
  }
  if (method === "playwright") {
    const r = await tryPlaywright(url, true);
    return finalize(url, r, [{ method: "playwright-headless", ...summarize(r) }]);
  }
  if (method === "playwright-headed") {
    const r = await tryPlaywright(url, false);
    return finalize(url, r, [{ method: "playwright-headed", ...summarize(r) }]);
  }

  // ---------- auto 模式：階梯式升級 ----------

  // Step 1: curl + Readability
  console.log("[fetch-web] trying curl + Readability ...");
  let result = await tryCurlReadability(url);
  attempts.push({ method: "curl+readability", ...summarize(result) });
  if (result.success) return finalize(url, result, attempts);
  console.warn("[fetch-web] curl failed: " + result.message);

  // Step 2: Playwright 無頭
  console.log("[fetch-web] trying Playwright headless ...");
  result = await tryPlaywright(url, true);
  attempts.push({ method: "playwright-headless", ...summarize(result) });
  if (result.success) return finalize(url, result, attempts);
  console.warn("[fetch-web] Playwright headless failed: " + result.message);

  // Step 3: Playwright 有頭（僅在 CAPTCHA / 空內容 / 錯誤時嘗試）
  if (
    result.reason === "captcha" ||
    result.reason === "empty-content" ||
    result.reason === "playwright-error"
  ) {
    console.log("[fetch-web] trying Playwright headed ...");
    result = await tryPlaywright(url, false);
    attempts.push({ method: "playwright-headed", ...summarize(result) });
    if (result.success) return finalize(url, result, attempts);
    console.warn("[fetch-web] Playwright headed failed: " + result.message);
  }

  return finalize(url, result, attempts);
}

// ---------- 輔助 ----------
function summarize(r) {
  if (r.success) return { status: "success", contentLength: r.contentLength };
  return { status: "failed", reason: r.reason, message: r.message };
}

function finalize(url, result, attempts) {
  if (result.success) {
    return {
      status: "success",
      url,
      title: result.title,
      content: result.content,
      contentLength: result.contentLength,
      method: result.method,
      fetchedAt: ts(),
      attempts,
    };
  }
  return {
    status: "error",
    url,
    message: "all methods failed",
    fetchedAt: ts(),
    attempts,
  };
}
