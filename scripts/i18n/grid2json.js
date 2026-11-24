// Translation grid → per-language dictionaries.
// i18n/<app>/grid.tsv: "<index>\t<en>\t<ru>\t<nl>\t<de>\t<fr>\t<es>\t<it>\t<pl>\t<pt>" (index = position of the key in uk.json).
// Writes/merges i18n/<app>/<lang>.json and deletes grid.tsv.   node scripts/i18n/grid2json.js <app>
'use strict';
const fs = require('fs'), path = require('path');
const app = process.argv[2];
const LANGS = ['en', 'ru', 'nl', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const dir = path.join(__dirname, '..', '..', 'i18n', app);
const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'uk.json'), 'utf8')));
const dicts = {};
LANGS.forEach(l => { try { dicts[l] = JSON.parse(fs.readFileSync(path.join(dir, l + '.json'), 'utf8')); } catch (e) { dicts[l] = {}; } });
let rows = 0;
fs.readFileSync(path.join(dir, 'grid.tsv'), 'utf8').replace(/\r/g, '').split('\n').forEach(line => {
  if (!line.trim()) return;
  const c = line.split('\t'); const k = keys[+c[0]];
  if (k === undefined || c.length !== 1 + LANGS.length) throw new Error('bad row: ' + line.slice(0, 80) + ' (cols ' + c.length + ')');
  LANGS.forEach((l, i) => { if (c[i + 1] !== '') dicts[l][k] = c[i + 1].split('\\n').join('\n'); });   // a literal \n in the sheet = newline
  rows++;
});
LANGS.forEach(l => fs.writeFileSync(path.join(dir, l + '.json'), JSON.stringify(dicts[l], null, 1) + '\n'));
fs.unlinkSync(path.join(dir, 'grid.tsv'));
console.log(`${app}: ${rows} rows × ${LANGS.length} languages`);
