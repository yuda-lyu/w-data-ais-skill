// fetchWebByCamofox.mjs — 用 Camofox 反偵測瀏覽器抓網頁原始 HTML（含 accessibility snapshot）
//
// 對外匯出 fetchWebByCamofox(url, options) → { status, url, html?, snapshot?, ... }
//
// 流程：
//   1. 找到 @askjo/camofox-browser 安裝位置
//   2. spawn `node server.js` 啟動 Camofox server
//   3. POST /tabs 建立 tab
//   4. GET /tabs/:id/snapshot 取 accessibility snapshot（含內部重試）
//   5. DELETE /tabs/:id 關閉 tab
//   6. 殺整棵 server 進程樹（Windows 用 taskkill /F /T；Unix 用 SIGTERM）
//
// 重試：整體最多 5 次（含初始 6 次）+ snapshot 內部最多 3 次（含初始 4 次）

import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import w from 'wsemi';
import _ from 'lodash-es';

const MAX_RETRIES = 5;
const INITIAL_WAIT_MS = 3000;
const MAX_WAIT_MS = 15000;
const DEFAULT_PORT = 19377;
const DEFAULT_SERVER_START_TIMEOUT_MS = 30000;
const DEFAULT_SNAPSHOT_RETRIES = 3;
const DEFAULT_SNAPSHOT_WAIT_MS = 5000;
const SNAPSHOT_MIN_CHARS = 50;
const IS_WIN = process.platform === 'win32';

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

// 從本腳本位置向上找 node_modules/@askjo/camofox-browser
function _findCamofoxDir() {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, '../../node_modules/@askjo/camofox-browser'),
    resolve(thisDir, '../node_modules/@askjo/camofox-browser'),
    resolve(thisDir, '../../../node_modules/@askjo/camofox-browser'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p) && statSync(p).isDirectory()) return p;
    } catch (_) {}
  }
  return null;
}

// Windows 殺整棵進程樹；Unix 用 SIGTERM
function _killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (IS_WIN) {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore', timeout: 5000 });
    } catch (_) {
      try { proc.kill(); } catch (_) {}
    }
  } else {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
}

async function _waitCamofoxReady(base, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(base + '/tabs');
      if (r.ok) return true;
    } catch (_) {}
    await sleep(300);
  }
  return false;
}

