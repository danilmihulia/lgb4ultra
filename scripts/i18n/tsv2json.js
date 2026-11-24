// Turns a translation sheet i18n/<app>/<lang>.tsv ("<index>\t<text>", index = position of the key in uk.json)
// into i18n/<app>/<lang>.json (Ukrainian text → translation) and deletes the .tsv. The JSON is the source of truth after that.
//   node scripts/i18n/tsv2json.js <app> <lang> [<lang> …]
'use strict';
const fs = require('fs'), path = require('path');
const [app, ...langs] = process.argv.slice(2);
const dir = path.join(__dirname, '..', '..', 'i18n', app);
const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'uk.json'), 'utf8')));
for (const lang of langs) {
  const tsv = path.join(dir, lang + '.tsv'), out = path.join(dir, lang + '.json');
  let dict = {}; try { dict = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
  let n = 0;
  fs.readFileSync(tsv, 'utf8').replace(/\r/g, '').split('\n').forEach(line => {
    const m = /^(\d+)\t(.*)$/.exec(line); if (!m) return;
    const k = keys[+m[1]]; if (k === undefined) throw new Error(lang + ': no key #' + m[1]);
    if (m[2] === '') return;
    dict[k] = m[2]; n++;
  });
  fs.writeFileSync(out, JSON.stringify(dict, null, 1) + '\n');
  fs.unlinkSync(tsv);
  console.log(`${app}/${lang}: ${n} strings → ${out}`);
}
