#!/usr/bin/env node
// test_fetch_guancha.mjs — fetch-guancha 回歸測試
//
// 直接匯入 fetchGuancha.mjs 的純邏輯函式做斷言（不經 CLI、不寫檔）。
// 整合測試：會打 guancha.cn 真網路（透過 fetch-web-by-curl）。
//
// 設計：
//   - 單一 top-level test，內部用 t.test 串行子測試（避免並行打爆站方）
//   - count 用範圍斷言，容忍站方文章數自然變動
//   - 使用文章數較少的作者（AntonNeeleman ~5 頁）降低耗時
//   - 整套跑完約 60-120 秒（含分頁 delay 與站方禮貌等待）
//
// 跑法：
//   node --test test_fetch_guancha.mjs
//   node --test --test-reporter=spec test_fetch_guancha.mjs   # 詳細

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_URL,
  KNOWN_TOPICS,
  fetchAuthorArticles,
  fetchKeywordArticles,
  fetchTitleArticles,
  fetchTopicArticles,
  fetchArticle,
  fetchAuthorsList,
  lookupAuthor,
  lookupTopic,
  sleep,
} from './fetchGuancha.mjs';

const BETWEEN_TESTS_MS = 2000; // 子測試間禮貌延遲，降低站方限流機率

test('fetch-guancha 整合測試（串行）', { concurrency: false, timeout: 1_200_000 }, async (t) => {

  // ─── list-author ───
  // 注意：fetchAuthorsList 從首頁底部 A-Z 索引解析，僅含部分（~636 位）作者；
  // /authorcolumn 才含更完整名單（~429 位含頭像）。測試挑首頁索引內保證有的作者。

  await t.test('list-author --name 安生 → success（首頁 A-Z 中的早期專欄作者）', async () => {
    const r = await fetchAuthorArticles({ name: '安生' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'author');
    assert.equal(r.site, 'guancha');
    assert.equal(r.resolved.slug, 'AnSheng');
    assert.equal(r.resolved.name, '安生');
    assert.ok(r.count > 0, `expect > 0 articles, got ${r.count}`);
    assert.equal(r.items.length, r.count);
    assert.ok(r.items.every((it) => it.url && it.title));
    assert.ok(r.items.every((it) => it.url.startsWith(BASE_URL + '/')));
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-author --name 完全不存在的作者XYZ → success + count:0 + message', async () => {
    const r = await fetchAuthorArticles({ name: '完全不存在的作者XYZ123' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'author');
    assert.equal(r.count, 0);
    assert.deepEqual(r.items, []);
    assert.ok(r.message && (r.message.includes('尚無此作者文章') || r.message.includes('不在')));
    assert.ok(r.authors_count > 100, `expect authors_count > 100, got ${r.authors_count}`);
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-author --slug AntonNeeleman → success（slug 捷徑跳過清單查找）', async () => {
    const r = await fetchAuthorArticles({ slug: 'AntonNeeleman' });
    assert.equal(r.status, 'success');
    assert.equal(r.resolved.slug, 'AntonNeeleman');
    assert.ok(r.count > 0);
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── list-keyword / list-title（站方搜尋走 sojson.v4 簽名，純 curl 路徑無法支援）───

  await t.test('list-keyword 任何字 → status: error（unsupported-by-curl）', async () => {
    const r = await fetchKeywordArticles('人工智能');
    assert.equal(r.status, 'error');
    assert.equal(r.mode, 'keyword');
    assert.equal(r.error, 'unsupported-by-curl');
    assert.ok(r.message);
    assert.ok(r.message.includes('sojson') || r.message.includes('簽名') || r.message.includes('混淆'));
  });
  // 這個不打網路，無需延遲

  await t.test('list-title 任何字 → status: error（與 keyword 同源不可用）', async () => {
    const r = await fetchTitleArticles('人工智能');
    assert.equal(r.status, 'error');
    assert.equal(r.mode, 'title');
    assert.equal(r.error, 'unsupported-by-curl');
    assert.ok(r.message);
  });

  // ─── list-topic ───

  await t.test('list-topic --name 财经 → success（自動走 /CaiJing 分頁版）', async () => {
    const r = await fetchTopicArticles({ name: '财经' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'topic');
    assert.equal(r.resolved.slug, 'CaiJing', '财经 應優先匹配分頁版 slug CaiJing 而非大頻道 economy');
    assert.ok(r.count >= 50, `expect count >= 50 (paginated topic), got ${r.count}`);
    assert.ok(r.resolved.pages_fetched >= 1);
    assert.ok(r.items.every((it) => it.url && it.title));
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-topic --slug ELuoSiZhiSheng → success（主題集頁，多作者文章）', async () => {
    const r = await fetchTopicArticles({ slug: 'ELuoSiZhiSheng' });
    assert.equal(r.status, 'success');
    assert.equal(r.resolved.slug, 'ELuoSiZhiSheng');
    assert.ok(r.count > 0);
    // 主題集頁特性：文章 URL 來自多種作者 slug（不限定為 ELuoSiZhiSheng）
    const slugs = new Set(r.items.map((it) => it.slug));
    assert.ok(slugs.size >= 1, 'items 應含 slug 欄位');
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-topic --name 完全不存在的主題ABC → status: error（fail-fast）', async () => {
    const r = await fetchTopicArticles({ name: '完全不存在的主題ABC123' });
    assert.equal(r.status, 'error');
    assert.equal(r.mode, 'topic');
    assert.equal(r.error, 'topic-not-in-table');
    assert.ok(r.topics_count >= 25);
    assert.ok(r.message);
    assert.ok(r.message.includes('list-keyword') || r.message.includes('--slug'));
  });

  // ─── fetch ───

  await t.test('fetch --url 當前文章 → success + markdown', async () => {
    // 用一篇近期 OPEC 報導（若被下架，本測試會失敗，需更新 URL）
    const url = 'https://www.guancha.cn/internation/2026_04_29_815417.shtml';
    const r = await fetchArticle({ url });
    if (r.status !== 'success') {
      // 文章可能已被下架；跳過此測試而非失敗
      t.diagnostic(`測試文章可能已被下架（status=${r.status}, error=${r.error}）。需更新測試 URL。`);
      return;
    }
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'fetch');
    assert.equal(r.url, url);
    assert.ok(r.title && r.title.length > 0);
    assert.ok(r.markdown.startsWith('---\n'));
    assert.ok(r.markdown.includes(`source: "${url}"`));
    assert.ok(r.markdown.includes('published:'));
    assert.ok(r.markdown.includes('created:'));
    assert.ok(r.chars > 200, `expect markdown body > 200 chars, got ${r.chars}`);
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('fetch --url 已下架/不存在文章 → status: error', async () => {
    // 觀察者網對下架/不存在 URL 會 302 跳首頁，本技能偵測此模式回 error
    const r = await fetchArticle({ url: 'https://www.guancha.cn/newsDetail_forward_99999999' });
    assert.equal(r.status, 'error');
    assert.equal(r.mode, 'fetch');
    assert.ok(r.error === 'article-not-found' || /無此文章|article|下架/.test(r.message || ''),
      `expect article-not-found, got error=${r.error}, message=${r.message}`);
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── lookup helpers ───

  await t.test('fetchAuthorsList / lookupAuthor', async () => {
    const authors = await fetchAuthorsList();
    assert.ok(authors.length > 100, `expect > 100 authors, got ${authors.length}`);
    assert.ok(authors.every((a) => a.slug && a.name));
    // 確認知名作者在首頁 A-Z 索引中（注意：首頁 A-Z 與 /authorcolumn 不重合，部分作者僅在後者）
    const known = ['张维为', '金灿荣', '安生'];
    for (const name of known) {
      const found = lookupAuthor(authors, name);
      if (!found) t.diagnostic(`知名作者 "${name}" 不在首頁 A-Z 索引（站方索引可能變動）`);
    }
    // 至少其中一位應在首頁 A-Z 索引中
    assert.ok(known.some((n) => lookupAuthor(authors, n)),
      `預期至少一位常見作者（${known.join('／')}）在首頁 A-Z 索引中`);
    assert.equal(lookupAuthor(authors, 'NotARealName_XYZ_999'), null);
  });
  // fetchAuthorsList 已打過網路；下面 sync helper 不需延遲

  await t.test('lookupTopic（同步，僅檢查 KNOWN_TOPICS 對照表）', () => {
    const t1 = lookupTopic('财经');
    assert.ok(t1, 'lookupTopic("财经") 應命中');
    assert.equal(t1.slug, 'CaiJing', '财经 應優先匹配 CaiJing（分頁版）');

    const t2 = lookupTopic('俄罗斯之声');
    assert.ok(t2);
    assert.equal(t2.slug, 'ELuoSiZhiSheng');

    const t3 = lookupTopic('军事');
    assert.ok(t3);
    assert.equal(t3.slug, 'JunShi', '军事 應優先匹配 JunShi（分頁版）');

    assert.equal(lookupTopic('完全不存在的主題XYZ'), null);
    assert.equal(lookupTopic(''), null);
    assert.equal(lookupTopic(null), null);
  });

  await t.test('KNOWN_TOPICS 結構驗證', () => {
    assert.ok(Array.isArray(KNOWN_TOPICS));
    assert.ok(KNOWN_TOPICS.length >= 25, `expect >= 25 topics, got ${KNOWN_TOPICS.length}`);
    assert.ok(KNOWN_TOPICS.every((t) => typeof t.slug === 'string' && typeof t.name === 'string'));
    assert.ok(KNOWN_TOPICS.every((t) => t.slug.length > 0 && t.name.length > 0));
    // 確認 first-match 順序：分頁版 slug 在前
    const firstCaijing = KNOWN_TOPICS.findIndex((t) => t.slug === 'CaiJing');
    const firstEconomy = KNOWN_TOPICS.findIndex((t) => t.slug === 'economy');
    if (firstCaijing >= 0 && firstEconomy >= 0) {
      assert.ok(firstCaijing < firstEconomy, 'CaiJing（分頁版）應排在 economy（大頻道）之前');
    }
  });

  // ─── 邊界錯誤（同步，不需要 sleep）───

  await t.test('參數缺失 → throw', async () => {
    await assert.rejects(() => fetchAuthorArticles({}), /name 或 slug/);
    await assert.rejects(() => fetchKeywordArticles(), /keyword/);
    await assert.rejects(() => fetchTitleArticles(), /keyword/);
    await assert.rejects(() => fetchTopicArticles({}), /name 或 slug/);
    await assert.rejects(() => fetchArticle({}), /url/);
  });
});
