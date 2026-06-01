// 確定性全庫審計（機械可驗維度）。同輸入必同輸出、可重跑當回歸檢查。
// 用法（從技能庫根目錄）：node _audit/audit_deterministic.mjs
// 啟發式已收緊以降低誤命中（見各 dim 註解）；仍 flag 的請人工 eyeball 確認。
import fs from 'fs'
import path from 'path'
const root = process.cwd()
const skills = fs.readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'SKILL.md'))).map(d => d.name).sort()

const md = s => fs.readFileSync(path.join(root, s, 'SKILL.md'), 'utf8')
function codes(s) {
  const dir = path.join(root, s, 'scripts')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.startsWith('test_'))
    .map(f => ({ f: path.basename(f), src: fs.readFileSync(path.join(dir, f), 'utf8') }))
}

const flags = { d4: [], d7: [], d8: [], d9: [], d10: [], d12: [] }
for (const s of skills) {
  const M = md(s), C = codes(s), allCode = C.map(c => c.src).join('\n')

  // dim4 機密硬編（排除 placeholder / env）
  for (const c of C) {
    const re = /(api[_-]?key|secret|token|passwd|password|client[_-]?secret|bearer)\s*[:=]\s*['"]([^'"]{8,})['"]/ig
    let m; while ((m = re.exec(c.src))) {
      if (/your_|xxx|example|placeholder|<|\$\{|here|change|replace|dummy/i.test(m[2])) continue
      flags.d4.push(`${s} :: ${m[1]}='${m[2].slice(0, 24)}' @${c.f}`)
    }
  }
  // dim7 有安裝指引但缺標記
  if (/安裝指引/.test(M) && !M.includes('[執行AI須先依照技能內說明安裝指定依賴之套件]')) flags.d7.push(s)
  // dim8 強制執行目錄字眼（排除負面語境，如「不寫到/不污染 技能庫根目錄」屬善意說明）
  for (const m of M.matchAll(/技能庫根目錄|從[^\n。]{0,8}根目錄[^\n。]{0,6}執行|must (?:be )?run from|請\s*cd\s+到/g)) {
    const pre = M.slice(Math.max(0, m.index - 10), m.index)
    if (/[不非別勿]|避免|不要|不寫|不污染/.test(pre)) continue
    flags.d8.push(`${s} :: ...${pre}${m[0]}`)
  }
  // dim9 有「重試 N 次」但全篇無「含初始」
  if (/(最多(?:重試|執行)?\s*\d+\s*次|重試\s*\d+\s*次)/.test(M) && !/含初始/.test(M)) flags.d9.push(s)
  // dim10 有 fs 寫檔但無 nul/保留名 guard
  if (/\b(writeFileSync|writeFile|createWriteStream|appendFileSync)\b/.test(allCode) &&
      !/_WIN_RESERVED_RE|保留裝置名|reserved|con\|prn\|aux\|nul/i.test(allCode)) flags.d10.push(s)
  // dim12 wmic（排除註解行）/ child_process 無 windowsHide
  //   以「是否 import child_process」為準，避免誤命中 regex 的 .exec()（regex.exec 非 child_process）
  for (const c of C) for (const line of c.src.split('\n')) {
    if (/\bwmic\b/i.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) flags.d12.push(`${s} :: wmic(非註解) @${c.f}: ${line.trim().slice(0, 50)}`)
  }
  const usesCP = /['"](?:node:)?child_process['"]/.test(allCode)
  if (usesCP && !/windowsHide/.test(allCode)) flags.d12.push(`${s} :: import child_process 但無 windowsHide`)
}
const names = { d4: 'dim4 機密硬編', d7: 'dim7 安裝標記', d8: 'dim8 強制目錄', d9: 'dim9 重試n+1', d10: 'dim10 nul guard', d12: 'dim12 wmic/windowsHide' }
let total = 0
for (const k of Object.keys(flags)) {
  total += flags[k].length
  console.log(`[${names[k]}] ${flags[k].length === 0 ? '✅ PASS' : '⚠ ' + flags[k].length}`)
  for (const x of flags[k]) console.log('   - ' + x)
}
console.log(`\n總 flag: ${total}（0 = 全部確定性維度通過）`)
