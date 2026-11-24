#!/usr/bin/env node
// Download the recommended wallpaper set (presets/wallpapers/wallhaven.txt) straight from wallhaven.cc.
// A suggestion, not a rule — use your own pictures if you like (Files → USB → «Copy to wallpapers»).
//   node scripts/get-wallpapers.js                                  → into ./wallpapers on this PC (copy to a USB stick)
//   node scripts/get-wallpapers.js --tv <TV-IP> --key <ssh key>     → also straight into the hub's wallpapers on the TV
//     --out <folder>   download folder (default ./wallpapers); files already there are not downloaded again
// The images belong to their authors; wallhaven pages are listed next to each file. For personal use.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const out = path.resolve(opt('--out') || 'wallpapers'), host = opt('--tv'), key = opt('--key');
const list = fs.readFileSync(path.join(R, 'presets/wallpapers/wallhaven.txt'), 'utf8').split('\n')
  .map(l => /^([a-z0-9]{6}) (wallhaven-[a-z0-9]{6}\.(?:jpg|png))/.exec(l)).filter(Boolean).map(m => ({ id: m[1], file: m[2] }))
  .slice(0, +opt('--limit') || undefined);   // --limit n: only the first n (testing)

(async () => {
  fs.mkdirSync(out, { recursive: true });
  let got = 0, skip = 0, bad = [];
  for (const [i, w] of list.entries()) {
    const f = path.join(out, w.file);
    if (fs.existsSync(f) && fs.statSync(f).size > 0) { skip++; continue; }
    const url = 'https://w.wallhaven.cc/full/' + w.id.slice(0, 2) + '/' + w.file;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'lgb4ultra-wallpapers/1.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); got++;
      process.stdout.write('\r  ' + (i + 1) + '/' + list.length + ' ' + w.file + '        ');
    } catch (e) { bad.push(w.file + ' (' + e.message + ')'); }
    await new Promise(r => setTimeout(r, 400));   // be gentle with wallhaven
  }
  console.log('\nDownloaded ' + got + ', already there ' + skip + (bad.length ? ', failed ' + bad.length + ':\n  ' + bad.join('\n  ') : '') + ' → ' + out);
  if (!host) { console.log('Copy the folder to a USB stick → plug it into the TV → «Open in Files» → «Copy all to wallpapers».'); return; }

  // straight onto the TV: into the hub's wallpaper folder + walls.json (existing wallpapers are kept)
  const pack = require('../install/lib/pack'), TV = require('../install/lib/tv');
  const tv = TV.make({ host, key });
  const files = list.map(w => w.file).filter(n => fs.existsSync(path.join(out, n)));
  console.log('Uploading ' + files.length + ' files to the TV…');
  for (let i = 0; i < files.length; i += 10) {   // in chunks (big images)
    const chunk = files.slice(i, i + 10).map(n => ({ path: n, data: fs.readFileSync(path.join(out, n)) }));
    tv.pipe('mkdir -p /media/developer/myhome-home/walls && tar xf - -C /media/developer/myhome-home/walls', pack.tar(chunk));
    process.stdout.write('\r  ' + Math.min(i + 10, files.length) + '/' + files.length);
  }
  const res = tv.sh(`python3 - <<'PY'
import json, os
d = '/media/developer/myhome-home'
try: cur = json.load(open(d + '/walls.json'))
except Exception: cur = []
new = ${JSON.stringify(files)}
have = set(cur)
cur += [n for n in new if n not in have and os.path.exists(d + '/walls/' + n)]
json.dump(cur, open(d + '/walls.json', 'w'), ensure_ascii=False)
print(len(cur))
PY`);
  console.log('\nThe TV now has ' + res.trim() + ' wallpapers. Open «Files» once: it makes screen-size copies of the very big ones (keeps the slideshow light).');
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
