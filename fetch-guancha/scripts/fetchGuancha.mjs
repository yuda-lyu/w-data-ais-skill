// fetchGuancha.mjs — 觀察者網（guancha.cn）抓取邏輯模組
//
// 純資料層：給輸入 → 回 payload 物件（list 模式）或 markdown 字串（fetch 模式）。
// 寫檔／argv 解析在 fetch_guancha.mjs 處理。
//
// 抓取層委派給同層 sibling 技能 fetch-web-by-curl 的 fetchWebByCurl 函式
//（其本身內建重試 5 次 + 線性退避 3-15s + 單次 15s 超時）。
//
// Exports:
//   常數：BASE_URL, USER_AGENT, PAGE_DELAY_MS, MAX_PAGES, KNOWN_TOPICS
//   工具：safeFilename, sleep
//   lookup：fetchAuthorsList, lookupAuthor, lookupTopic
//   高階：fetchAuthorArticles, fetchKeywordArticles, fetchTitleArticles,
//         fetchTopicArticles, fetchArticle

import { fetchWebByCurl } from '../../fetch-web-by-curl/scripts/fetchWebByCurl.mjs';

export const BASE_URL = 'https://www.guancha.cn';
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const PAGE_DELAY_MS = 1000;   // 頁間延遲
export const MAX_PAGES     = 50;     // 安全上限（50 頁 × 60 筆 = 3000 筆）

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── 已知主題對照表 ─────────────────────────
// 觀察者網無公開主題清單頁；本表為手工整理（從首頁專題標籤 + 大頻道 nav）。
// 未涵蓋者請傳 --slug 直接抓。
//
// 注意：對於同一個中文名有多個 slug（如「财经」對應大頻道 /economy 與分頁欄目 /CaiJing），
// **分頁欄目 slug 必須排在前面**，因為 lookupTopic 採 first-match。
// /economy 等大頻道是「精選首頁」不分頁；/CaiJing 等欄目才能 list_N.shtml 翻頁全抓。
export const KNOWN_TOPICS = [
  // 中文名重複者：分頁版 slug 在前，大頻道版 slug 用獨立中文名標記避免覆蓋
  { slug: 'CaiJing',                name: '财经' },              // 分頁版（首選）
  { slug: 'economy',                name: '财经-大頻道' },        // 大頻道精選首頁，不分頁
  { slug: 'JunShi',                 name: '军事' },              // 分頁版（首選）
  { slug: 'military-affairs',       name: '军事-大頻道' },        // 大頻道精選首頁，不分頁
  { slug: 'ZhengZhi',               name: '政治' },
  { slug: 'WenHua',                 name: '文化' },
  { slug: 'chanjing',               name: '产经' },
  { slug: 'qiche',                  name: '观出行' },
  { slug: 'gongye-keji',            name: '科技' },
  { slug: 'ChengShi',               name: '城事' },
  { slug: 'GuanJinRong',            name: '观金融' },
  { slug: 'XinShiDai',              name: '新时代' },
  { slug: 'ChaoJiGongCheng',        name: '超级工程' },
  { slug: 'NengYuanZhanLue',        name: '能源战略' },
  { slug: 'RenGongZhiNeng',         name: '人工智能' },
  { slug: 'XinZhiGuanChaSuoNews',   name: '心智观察所' },
  { slug: 'YiLangJuShi',            name: '伊朗局势' },
  { slug: 'MeiGuoMeng',             name: '美国一梦' },
  { slug: 'MeiGuoJingJi',           name: '美国经济' },
  { slug: 'ELuoSiZhiSheng',         name: '俄罗斯之声' },
  { slug: 'lianganyuanzhuopai',     name: '两岸圆桌派' },
  { slug: 'ZheJiuShiZhongGuo',      name: '这就是中国' },
  { slug: 'YiZhouJunQingGuanCha',   name: '一周军事观察' },
  { slug: 'feizhoushangkou',        name: '非洲之窗' },
  { slug: 'toutiao',                name: '观察者头条' },
  { slug: 'gushi',                  name: '股市' },
  { slug: 'guanwangwenyu',          name: '新潮观鱼' },
  { slug: 'jingtiriben',            name: '冲破战后秩序 日本想干什么' },
  { slug: 'DaoGuoDianAVI',          name: '日本' },
];

