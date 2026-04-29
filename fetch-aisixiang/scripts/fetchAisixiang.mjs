// fetchAisixiang.mjs — 愛思想（aisixiang.com）抓取邏輯模組
//
// 這個檔案不做 CLI 解析、不寫檔。所有函式都是純資料層：
//   - 給輸入 → 回 payload 物件（list 模式）或 markdown 字串（fetch 模式）
// 寫檔／argv 解析在 fetch_aisixiang.mjs 處理。
//
// Exports:
//   常數：BASE_URL, USER_AGENT, PAGE_DELAY_MS, MAX_PAGES
//   工具：safeFilename, sleep
//   lookup：fetchAuthorsList, lookupAuthor, fetchTopicsList, lookupTopic
//   高階：fetchAuthorArticles, fetchKeywordArticles, fetchTitleArticles,
//         fetchTopicArticles, fetchArticle

export const BASE_URL = 'https://www.aisixiang.com';
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
export const PAGE_DELAY_MS = 1000;   // 頁間延遲，降低被封機率
export const MAX_PAGES     = 50;     // 安全上限（50 頁 × 30 筆 = 1500 筆）

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── HTTP ─────────────────────────

const RETRY_MAX            = 5;     // 429 / 5xx / 網路層錯誤重試次數（含初始最多執行 RETRY_MAX + 1 次）
const RETRY_BACKOFF_MS     = 5000;  // 起始 backoff，後續指數增長並 cap 在 RETRY_MAX_BACKOFF_MS (5s → 10s → 20s → 30s → 30s)
const RETRY_MAX_BACKOFF_MS = 30000; // 退避上限，避免 5 次重試最後一次等待過長
const REQUEST_TIMEOUT_MS   = 30000; // 單次請求超時（避免 socket hang 永不回）

// 判斷是否為值得重試的網路層錯誤（fetch 自身拋出，非 HTTP 狀態碼）
function _isRetryableNetworkError(err) {
  // undici 把底層錯誤掛在 err.cause；DNS 失敗、連線重置、TLS 等
  const code = err?.cause?.code || err?.code;
  if (code && [
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED',
    'ECONNABORTED', 'EAI_AGAIN', 'EPIPE',
  ].includes(code)) return true;
  // AbortController 觸發的超時
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return true;
  // undici body / stream 暫時性錯誤
  if (/UND_ERR_(SOCKET|HEADERS_TIMEOUT|BODY_TIMEOUT|CONNECT_TIMEOUT)/.test(String(err?.cause?.code || err?.message))) return true;
  return false;
}