// accessibility snapshot → 簡易 HTML（保留語意元素，跳過結構標記）
function snapshotToHtml(snapshot, pageTitle) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = snapshot.split('\n');
  const htmlParts = [];

  for (const line of lines) {
    const trimmed = line.replace(/^ *- */, '').trim();
    if (!trimmed) continue;

    // heading "..." [level=N]
    const headingMatch = trimmed.match(/^(?:')?heading\s+"(.+?)"\s*\[level=(\d)\]/);
    if (headingMatch) {
      const lvl = headingMatch[2];
      htmlParts.push(`<h${lvl}>${esc(headingMatch[1])}</h${lvl}>`);
      continue;
    }

    // link / /url: → 跳過（內容由子行處理）
    if (/^(?:')?link\s+"/.test(trimmed)) continue;
    if (/^\/url:\s+/.test(trimmed)) continue;

    // img "alt"
    const imgMatch = trimmed.match(/^img\s+"(.+?)"/);
    if (imgMatch) {
      htmlParts.push(`<img alt="${esc(imgMatch[1])}">`);
      continue;
    }

    // paragraph / paragraph: text
    const paraMatch = trimmed.match(/^paragraph(?::\s*(.+))?$/);
    if (paraMatch) {
      if (paraMatch[1]) htmlParts.push(`<p>${esc(paraMatch[1])}</p>`);
      continue;
    }

    // listitem / listitem: text
    const liMatch = trimmed.match(/^listitem(?::\s*(.+))?$/);
    if (liMatch) {
      if (liMatch[1]) htmlParts.push(`<li>${esc(liMatch[1])}</li>`);
      continue;
    }

    // strong: text
    const strongMatch = trimmed.match(/^strong:\s*"?(.+?)"?\s*$/);
    if (strongMatch) {
      htmlParts.push(`<strong>${esc(strongMatch[1])}</strong>`);
      continue;
    }

    // emphasis: text
    const emMatch = trimmed.match(/^emphasis:\s*"?(.+?)"?\s*$/);
    if (emMatch) {
      htmlParts.push(`<em>${esc(emMatch[1])}</em>`);
      continue;
    }

    // text: "..."
    const textMatch = trimmed.match(/^text:\s*"?(.+?)"?\s*$/);
    if (textMatch) {
      htmlParts.push(`<span>${esc(textMatch[1])}</span>`);
      continue;
    }

    // option "..." (微信附註)
    const optionMatch = trimmed.match(/^(?:')?option\s+"(.+?)"/);
    if (optionMatch) {
      htmlParts.push(`<p>${esc(optionMatch[1])}</p>`);
      continue;
    }

    // 結構/容器標記：跳過
    if (/^(button|banner|navigation|main|contentinfo|complementary|list)\b/.test(trimmed)) continue;

    // 純文字行
    const plainText = trimmed.replace(/\[e\d+\]/g, '').replace(/^['"]|['"]$/g, '').trim();
    if (
      plainText.length > 0 &&
      !/^(link|img|heading|paragraph|listitem|strong|emphasis|text|option|button|banner|navigation|main|contentinfo|complementary|list)\b/.test(plainText)
    ) {
      htmlParts.push(`<p>${esc(plainText)}</p>`);
    }
  }

  const titleEsc = esc(pageTitle || '');
  return (
    '<!DOCTYPE html><html><head><title>' + titleEsc + '</title></head>' +
    '<body><article><h1>' + titleEsc + '</h1>\n' +
    htmlParts.join('\n') +
    '</article></body></html>'
  );
}

/**
 * 用 Camofox 抓取網頁原始 HTML（透過 accessibility snapshot）
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.port=19377]
 * @param {number} [options.serverStartTimeoutMs=30000]
 * @param {number} [options.snapshotRetries=3]
 * @param {number} [options.snapshotWaitMs=5000]
 * @returns {Promise<{status, url, html?, htmlLength?, snapshot?, snapshotChars?, method, fetchedAt, attempts, message?, reason?}>}
 */
export async function fetchWebByCamofox(url, options = {}) {
  const fetchedAt = new Date().toISOString();
  if (!w.isestr(url)) {
    return { status: 'error', url: String(url), message: 'url is required (string)', reason: 'invalid-url', method: 'camofox', fetchedAt, attempts: 0 };
  }
  if (!_isValidUrl(url)) {
    return { status: 'error', url, message: 'invalid url (must be http/https)', reason: 'invalid-url', method: 'camofox', fetchedAt, attempts: 0 };
  }

  const camofoxDir = _findCamofoxDir();
  if (!camofoxDir) {
    return {
      status: 'error', url,
      message: '@askjo/camofox-browser not installed (npm install @askjo/camofox-browser)',
      reason: 'camofox-not-found', method: 'camofox', fetchedAt, attempts: 0,
    };
  }

  let port = _.get(options, 'port', null);
  if (!w.ispint(port)) port = DEFAULT_PORT; else port = w.cint(port);

  let serverStartTimeoutMs = _.get(options, 'serverStartTimeoutMs', null);
  if (!w.ispint(serverStartTimeoutMs)) serverStartTimeoutMs = DEFAULT_SERVER_START_TIMEOUT_MS; else serverStartTimeoutMs = w.cint(serverStartTimeoutMs);

  let snapshotRetries = _.get(options, 'snapshotRetries', null);
  if (!w.isp0int(snapshotRetries)) snapshotRetries = DEFAULT_SNAPSHOT_RETRIES; else snapshotRetries = w.cint(snapshotRetries);

  let snapshotWaitMs = _.get(options, 'snapshotWaitMs', null);
  if (!w.isp0int(snapshotWaitMs)) snapshotWaitMs = DEFAULT_SNAPSHOT_WAIT_MS; else snapshotWaitMs = w.cint(snapshotWaitMs);

  const base = 'http://localhost:' + port;

  let lastMessage = '';
  let lastReason = 'camofox-error';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let serverProc = null;
    try {
      // 啟動 Camofox server
      serverProc = spawn('node', ['server.js'], {
        cwd: camofoxDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CAMOFOX_PORT: String(port) },
        windowsHide: true,
      });
      serverProc.stderr.on('data', () => {});
      serverProc.stdout.on('data', () => {});

      if (!(await _waitCamofoxReady(base, serverStartTimeoutMs))) {
        lastMessage = 'camofox server failed to start within ' + (serverStartTimeoutMs / 1000) + 's';
        lastReason = 'camofox-error';
        throw new Error(lastMessage);
      }

      // 建立 tab
      const createRes = await fetch(base + '/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'fetchWebByCamofox', sessionKey: 's-' + Date.now(), url }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      const tabId = createJson?.tabId;
      if (!tabId) {
        lastMessage = 'tab creation failed: ' + (createJson?.error || createJson?.message || 'no tabId');
        lastReason = 'camofox-error';
        throw new Error(lastMessage);
      }

      // 取 snapshot（內部重試 snapshotRetries 次，含初始最多 snapshotRetries+1 次）
      let snap = null;
      let chars = 0;
      for (let i = 0; i <= snapshotRetries; i++) {
        try {
          const snapRes = await fetch(base + '/tabs/' + tabId + '/snapshot?userId=fetchWebByCamofox');
          snap = await snapRes.json().catch(() => null);
          chars = (snap && snap.totalChars) || 0;
          if (chars > 200) break;
        } catch (_) {}
        if (i < snapshotRetries) {
          process.stderr.write(`[fetch-web-by-camofox] snapshot ${i + 1} only ${chars} chars, waiting ${snapshotWaitMs}ms...\n`);
          await sleep(snapshotWaitMs);
        }
      }

      // 關閉 tab
      await fetch(base + '/tabs/' + tabId + '?userId=fetchWebByCamofox', { method: 'DELETE' }).catch(() => {});

      if (!snap || chars < SNAPSHOT_MIN_CHARS) {
        lastMessage = `camofox snapshot empty (${chars} chars)`;
        lastReason = 'camofox-empty';
        throw new Error(lastMessage);
      }

      // 轉換 snapshot → HTML
      const pageTitle = snap.snapshot.match(/heading\s+"(.+?)"\s*\[level=1\]/)?.[1] || '';
      const html = snapshotToHtml(snap.snapshot, pageTitle);

      return {
        status: 'success', url,
        html, htmlLength: html.length,
        snapshot: snap.snapshot, snapshotChars: chars,
        method: 'camofox', fetchedAt, attempts: attempt,
      };
    } catch (err) {
      if (!lastMessage) lastMessage = err.message || String(err);
      if (attempt <= MAX_RETRIES) {
        const w = waitMs(attempt);
        process.stderr.write(`[fetch-web-by-camofox] error: ${lastMessage}，等 ${w}ms 後重試 (${attempt}/${MAX_RETRIES})\n`);
        await sleep(w);
        // 清掉 lastMessage 讓下一輪用新的 err.message
        lastMessage = '';
        continue;
      }
      return {
        status: 'error', url,
        message: lastMessage || (err.message || String(err)),
        reason: lastReason || 'camofox-error',
        method: 'camofox', fetchedAt, attempts: attempt,
      };
    } finally {
      if (serverProc) {
        _killProcessTree(serverProc);
        await sleep(500);
      }
    }
  }

  return { status: 'error', url, message: lastMessage || 'max retries exceeded', reason: lastReason, method: 'camofox', fetchedAt, attempts: MAX_RETRIES + 1 };
}

export default fetchWebByCamofox;