// ───────────────────────── HTTP wrapper ─────────────────────────

// 委派 fetch-web-by-curl，回原始 HTML；失敗拋例外
async function fetchHtml(url) {
  const r = await fetchWebByCurl(url, { userAgent: USER_AGENT, referer: BASE_URL });
  if (r.status !== 'success') {
    const err = new Error(r.message || 'fetch failed');
    err.reason = r.reason;
    err.url = url;
    err.httpCode = r.httpCode;
    throw err;
  }
  // 偵測「302 跳首頁」— 觀察者網對下架文章/不存在路徑會跳首頁
  // 首頁 title 是「观察者网」（無破折號）；文章頁 title 是具體標題
  // 用 final URL 比對更穩：若 r.url 與輸入 url 不一致且回到根域名，視為被 redirect
  return r.html;
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

// HTML → Markdown（regex 自製，類 fetch-aisixiang 的 htmlToMarkdown）
function htmlToMarkdown(html) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // 圖片：<img src="..." ... /> → ![](url)
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*\/?>/gi, (_, url) => `![](${url})`);
  // h1-6 → **粗體** 段落
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n**$1**\n\n');
  // strong / b
  s = s.replace(/<\/?(?:strong|b)\s*[^>]*>/gi, '**');
  // em / i
  s = s.replace(/<\/?(?:em|i)\s*[^>]*>/gi, '*');
  // br → 換行
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // a → [text](url)
  s = s.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
    const t = text.replace(/<[^>]+>/g, '').trim();
    return t ? `[${t}](${url})` : '';
  });
  // p → 換行
  s = s.replace(/<p[^>]*>/gi, '');
  s = s.replace(/<\/p>/gi, '\n\n');
  // 雜項容器：清空標籤
  s = s.replace(/<\/?(?:div|span|section|article|font|u)[^>]*>/gi, '');
  // 移除其他殘留 tag
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  // 行內空白標準化
  s = s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trimEnd()).join('\n');
  // 多重空行收斂
  s = s.replace(/\n{3,}/g, '\n\n').replace(/\*\*\s*\*\*/g, '');
  return s.trim();
}

// 從 HTML 抽 <title>...</title>
function extractHtmlTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

// 從 HTML 切出 <div class="content all-txt">...</div>（用 depth tracking）
function extractContentBlock(html) {
  const startTag = '<div class="content all-txt"';
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return null;
  // 找 startTag 對應的 > 結束位置
  const tagClose = html.indexOf('>', startIdx);
  if (tagClose === -1) return null;
  const contentStart = tagClose + 1;
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

// 從正文第一段抽作者署名：【文/觀察者網 XXX】 或 【文/觀察者網專欄作者 XXX，翻譯/ XXX】
function extractAuthorFromContent(contentHtml) {
  const m = contentHtml.match(/【([^】]{4,120})】/);
  if (!m) return null;
  // 去掉 HTML tag 與「文/」「翻譯/」前綴，僅留作者名
  const raw = m[1].replace(/<[^>]+>/g, '').trim();
  return raw;
}

// 從 HTML header 區抽發布時間：<span>YYYY-MM-DD HH:MM:SS</span>
function extractPubTime(html) {
  const m = html.match(/<span[^>]*>(20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})<\/span>/);
  return m ? m[1] : null;
}

export function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

// ───────────────────────── 解析器 ─────────────────────────