async function fetchHtml(url) {
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: ac.signal,
      });
      // 429 (限流) 或 5xx (伺服器暫時錯誤) → 退避重試
      if ((res.status === 429 || res.status >= 500) && attempt < RETRY_MAX) {
        const wait = Math.min(RETRY_BACKOFF_MS * Math.pow(2, attempt), RETRY_MAX_BACKOFF_MS);
        process.stderr.write(`[warn] HTTP ${res.status} ${url}，等 ${wait}ms 後重試 (${attempt + 1}/${RETRY_MAX})\n`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      // 網路層錯誤或 timeout：對 fetch 自身拋錯重試
      if (_isRetryableNetworkError(err) && attempt < RETRY_MAX) {
        const code = err?.cause?.code || err?.code || err?.name;
        const wait = Math.min(RETRY_BACKOFF_MS * Math.pow(2, attempt), RETRY_MAX_BACKOFF_MS);
        process.stderr.write(`[warn] 網路錯誤 ${code} ${url}，等 ${wait}ms 後重試 (${attempt + 1}/${RETRY_MAX})\n`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ───────────────────────── HTML utilities ─────────────────────────

function decodeEntities(s) {
  const named = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    hellip: '…', mdash: '—', ndash: '–', middot: '·',
    ldquo: '"', rdquo: '"', lsquo: '‘', rsquo: '’',
    laquo: '«', raquo: '»', copy: '©', reg: '®',
  };
  return s
    .replace(/&([a-zA-Z]+);/g, (m, n) => (named[n] !== undefined ? named[n] : m))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([\da-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToMarkdown(html) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n**$1**\n\n');
  s = s.replace(/<\/?(?:strong|b)\s*[^>]*>/gi, '**');
  s = s.replace(/<\/?(?:em|i)\s*[^>]*>/gi, '*');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
    const t = text.replace(/<[^>]+>/g, '').trim();
    return t ? `[${t}](${url})` : '';
  });
  s = s.replace(/<p[^>]*>/gi, '');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/?(?:div|span|section|article|font|u)[^>]*>/gi, '');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trimEnd()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').replace(/\*\*\s*\*\*/g, '');
  return s.trim();
}

function extractTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractArticleContent(html) {
  const startTag = '<div class="article-content">';
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startTag.length;
  let i = contentStart;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const open = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    if (close === -1) return null;
    if (open !== -1 && open < close) {
      depth++;
      i = open + 4;
    } else {
      depth--;
      if (depth === 0) return html.slice(contentStart, close);
      i = close + 6;
    }
  }
  return null;
}

export function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

// ───────────────────────── lookups (stateless) ─────────────────────────

// 即時抓 /thinktank/，解析 ~963 位作者，回 [{slug, name}]
export async function fetchAuthorsList() {
  const html = await fetchHtml(`${BASE_URL}/thinktank/`);
  const matches = [...html.matchAll(/href="\/thinktank\/([^"]+?)\.html"[^>]*>([^<]+)</g)];
  const uniq = new Map();
  for (const [, slug, rawName] of matches) {
    const key = slug.toLowerCase();
    if (uniq.has(key)) continue;
    const name = rawName.split(/[，、]/)[0].trim();
    if (!name || name.length > 30) continue;
    uniq.set(key, { slug, name });
  }
  return [...uniq.values()];
}

export function lookupAuthor(authors, name) {
  return authors.find((a) => a.name === name) || null;
}

// 即時抓 /zhuanti/，解析 ~803 個策展主題，回 [{id, name, category}]
export async function fetchTopicsList() {
  const html = await fetchHtml(`${BASE_URL}/zhuanti/`);
  const cats = [
    { name: '学科', start: html.indexOf('<h3>学科关键词</h3>') },
    { name: '事件', start: html.indexOf('<h3>事件关键词</h3>') },
    { name: '人物', start: html.indexOf('<h3>人物关键词</h3>') },
  ].filter((c) => c.start >= 0).sort((a, b) => a.start - b.start);
  cats.push({ name: null, start: html.length });

  const seen = new Set();
  const topics = [];
  for (let i = 0; i < cats.length - 1; i++) {
    const block = html.slice(cats[i].start, cats[i + 1].start);
    const re = /href="\/zhuanti\/(\d+)\.html"[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(block)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const name = m[2].trim().replace(/^\[|\]$/g, '').trim();
      if (!name || name.length > 50) continue;
      topics.push({ id: m[1], name, category: cats[i].name });
    }
  }
  return topics;
}

export function lookupTopic(topics, name) {
  return topics.find((t) => t.name === name) || null;
}

// ───────────────────────── parsers ─────────────────────────

// 作者欄頁：<h3>分類</h3> ... <a href="/data/<aid>.html">title</a>
function parseAuthorColumnPage(html) {
  const cats = ['论文', '时评', '随笔', '著作', '演讲', '读书', '访谈', '未分类'];
  const positions = [];
  for (const cat of cats) {
    const re = new RegExp(`<h3>${cat}<\\/h3>`, 'g');
    let m;
    while ((m = re.exec(html)) !== null) positions.push({ cat, pos: m.index });
  }
  positions.sort((a, b) => a.pos - b.pos);
  positions.push({ cat: null, pos: html.length });

  const items = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const { cat, pos } = positions[i];
    const block = html.slice(pos, positions[i + 1].pos);
    const linkRe = /<a\s+href="\/data\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = linkRe.exec(block)) !== null) {
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      if (!title) continue;
      items.push({
        aid: m[1],
        url: `${BASE_URL}/data/${m[1]}.html`,
        title,
        category: cat,
      });
    }
  }
  return items;
}

// 用 depth tracking 從 HTML 切出 <div class="<className>">...</div> 完整內容
// 比依賴後續 list_page 容器更穩，0 結果時也能正確切到空容器。
function extractDivContent(html, className) {
  const startTag = `<div class="${className}">`;
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startTag.length;
  let i = contentStart;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const open  = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    if (close === -1) return null;
    if (open !== -1 && open < close) {
      depth++;
      i = open + 4;
    } else {
      depth--;
      if (depth === 0) return html.slice(contentStart, close);
      i = close + 6;
    }
  }
  return null;
}

// 搜尋結果：精確切 <div class="search_list">...</div>，避免 0 結果時誤抓側邊
function parseSearchResults(html) {
  const block = extractDivContent(html, 'search_list');
  if (block === null) return [];
  const items = [];
  const re = /href="\/data\/(\d+)\.html"[^>]*title="([^"]+)"/g;
  let mm;
  const seen = new Set();
  while ((mm = re.exec(block)) !== null) {
    if (seen.has(mm[1])) continue;
    seen.add(mm[1]);
    const raw = mm[2];
    const idx = raw.indexOf('：');
    const author = idx > 0 ? raw.slice(0, idx).trim() : '';
    const title  = idx > 0 ? raw.slice(idx + 1).trim() : raw.trim();
    items.push({
      aid: mm[1],
      url: `${BASE_URL}/data/${mm[1]}.html`,
      title,
      author,
    });
  }
  return items;
}

