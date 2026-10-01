#!/usr/bin/env node
// fetch_aisixiang.mjs — 愛思想（aisixiang.com）抓取 CLI
//
// 這個檔案只負責：argv 解析 → 調用 fetchAisixiang.mjs → 寫檔 → exit
// 邏輯／HTTP／HTML 解析全在 fetchAisixiang.mjs。
//
// 用法：
//   node fetch_aisixiang.mjs list-author       --name <中文名> | --slug <pinyin> [--output <path>]
//   node fetch_aisixiang.mjs list-keyword      --keyword <主題詞>                [--output <path>]
//   node fetch_aisixiang.mjs list-title        --keyword <關鍵字>                [--output <path>]
//   node fetch_aisixiang.mjs list-topic        --keyword <主題名> | --id <ID>    [--output <path>]
//   node fetch_aisixiang.mjs fetch             --aid <id> | --url <url> [--output-dir <dir>]
//
// 輸出（一律寫檔，stdout 印 JSON 結果含 output_path）：
//   list-* → JSON 索引檔
//   fetch  → Markdown 檔（檔名 = <title>.md，frontmatter + 正文）

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import {
  fetchAuthorArticles,
  fetchKeywordArticles,
  fetchTitleArticles,
  fetchTopicArticles,
  fetchArticle,
  safeFilename,
} from './fetchAisixiang.mjs';

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(basename(p)))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

// ───────────────────────── argv ─────────────────────────

function parseArgs(argv) {
  const subcmd = argv[2];
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return { subcmd, opts };
}

// ───────────────────────── output writer ─────────────────────────

function defaultListOutputPath(mode, query) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe = safeFilename(String(query || 'unknown')).slice(0, 40);
  return `aisixiang_${mode}_${safe}_${today}.json`;
}

async function writeJsonOutput(payload, opts) {
  const outPath = opts.output || defaultListOutputPath(payload.mode, payload.query);
  _guardPath(outPath);
  const dir = dirname(outPath);
  if (dir && dir !== '.') await mkdir(dir, { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  return outPath;
}

async function writeMarkdownOutput(payload, opts) {
  const outDir = opts['output-dir'] || '.';
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, safeFilename(`${payload.title}.md`));
  _guardPath(outPath);
  await writeFile(outPath, payload.markdown, 'utf-8');
  return outPath;
}

// ───────────────────────── dispatch ─────────────────────────

// 確認必要選項是字串（防止 `--key`（無值）被 parseArgs 設為 boolean true 後送進核心函式）
function _requireString(opts, key) {
  const v = opts[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new Error(`--${key} 需要字串值，請改傳「--${key} <值>」`);
  }
  return v;
}

async function dispatch(subcmd, opts) {
  switch (subcmd) {
    case 'list-author':
      return fetchAuthorArticles({
        name: _requireString(opts, 'name'),
        slug: _requireString(opts, 'slug'),
      });
    case 'list-keyword':
      return fetchKeywordArticles(_requireString(opts, 'keyword'));
    case 'list-title':
      return fetchTitleArticles(_requireString(opts, 'keyword'));
    case 'list-topic':
      return fetchTopicArticles({
        keyword: _requireString(opts, 'keyword'),
        id: _requireString(opts, 'id'),
      });
    case 'fetch':
      return fetchArticle({
        aid: _requireString(opts, 'aid'),
        url: _requireString(opts, 'url'),
      });
    default:
      throw new Error(`未知 subcommand: ${subcmd}`);
  }
}

// ───────────────────────── main ─────────────────────────

function printUsage() {
  process.stderr.write(
    'Usage:\n' +
    '  fetch_aisixiang.mjs list-author    --name <中文名> | --slug <pinyin> [--output <path>]\n' +
    '  fetch_aisixiang.mjs list-keyword   --keyword <主題詞> [--output <path>]\n' +
    '  fetch_aisixiang.mjs list-title     --keyword <關鍵字> [--output <path>]\n' +
    '  fetch_aisixiang.mjs list-topic     --keyword <主題名> | --id <ID> [--output <path>]\n' +
    '  fetch_aisixiang.mjs fetch          --aid <id> | --url <url> [--output-dir <dir>]\n'
  );
}

async function main() {
  const { subcmd, opts } = parseArgs(process.argv);

  if (!subcmd || subcmd === '-h' || subcmd === '--help') {
    printUsage();
    process.exit(1);
  }

  try {
    const payload = await dispatch(subcmd, opts);

    let outPath;
    if (subcmd === 'fetch' && payload.status === 'success') {
      outPath = await writeMarkdownOutput(payload, opts);
      // markdown 字串不必印回 stdout，太大；只回 metadata
      const { markdown, ...meta } = payload;
      console.log(JSON.stringify({ ...meta, output_path: outPath }, null, 2));
    } else {
      outPath = await writeJsonOutput(payload, opts);
      console.log(JSON.stringify({ ...payload, output_path: outPath }, null, 2));
    }
    process.exit(0);
  } catch (err) {
    const errPayload = {
      status: 'error',
      site: 'aisixiang',
      mode: subcmd,
      error: err.message,
      fetched_at: new Date().toISOString(),
    };
    const outPath = opts.output || `aisixiang_error_${Date.now()}.json`;
    try {
      _guardPath(outPath);
      const dir = dirname(outPath);
      if (dir && dir !== '.') await mkdir(dir, { recursive: true });
      await writeFile(outPath, JSON.stringify(errPayload, null, 2), 'utf-8');
    } catch {}
    process.stderr.write(`[error] ${err.message}\n[info]  details: ${outPath}\n`);
    process.exit(1);
  }
}

main();
