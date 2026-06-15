// 確定性依賴對帳：解析每支技能 scripts/*.mjs 的 npm import（含相對 import 跨技能鏈、靜態+動態），
// 對比其 SKILL.md 安裝指引宣告的套件，列出「碼需要但安裝指引沒列」的缺口。
// 注意：spawn/exec 委派（tw-stock spawn 子技能、dispatch-* 以 node 指令呼叫 run_cli）非 import，
// 不在此 import-tracing 範圍，另在報告手動標註。
import fs from 'fs'
import path from 'path'
const root = process.cwd()

const BUILTIN = new Set(['fs','path','url','child_process','os','crypto','http','https','stream','util','zlib','readline','events','string_decoder','assert','buffer','process','timers','net','tls','dns','querystring','module'])
function pkgOf(spec) {
  if (spec.startsWith('node:')) return null
  if (spec.startsWith('.') || spec.startsWith('/')) return null
  if (BUILTIN.has(spec)) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}
const reStatic = /import\s+(?:[\w*${}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g
const reDyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g

function scanFile(f, seen, pkgs) {
  if (seen.has(f) || !fs.existsSync(f)) return
  seen.add(f)
  const src = fs.readFileSync(f, 'utf8')
  for (const re of [reStatic, reDyn]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src))) {
      const spec = m[1]
      if (spec.startsWith('.')) {
        const r = path.resolve(path.dirname(f), spec)
        if (r.endsWith('.mjs')) scanFile(r, seen, pkgs)   // 跨技能/同技能相對 import 遞迴
      } else {
        const p = pkgOf(spec)
        if (p) pkgs.add(p)
      }
    }
  }
}

function neededPkgs(skill) {
  const dir = path.join(root, skill, 'scripts')
  const pkgs = new Set(), seen = new Set()
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.mjs') && !f.startsWith('test_')) scanFile(path.join(dir, f), seen, pkgs)
    }
  }
  return pkgs
}

function declaredPkgs(skill) {
  const md = path.join(root, skill, 'SKILL.md')
  const set = new Set()
  if (!fs.existsSync(md)) return set
  const src = fs.readFileSync(md, 'utf8')
  for (const m of src.matchAll(/npm (?:install|i)\b\s*(?:-g\s+)?([^\n`]+)/g)) {
    for (let tok of m[1].trim().split(/\s+/)) {
      tok = tok.replace(/[`,，、；;]/g, '').trim()
      if (tok && !tok.startsWith('-') && !tok.startsWith('#')) set.add(tok)
    }
  }
  // 所需套件：`a`、`b` 形式的反引號 token 也納入「已宣告」
  for (const m of src.matchAll(/所需(?:\s*npm)?\s*套件[^\n]*/g)) {
    for (const t of m[0].matchAll(/`([^`]+)`/g)) set.add(t[1].trim())
  }
  return set
}

const skills = fs.readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'SKILL.md')))
  .map(d => d.name).sort()

console.log('技能數:', skills.length, '\n--- 直接/相對-import 鏈的依賴缺口（碼需要但安裝指引未列）---')
let gapCount = 0
for (const s of skills) {
  const need = neededPkgs(s)
  if (need.size === 0) continue
  const decl = declaredPkgs(s)
  const missing = [...need].filter(p => !decl.has(p))
  if (missing.length) {
    gapCount++
    console.log(`⚠ ${s.padEnd(34)} 缺: ${missing.join(', ')}    (碼需:[${[...need].join(',')}] 宣告:[${[...decl].join(',')||'—'}])`)
  }
}
console.log(`\n依 import 鏈偵測到缺口的技能數: ${gapCount}`)