// zhuanti 頁面：連結沒 title="" 屬性，標題在 anchor 內文 <a>作者：標題</a>
function parseZhuantiArticles(html) {
  const m = html.match(/([\s\S]+?)<div class="list_page">/);
  const block = m ? m[1] : html;
  const items = [];
  const re = /<a\s+href="\/data\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g;
  const seen = new Set();
  let mm;
  while ((mm = re.exec(block)) !== null) {
    if (seen.has(mm[1])) continue;
    seen.add(mm[1]);
    const raw = mm[2].trim();
    const idx = raw.indexOf('：');
    const author = idx > 0 ? raw.slice(0, idx).trim() : '';
    const title  = idx > 0 ? raw.slice(idx + 1).trim() : raw;
    items.push({
      aid: mm[1],
      url: `${BASE_URL}/data/${mm[1]}.html`,
      title,
      author,
    });
  }
  return items;
}

// 從 list_page 區塊解析最大頁碼
function parseSearchTotalPages(html) {
  const m = html.match(/<div class="list_page">([\s\S]+?)<\/div>/);
  if (!m) return 1;
  const nums = [...m[1].matchAll(/page=(\d+)/g)].map((x) => +x[1]);
  return nums.length ? Math.max(...nums) : 1;
}

// 自動翻頁全抓。buildUrl(page) 回該頁 URL；parser 切 search 或 zhuanti 風格。
async function fetchAllSearchPages(buildUrl, parser = parseSearchResults) {
  const all = [];
  const seen = new Set();
  let totalPages = 1;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = buildUrl(page);
    process.stderr.write(`[info] fetching page ${page}${totalPages > 1 ? `/${totalPages}` : ''} ...\n`);
    const html = await fetchHtml(url);
    pagesFetched++;

    if (page === 1) totalPages = parseSearchTotalPages(html);

    const items = parser(html);
    const fresh = items.filter((it) => !seen.has(it.aid));

    if (fresh.length === 0) {
      process.stderr.write(`[info] page ${page} 無新項目，停止翻頁\n`);
      break;
    }

    for (const it of fresh) seen.add(it.aid);
    all.push(...fresh);

    if (page >= totalPages) break;
    await sleep(PAGE_DELAY_MS);
  }

  return { items: all, total_pages: totalPages, pages_fetched: pagesFetched };
}

// ───────────────────────── 高階：list / fetch 函式 ─────────────────────────

// list-author：站方作者清單兩跳；找不到 → not_found
export async function fetchAuthorArticles({ name, slug } = {}) {
  if (!name && !slug) throw new Error('需要 name 或 slug');

  let resolved;
  let chineseName = name;
  let usedSlug = slug;

  if (!usedSlug) {
    process.stderr.write('[info] fetching authors list from /thinktank/ ...\n');
    const authors = await fetchAuthorsList();
    const author = lookupAuthor(authors, name);
    if (!author) {
      return {
        status: 'not_found',
        site: 'aisixiang',
        mode: 'author',
        query: name,
        fetched_at: new Date().toISOString(),
        authors_count: authors.length,
        message:
          `"${name}" 不在愛思想專欄作者清單中（共 ${authors.length} 位）。` +
          `尚無此作者文章。` +
          `提醒：本技能不轉簡繁，呼叫端負責用站方登錄字形（通常是簡體）。`,
      };
    }
    usedSlug = author.slug;
    chineseName = chineseName || author.name;
    resolved = { slug: usedSlug, url: `${BASE_URL}/thinktank/${usedSlug}.html`, name: author.name };
  } else {
    resolved = { slug: usedSlug, url: `${BASE_URL}/thinktank/${usedSlug}.html` };
  }

  const html = await fetchHtml(resolved.url);
  const items = parseAuthorColumnPage(html);

  return {
    status: 'success',
    site: 'aisixiang',
    mode: 'author',
    query: chineseName || usedSlug,
    resolved,
    fetched_at: new Date().toISOString(),
    count: items.length,
    items,
  };
}

// list-keyword：keyword tag 搜尋；0 筆 → no_results
export async function fetchKeywordArticles(keyword) {
  if (!keyword) throw new Error('需要 keyword');
  const buildUrl = (page) =>
    `${BASE_URL}/data/search?searchfield=keywords&keywords=${encodeURIComponent(keyword)}&page=${page}`;
  const { items, total_pages, pages_fetched } = await fetchAllSearchPages(buildUrl);

  if (items.length === 0) {
    return {
      status: 'no_results',
      site: 'aisixiang',
      mode: 'keyword',
      query: keyword,
      resolved: { search_url: buildUrl(1) },
      fetched_at: new Date().toISOString(),
      count: 0,
      items: [],
      message:
        `關鍵字 "${keyword}" 在愛思想無相關文章。` +
        `提醒：站方搜尋只認簡體，呼叫端負責簡體化；若已是簡體仍 0 筆，該主題可能無 tag 索引。`,
    };
  }

  return {
    status: 'success',
    site: 'aisixiang',
    mode: 'keyword',
    query: keyword,
    resolved: { search_url: buildUrl(1), total_pages, pages_fetched },
    fetched_at: new Date().toISOString(),
    count: items.length,
    items,
  };
}

