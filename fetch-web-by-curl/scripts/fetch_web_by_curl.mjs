#!/usr/bin/env node
// fetch_web_by_curl.mjs — CLI 包裝
//
// 用法:
//   node fetch_web_by_curl.mjs <url> [outputPath]
//
// 行為：
//   - 有 outputPath  → 寫 JSON 檔，stdout 簡要 metadata
//   - 無 outputPath → 直接印 JSON 至 stdout
//   - 失敗 exit 1，成功 exit 0

import fs from 'node:fs';
import path from 'node:path';
import { fetchWebByCurl } from './fetchWebByCurl.mjs';

// Windows reserved-device-name guard
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(path.basename(p))) {
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write('Usage: node fetch_web_by_curl.mjs <url> [outputPath]\n');
  process.exit(1);
}

const [url, outputPath] = args;

(async () => {
  const result = await fetchWebByCurl(url);

  const payload = JSON.stringify(result, null, 2);

  if (outputPath) {
    try {
      _guardPath(outputPath);
      const dir = path.dirname(outputPath);
      if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, payload, 'utf-8');
      // metadata 摘要至 stdout
      const { html, ...meta } = result;
      console.log(JSON.stringify({ ...meta, output_path: outputPath }, null, 2));
    } catch (err) {
      process.stderr.write(`寫檔失敗：${err.message}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(payload + '\n');
  }

  process.exit(result.status === 'success' ? 0 : 1);
})();
