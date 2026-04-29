#!/usr/bin/env node
// test_fetch_aisixiang.mjs — fetch-aisixiang 回歸測試
//
// 直接匯入 fetchAisixiang.mjs 的純邏輯函式做斷言（不經 CLI、不寫檔）。
// 整合測試：會打 aisixiang.com 網路。
//
// 設計：
//   - 單一 top-level test，內部用 t.test 串行子測試（避免並行打爆站方限流）
//   - count 用範圍斷言，容忍站方文章數自然變動
//   - 整套跑完約 30-60 秒（含分頁 delay 與站方禮貌等待）
//
// 跑法：
//   node --test test_fetch_aisixiang.mjs
//   node --test --test-reporter=spec test_fetch_aisixiang.mjs   # 詳細

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchAuthorArticles,
  fetchKeywordArticles,
  fetchTitleArticles,
  fetchTopicArticles,
  fetchArticle,
  fetchAuthorsList,
  fetchTopicsList,
  lookupAuthor,
  lookupTopic,
  sleep,
} from './fetchAisixiang.mjs';

const BETWEEN_TESTS_MS = 2000; // 子測試間禮貌延遲，降低 429 機率

test('fetch-aisixiang 整合測試（串行）', { concurrency: false, timeout: 600_000 }, async (t) => {

  // ─── list-author ───

  await t.test('list-author --name 葛兆光 → success（A 類，分類齊全）', async () => {
    const r = await fetchAuthorArticles({ name: '葛兆光' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'author');
    assert.equal(r.site, 'aisixiang');
    assert.equal(r.resolved.slug, 'gezhaoguang');
    assert.equal(r.resolved.name, '葛兆光');
    assert.ok(r.count > 50, `expect > 50 articles, got ${r.count}`);
    assert.equal(r.items.length, r.count);
    assert.ok(r.items.some((it) => it.category === '论文'));
    assert.ok(r.items.every((it) => it.aid && it.url && it.title));
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-author --name 楊儒賓 → not_found（繁體不在簡體清單）', async () => {
    const r = await fetchAuthorArticles({ name: '楊儒賓' });
    assert.equal(r.status, 'not_found');
    assert.equal(r.mode, 'author');
    assert.ok(r.authors_count > 500);
    assert.ok(r.message.includes('尚無'));
    assert.ok(r.message.includes('簡繁'));
    assert.ok(!('items' in r), 'not_found 不應帶 items');
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-author --slug gezhaoguang → success（slug 捷徑）', async () => {
    const r = await fetchAuthorArticles({ slug: 'gezhaoguang' });
    assert.equal(r.status, 'success');
    assert.equal(r.resolved.slug, 'gezhaoguang');
    assert.ok(r.count > 50);
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── list-keyword ───

  await t.test('list-keyword --keyword 老庄 → success（簡體有命中）', async () => {
    const r = await fetchKeywordArticles('老庄');
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'keyword');
    assert.ok(r.count >= 5, `expect >= 5, got ${r.count}`);
    assert.ok(r.items[0].aid);
    assert.ok(r.resolved.search_url.includes('searchfield=keywords'));
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-keyword --keyword 老莊 → no_results（繁體 0 命中，parser 不誤抓側邊）', async () => {
    const r = await fetchKeywordArticles('老莊');
    assert.equal(r.status, 'no_results');
    assert.equal(r.count, 0);
    assert.equal(r.items.length, 0);
    assert.ok(r.message.includes('無相關文章'));
    assert.ok(r.message.includes('簡體'));
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── list-title ───

  await t.test('list-title --keyword 禅宗与中国文化 → success（精準標題搜，少頁）', async () => {
    const r = await fetchTitleArticles('禅宗与中国文化');
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'title');
    assert.ok(r.count >= 1);
    assert.ok(r.resolved.search_url.includes('searchfield=title'));
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── list-topic ───

  await t.test('list-topic --keyword 大数据 → success（多頁分頁全抓）', async () => {
    const r = await fetchTopicArticles({ keyword: '大数据' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'topic');
    assert.equal(r.resolved.id, '301');
    assert.equal(r.resolved.name, '大数据');
    assert.equal(r.resolved.category, '学科');
    assert.ok(r.resolved.total_pages >= 2);
    assert.equal(r.resolved.pages_fetched, r.resolved.total_pages);
    assert.ok(r.count >= 50);
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-topic --keyword 老莊 → not_a_topic（建議改 list-keyword）', async () => {
    const r = await fetchTopicArticles({ keyword: '老莊' });
    assert.equal(r.status, 'not_a_topic');
    assert.equal(r.mode, 'topic');
    assert.ok(r.topics_count > 500);
    assert.ok(r.message.includes('list-keyword'));
    assert.ok(!('items' in r));
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('list-topic --id 301 → success（id 捷徑）', async () => {
    const r = await fetchTopicArticles({ id: '301' });
    assert.equal(r.status, 'success');
    assert.equal(r.resolved.id, '301');
    assert.ok(r.count >= 50);
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── fetch ───

  await t.test('fetch --aid 146669 → success（單篇 → markdown）', async () => {
    const r = await fetchArticle({ aid: '146669' });
    assert.equal(r.status, 'success');
    assert.equal(r.mode, 'fetch');
    assert.equal(r.url, 'https://www.aisixiang.com/data/146669.html');
    assert.ok(r.title.includes('禅宗'));
    assert.ok(!r.title.includes('爱思想'));
    assert.ok(!r.title.includes('愛思想'));
    assert.ok(r.markdown.startsWith('---\n'));
    assert.ok(r.markdown.includes('source: "https://www.aisixiang.com/data/146669.html"'));
    assert.ok(r.markdown.includes('禅宗'));
    assert.ok(r.chars > 1000);
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('fetch --url → success（alternate 入口）', async () => {
    const r = await fetchArticle({ url: 'https://www.aisixiang.com/data/146669.html' });
    assert.equal(r.status, 'success');
    assert.equal(r.url, 'https://www.aisixiang.com/data/146669.html');
    assert.ok(r.markdown.length > 1000);
  });
  await sleep(BETWEEN_TESTS_MS);

  // ─── lookup helpers ───

  await t.test('fetchAuthorsList / lookupAuthor', async () => {
    const authors = await fetchAuthorsList();
    assert.ok(authors.length > 500);
    assert.ok(authors.every((a) => a.slug && a.name));
    assert.ok(lookupAuthor(authors, '葛兆光'));
    assert.equal(lookupAuthor(authors, '楊儒賓'), null);
    assert.equal(lookupAuthor(authors, 'NotARealName_XYZ'), null);
  });
  await sleep(BETWEEN_TESTS_MS);

  await t.test('fetchTopicsList / lookupTopic', async () => {
    const topics = await fetchTopicsList();
    assert.ok(topics.length > 500);
    assert.ok(topics.every((t) => t.id && t.name));
    assert.ok(['学科', '事件', '人物'].includes(topics[0].category));
    const dataBig = lookupTopic(topics, '大数据');
    assert.ok(dataBig);
    assert.equal(dataBig.id, '301');
    assert.equal(dataBig.category, '学科');
    assert.equal(lookupTopic(topics, '老莊'), null);
  });

  // ─── 邊界錯誤（同步，不需要 sleep）───

  await t.test('參數缺失 → throw', async () => {
    await assert.rejects(() => fetchAuthorArticles({}), /name 或 slug/);
    await assert.rejects(() => fetchKeywordArticles(), /keyword/);
    await assert.rejects(() => fetchTitleArticles(), /keyword/);
    await assert.rejects(() => fetchTopicArticles({}), /keyword 或 id/);
    await assert.rejects(() => fetchArticle({}), /aid 或 url/);
  });
});