// list-title：標題模糊搜；0 筆 → no_results
export async function fetchTitleArticles(keyword) {
  if (!keyword) throw new Error('需要 keyword');
  const buildUrl = (page) =>
    `${BASE_URL}/data/search?searchfield=title&keywords=${encodeURIComponent(keyword)}&page=${page}`;
  const { items, total_pages, pages_fetched } = await fetchAllSearchPages(buildUrl);

  if (items.length === 0) {
    return {
      status: 'no_results',
      site: 'aisixiang',
      mode: 'title',
      query: keyword,
      resolved: { search_url: buildUrl(1) },
      fetched_at: new Date().toISOString(),
      count: 0,
      items: [],
      message:
        `標題關鍵字 "${keyword}" 在愛思想無相關文章。` +
        `提醒：站方搜尋只認簡體，呼叫端負責簡體化。`,
    };
  }

  return {
    status: 'success',
    site: 'aisixiang',
    mode: 'title',
    query: keyword,
    resolved: { search_url: buildUrl(1), total_pages, pages_fetched },
    fetched_at: new Date().toISOString(),
    count: items.length,
    items,
  };
}

// list-topic：策展主題兩跳；找不到 → not_a_topic
export async function fetchTopicArticles({ keyword, id } = {}) {
  if (!keyword && !id) throw new Error('需要 keyword 或 id');

  let topicId = id;
  let topicName = keyword;
  let resolved;

  if (!topicId) {
    process.stderr.write('[info] fetching topics list from /zhuanti/ ...\n');
    const topics = await fetchTopicsList();
    const hit = lookupTopic(topics, keyword);
    if (!hit) {
      return {
        status: 'not_a_topic',
        site: 'aisixiang',
        mode: 'topic',
        query: keyword,
        fetched_at: new Date().toISOString(),
        topics_count: topics.length,
        message:
          `"${keyword}" 不在愛思想策展主題清單中（共 ${topics.length} 個主題）。` +
          `建議改用 list-keyword --keyword "${keyword}" 查 keyword tag 結果。` +
          `本技能不自動轉向，請呼叫端決定是否重試。`,
      };
    }
    topicId = hit.id;
    topicName = hit.name;
    resolved = {
      id: topicId,
      name: hit.name,
      category: hit.category,
      url: `${BASE_URL}/zhuanti/${topicId}.html`,
    };
  } else {
    resolved = { id: topicId, url: `${BASE_URL}/zhuanti/${topicId}.html` };
  }

  const buildUrl = (page) => `${BASE_URL}/zhuanti/${topicId}.html?page=${page}`;
  const { items, total_pages, pages_fetched } =
    await fetchAllSearchPages(buildUrl, parseZhuantiArticles);

  return {
    status: 'success',
    site: 'aisixiang',
    mode: 'topic',
    query: topicName || topicId,
    resolved: { ...resolved, total_pages, pages_fetched },
    fetched_at: new Date().toISOString(),
    count: items.length,
    items,
  };
}

// fetch：抓單篇文章，回 markdown 字串（含 frontmatter）。不寫檔。
export async function fetchArticle({ aid, url } = {}) {
  const targetUrl = aid ? `${BASE_URL}/data/${aid}.html` : url;
  if (!targetUrl) throw new Error('需要 aid 或 url');

  const html = await fetchHtml(targetUrl);
  const titleRaw = extractTitle(html);
  const contentHtml = extractArticleContent(html);
  if (!titleRaw || !contentHtml) {
    throw new Error(`解析失敗：title=${!!titleRaw}, content=${!!contentHtml}`);
  }

  const body = htmlToMarkdown(contentHtml);
  // 去掉站名後綴：「葛兆光：禅宗与中国文化_爱思想」→「葛兆光：禅宗与中国文化」
  const title = titleRaw.replace(/[_\-\s]*(?:_)?(?:爱思想|愛思想)\s*$/u, '').trim();
  const today = new Date().toISOString().slice(0, 10);

  const markdown =
`---
title: "${title}"
source: "${targetUrl}"
author:
published:
created: ${today}
description:
---
${body}
`;

  return {
    status: 'success',
    site: 'aisixiang',
    mode: 'fetch',
    url: targetUrl,
    title,
    chars: body.length,
    markdown,
  };
}
