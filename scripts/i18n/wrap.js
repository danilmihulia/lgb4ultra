// i18n helper for our TV apps (hub, browser, «Канали», «Файли», saver).
// Finds Ukrainian UI text in the inline <script> of an app's HTML (string literals with Cyrillic; comments skipped),
// wraps each literal as L('…') and collects every UI string (JS literals + static markup text/attributes) into a
// source dictionary i18n/<app>/uk.json (key = Ukrainian text). Translations live next to it: i18n/<app>/<lang>.json.
//
//   node scripts/i18n/wrap.js <file.html> <appName> --scan     report only (counts, template literals, odd cases)
//   node scripts/i18n/wrap.js <file.html> <appName> --wrap     rewrite the file in place + write i18n/<app>/uk.json
//
// Runtime side (in each app): L(s) = DICT[s] || s; static markup is translated once at start (text nodes, placeholder,
// title). Strings that are built by concatenation are translated per fragment.
'use strict';
const fs = require('fs'), path = require('path');
const [file, app, mode] = process.argv.slice(2);
if (!file || !app || !/^--(scan|wrap)$/.test(mode || '')) { console.error('usage: wrap.js <file.html> <app> --scan|--wrap'); process.exit(1); }
const CYR = /[А-Яа-яЇїІіЄєҐґ]/;
const src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n');
const text = src.replace(/\r\n/g, '\n');

// ---- locate inline scripts ----
const scripts = [];
{ const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(text))) { if (/\ssrc=/.test(m[1] || '')) continue; const start = m.index + m[0].indexOf('>') + 1; scripts.push([start, start + m[2].length]); } }

// ---- JS tokenizer: finds string literals (with positions), skipping comments / regex literals ----
const KW = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
function scanJs(s, from, to, out) {
  let i = from, prevSig = '', prevWord = '';
  function isRegexStart() {
    if (!prevSig) return true;
    if (/[(,=:\[!&|?{};+\-*%<>~^]/.test(prevSig)) return true;
    return KW.has(prevWord);
  }
  while (i < to) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < to && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? to : e + 2; continue; }
    if (c === '\'' || c === '"') {
      const st = i; i++;
      while (i < to && s[i] !== c) { if (s[i] === '\\') i++; i++; }
      i++; out.push({ kind: 'str', start: st, end: i, q: c, raw: s.slice(st + 1, i - 1) });
      prevSig = c; prevWord = ''; continue;
    }
    if (c === '`') {
      const st = i; i++; let hasExpr = false;
      while (i < to && s[i] !== '`') {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') { hasExpr = true; let d = 1; i += 2; const inner = [];
          const exprStart = i;
          while (i < to && d > 0) { if (s[i] === '{') d++; else if (s[i] === '}') d--; if (d > 0) i++; }
          scanJs(s, exprStart, i, inner); out.push(...inner); i++; continue; }
        i++;
      }
      i++; out.push({ kind: 'tpl', start: st, end: i, raw: s.slice(st + 1, i - 1), hasExpr });
      prevSig = '`'; prevWord = ''; continue;
    }
    if (c === '/' && isRegexStart()) {
      i++; let cls = false;
      while (i < to) { const ch = s[i]; if (ch === '\\') { i += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; else if (ch === '\n') break; i++; }
      i++; while (i < to && /[a-z]/.test(s[i])) i++;
      prevSig = '/'; prevWord = ''; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_$0-9]/.test(c)) { const st = i; while (i < to && /[A-Za-z_$0-9]/.test(s[i])) i++; prevWord = s.slice(st, i); prevSig = 'w'; continue; }
    prevSig = c; prevWord = ''; i++;
  }
}
const toks = [];
scripts.forEach(([a, b]) => scanJs(text, a, b, toks));

const unesc = r => r.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
const strs = toks.filter(t => t.kind === 'str' && CYR.test(t.raw));
const tpls = toks.filter(t => t.kind === 'tpl' && CYR.test(t.raw));
const wraps = [], skipped = [];
for (const t of strs) {
  const before = text.slice(Math.max(0, t.start - 40), t.start), after = text.slice(t.end, t.end + 3);
  const lineStart = text.lastIndexOf('\n', t.start) + 1, line = text.slice(lineStart, t.start);
  if (/\bL\(\s*$/.test(before)) { wraps.push({ t, already: true }); continue; }
  if (/console\.\w+\([^)]*$/.test(line)) { skipped.push([t, 'console']); continue; }
  if (/^\s*:/.test(after) && /[{,]\s*$/.test(before)) { skipped.push([t, 'object key']); continue; }
  wraps.push({ t, already: false });
}
// static markup outside scripts/styles: text nodes and a few attributes
const markup = [];
{ let html = text; scripts.slice().reverse().forEach(([a, b]) => { html = html.slice(0, a) + ' '.repeat(b - a) + html.slice(b); });
  html = html.replace(/<style[\s\S]*?<\/style>/g, m => ' '.repeat(m.length)).replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
  let m; const re1 = />([^<>]*)</g; while ((m = re1.exec(html))) { const v = m[1].replace(/\s+/g, ' ').trim(); if (CYR.test(v)) markup.push(v); }
  const re2 = /\s(placeholder|title|aria-label|data-hint)="([^"]*)"/g; while ((m = re2.exec(html))) if (CYR.test(m[2])) markup.push(m[2].trim()); }

const dict = {};
wraps.forEach(w => { dict[unesc(w.t.raw)] = ''; });
markup.forEach(v => { dict[v] = ''; });
tpls.filter(t => !t.hasExpr).forEach(t => { dict[t.raw] = ''; });

if (mode === '--scan') {
  console.log(`${file}: ${wraps.length} literals (${wraps.filter(w => w.already).length} already wrapped), ${Object.keys(dict).length} unique strings, ${markup.length} markup texts, ${tpls.length} template literals (${tpls.filter(t => t.hasExpr).length} with \${}), ${skipped.length} skipped`);
  tpls.filter(t => t.hasExpr).slice(0, 20).forEach(t => console.log('  TPL ', JSON.stringify(t.raw.slice(0, 100))));
  skipped.slice(0, 20).forEach(([t, why]) => console.log('  SKIP', why, JSON.stringify(t.raw.slice(0, 80))));
  process.exit(0);
}
// ---- wrap (from the end so positions stay valid) ----
let outText = text;
const edits = [];
wraps.filter(w => !w.already).forEach(w => edits.push([w.t.start, w.t.end, 'L(' + text.slice(w.t.start, w.t.end) + ')']));
tpls.filter(t => !t.hasExpr).forEach(t => edits.push([t.start, t.end, 'L(' + text.slice(t.start, t.end) + ')']));
edits.sort((a, b) => b[0] - a[0]).forEach(([a, b, r]) => { outText = outText.slice(0, a) + r + outText.slice(b); });
fs.writeFileSync(file, crlf ? outText.replace(/\n/g, '\r\n') : outText);
const dir = path.join(__dirname, '..', '..', 'i18n', app); fs.mkdirSync(dir, { recursive: true });
const ukFile = path.join(dir, 'uk.json');
let old = {}; try { old = JSON.parse(fs.readFileSync(ukFile, 'utf8')); } catch (e) {}
const merged = Object.assign({}, old); Object.keys(dict).forEach(k => { merged[k] = k; });
fs.writeFileSync(ukFile, JSON.stringify(merged, null, 1) + '\n');
console.log(`wrapped ${edits.length} literals; ${Object.keys(merged).length} strings in ${ukFile}; template literals with \${} left as is: ${tpls.filter(t => t.hasExpr).length}`);