// 從首頁底部 <dl><dt>X</dt><dd>...</dd></dl> 抽取所有作者中文名→slug 對照
function parseAuthorIndex(html) {
  const flat = html.replace(/\n/g, ' ');
  const items = [];
  const seen = new Set();
  // <dt>X</dt> ... <dd>...</dd>
  const dlBlocks = [...flat.matchAll(/<dt>([A-Z])<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  for (const [, letter, body] of dlBlocks) {
    const linkRe = /<a[^>]+href="(?:\.\.\/|\/)?([A-Za-z][a-zA-Z0-9_-]+)\/list_1\.shtml"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = linkRe.exec(body)) !== null) {
      const slug = m[1];
      const name = decodeEntities(m[2]).trim();
      if (!name || seen.has(slug)) continue;
      seen.add(slug);
      items.push({ slug, name, letter });
    }
  }
  return items;
}

// 從 /<slug>/list_<N>.shtml 抽取該頁的文章列表
// 文章連結模式：href="/<某 slug>/<YYYY_MM_DD>_<id>.shtml" 後面接著標題（透過 title="" 或 inner text）
//
// 注意：列頁 slug 與文章 URL slug 通常不同：
//   - 作者頁 /ZhangWeiWei/list_N.shtml → 文章 URL 也是 /ZhangWeiWei/<date>_<id>.shtml（同 slug）
//   - 主題集頁 /ELuoSiZhiSheng/list_N.shtml → 文章 URL 用各自作者 slug（如 /AlexanderDugin/...）
//   - 欄目頁 /CaiJing/list_N.shtml → 文章 URL 用大頻道 slug（如 /economy/...）
// 所以 parseListPage **不限定**文章 URL 的 slug，抽出所有符合 .shtml 模式的連結。
function parseListPage(html, _listSlug) {
  const flat = html.replace(/\n/g, ' ');
  const items = [];
  const seen = new Set();
  // 抓任意 /<slug>/<date>_<id>.shtml；slug 至少 2 字元，date 為 YYYY_MM_DD
  const linkRe = /<a[^>]+href="\/([A-Za-z][a-zA-Z0-9_-]+)\/(\d{4}_\d{2}_\d{2}_\d+)\.shtml"(?:[^>]*title="([^"]+)")?[^>]*>([^<]*)<\/a>/g;
  let m;
  while ((m = linkRe.exec(flat)) !== null) {
    const articleSlug = m[1];
    const dateId = m[2];
    const titleAttr = m[3] && decodeEntities(m[3]).trim();
    const inner = m[4] && decodeEntities(m[4]).replace(/<[^>]+>/g, '').trim();
    const title = titleAttr || inner || '';
    const key = `${articleSlug}/${dateId}`;
    if (seen.has(key)) continue;
    if (!title) continue;
    seen.add(key);
    const url = `${BASE_URL}/${articleSlug}/${dateId}.shtml`;
    items.push({ url, title, slug: articleSlug });
  }
  return items;
}

// ───────────────────────── lookups (stateless) ─────────────────────────

// 抓首頁 → 解析 A-Z 作者索引
export async function fetchAuthorsList() {
  const html = await fetchHtml(`${BASE_URL}/`);
  return parseAuthorIndex(html);
}

export function lookupAuthor(authors, name) {
  if (!name) return null;
  return authors.find((a) => a.name === name) || null;
}

export function lookupTopic(name) {
  if (!name) return null;
  return KNOWN_TOPICS.find((t) => t.name === name) || null;
}

// ───────────────────────── 高階：list / fetch 函式 ─────────────────────────

// 自動翻頁全抓 /<slug>/list_N.shtml；slug 適用於作者頁／欄目頁／主題集頁
async function fetchAllListPages(slug) {
  const all = [];
  const seen = new Set();
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE_URL}/${slug}/list_${page}.shtml`;
    process.stderr.write(`[info] fetching ${slug} list_${page} ...\n`);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      // 翻頁失敗：第 1 頁失敗即拋；後續頁失敗視為到底
      if (page === 1) throw e;
      process.stderr.write(`[info] page ${page} fetch error (assumed end of list): ${e.message}\n`);
      break;
    }
    pagesFetched++;

    const items = parseListPage(html, slug);
    const fresh = items.filter((it) => !seen.has(it.url));

    if (fresh.length === 0) {
      process.stderr.write(`[info] page ${page} 無新項目，停止翻頁\n`);
      break;
    }

    for (const it of fresh) seen.add(it.url);
    all.push(...fresh);

    if (page < MAX_PAGES) await sleep(PAGE_DELAY_MS);
  }

  return { items: all, pages_fetched: pagesFetched };
}

// list-author：先查 A-Z 索引，再翻頁全抓
export async function fetchAuthorArticles({ name, slug } = {}) {
  if (!name && !slug) throw new Error('需要 name 或 slug');

  let resolvedSlug = slug;
  let resolvedName = name;
  let url;

  if (!resolvedSlug) {
    // 中文名 → slug
    process.stderr.write('[info] fetching authors index from / ...\n');
    const authors = await fetchAuthorsList();
    const author = lookupAuthor(authors, name);
    if (!author) {
      // 「真的沒這位作者」→ success + count: 0（按全庫 binary contract）
      return {
        status: 'success',
        site: 'guancha',
        mode: 'author',
        query: name,
        fetched_at: new Date().toISOString(),
        authors_count: authors.length,
        count: 0,
        items: [],
        message:
          `"${name}" 不在觀察者網作者索引中（共 ${authors.length} 位）。尚無此作者文章。` +
          `提醒：本技能不轉繁簡，呼叫端負責用站方登錄字形（簡體）。`,
      };
    }
    resolvedSlug = author.slug;
    resolvedName = author.name;
  }

  url = `${BASE_URL}/${resolvedSlug}`;

  let listResult;
  try {
    listResult = await fetchAllListPages(resolvedSlug);
  } catch (e) {
    return {
      status: 'error',
      site: 'guancha',
      mode: 'author',
      query: resolvedName || resolvedSlug,
      resolved: { slug: resolvedSlug, url, name: resolvedName },
      fetched_at: new Date().toISOString(),
      error: e.message,
    };
  }

  return {
    status: 'success',
    site: 'guancha',
    mode: 'author',
    query: resolvedName || resolvedSlug,
    resolved: { slug: resolvedSlug, url, name: resolvedName, pages_fetched: listResult.pages_fetched },
    fetched_at: new Date().toISOString(),
    count: listResult.items.length,
    items: listResult.items,
  };
}

// list-keyword：站方 search-v2 走 sojson.v4 簽名，純 curl 不支援
export async function fetchKeywordArticles(keyword) {
  if (!keyword) throw new Error('需要 keyword');
  return {
    status: 'error',
    site: 'guancha',
    mode: 'keyword',
    query: keyword,
    fetched_at: new Date().toISOString(),
    error: 'unsupported-by-curl',
    message:
      `觀察者網搜尋 API（s.guancha.cn/main/search-v2）由 sojson.v4 混淆並走 MD5 簽名，` +
      `本技能（純 curl 路徑）無法支援。` +
      `如已知作者拼音 slug，請改用 list-author --slug；如已知主題 slug，請改用 list-topic --slug。`,
  };
}

// list-title：站方無分標題與全文搜尋，與 list-keyword 同源
export async function fetchTitleArticles(keyword) {
  if (!keyword) throw new Error('需要 keyword');
  return {
    status: 'error',
    site: 'guancha',
    mode: 'title',
    query: keyword,
    fetched_at: new Date().toISOString(),
    error: 'unsupported-by-curl',
    message:
      `觀察者網無分「標題」與「全文」搜尋（兩者同源），` +
      `搜尋 API 由 sojson.v4 混淆並走 MD5 簽名，本技能（純 curl 路徑）無法支援。` +
      `如已知作者拼音 slug，請改用 list-author --slug。`,
  };
}

// list-topic：先查 KNOWN_TOPICS，命中則翻頁；不命中 fail-fast
export async function fetchTopicArticles({ name, slug } = {}) {
  if (!name && !slug) throw new Error('需要 name 或 slug');

  let resolvedSlug = slug;
  let resolvedName = name;
  let url;

  if (!resolvedSlug) {
    const topic = lookupTopic(name);
    if (!topic) {
      // 不命中對照表 → fail-fast，建議改 list-keyword
      return {
        status: 'error',
        site: 'guancha',
        mode: 'topic',
        query: name,
        fetched_at: new Date().toISOString(),
        topics_count: KNOWN_TOPICS.length,
        error: 'topic-not-in-table',
        message:
          `主題 "${name}" 不在已知主題對照表中（共 ${KNOWN_TOPICS.length} 個）。` +
          `觀察者網無公開主題清單頁，本技能採手工對照。建議：(a) 直接傳 --slug <拼音 slug>；(b) 改用 list-keyword 查關鍵字（注：list-keyword 目前因簽名混淆同樣不可用，呼叫端 agent 自行決定）。` +
          `本技能不自動轉向，請呼叫端決定是否重試。`,
      };
    }
    resolvedSlug = topic.slug;
    resolvedName = topic.name;
  }

  url = `${BASE_URL}/${resolvedSlug}`;

  let listResult;
  try {
    listResult = await fetchAllListPages(resolvedSlug);
  } catch (e) {
    return {
      status: 'error',
      site: 'guancha',
      mode: 'topic',
      query: resolvedName || resolvedSlug,
      resolved: { slug: resolvedSlug, url, name: resolvedName },
      fetched_at: new Date().toISOString(),
      error: e.message,
    };
  }

  return {
    status: 'success',
    site: 'guancha',
    mode: 'topic',
    query: resolvedName || resolvedSlug,
    resolved: { slug: resolvedSlug, url, name: resolvedName, pages_fetched: listResult.pages_fetched },
    fetched_at: new Date().toISOString(),
    count: listResult.items.length,
    items: listResult.items,
  };
}

// fetch：抓單篇文章 → markdown 字串（含 frontmatter）
export async function fetchArticle({ url } = {}) {
  if (!url) throw new Error('需要 url');

  let html;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    return {
      status: 'error',
      site: 'guancha',
      mode: 'fetch',
      url,
      fetched_at: new Date().toISOString(),
      error: e.message || 'fetch failed',
    };
  }

  // 偵測「文章下架被 302 跳首頁」：title 為單純「观察者网」且找不到 content all-txt 區塊
  const titleRaw = extractHtmlTitle(html) || '';
  const contentBlock = extractContentBlock(html);
  if (titleRaw === '观察者网' || titleRaw === '觀察者網' || !contentBlock) {
    return {
      status: 'error',
      site: 'guancha',
      mode: 'fetch',
      url,
      fetched_at: new Date().toISOString(),
      error: 'article-not-found',
      message: `無此文章（title="${titleRaw}"，可能已下架或 URL 不正確）。`,
    };
  }

  const title = titleRaw.trim();
  const author = extractAuthorFromContent(contentBlock) || '';
  const pubTime = extractPubTime(html) || '';
  const created = new Date().toISOString().slice(0, 10);
  const body = htmlToMarkdown(contentBlock);

  // YAML frontmatter（雙引號 escape 內含雙引號）
  const yamlEscape = (s) => String(s).replace(/"/g, '\\"');
  const markdown =
`---
title: "${yamlEscape(title)}"
source: "${url}"
author: "${yamlEscape(author)}"
published: "${pubTime}"
created: ${created}
description:
---
${body}
`;

  return {
    status: 'success',
    site: 'guancha',
    mode: 'fetch',
    url,
    title,
    author,
    published: pubTime,
    chars: body.length,
    markdown,
  };
}
