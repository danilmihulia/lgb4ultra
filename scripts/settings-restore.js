// Put the TV's settings back from a snapshot made by settings-snapshot.js.
//   node scripts/settings-restore.js backups/settings/settings-snapshot-XXXX.json            → only SHOWS what differs
//   node scripts/settings-restore.js <snapshot> --apply                                      → writes the differing values
//   node scripts/settings-restore.js <snapshot> --apply --only "picture|aiPicture"           → only these categories
//   --tv <TV-IP> --key <ssh key>   which TV (default: config/device.local.json, or the TV_IP / TV_KEY variables)
// Also applies presets/settings-recommended.json (the author's settings) the same way.
// Writes use "valueCheck":false + the stored dimension: picture modes of a signal type that is not playing right now
// (HDR, Dolby Vision) are otherwise refused by settingsservice ("No matched extended item").
'use strict';
const fs = require('fs');
const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
if (arg('--tv')) process.env.TV_IP = arg('--tv');
if (arg('--key')) process.env.TV_KEY = require('path').resolve(arg('--key'));
const { tvRun } = require('./tvssh');
const file = args.find(a => /\.json$/.test(a));
const apply = args.includes('--apply'), oi = args.indexOf('--only'), only = oi >= 0 ? new RegExp('^(' + args[oi + 1] + ')$') : null;
if (!file) { console.log('usage: node scripts/settings-restore.js <snapshot.json> [--tv <TV-IP> --key <ssh key>] [--apply] [--only "cat1|cat2"]'); process.exit(1); }

const snap = JSON.parse(fs.readFileSync(file, 'utf8')), seen = new Set(), E = [];
for (const e of snap.entries) {
  if (only && !only.test(e.category)) continue;
  const id = e.category + '|' + e.key + '|' + JSON.stringify(e.dimension || {}); if (seen.has(id)) continue; seen.add(id); E.push(e);
}
const req = (e, extra) => JSON.stringify(Object.assign({ category: e.category }, e.dimension ? { dimension: e.dimension } : {}, extra)).replace(/'/g, "'\\''");

// 1) read the current values
let sh = 'q(){ echo "Q$1"; timeout 5 luna-send -n 1 -a com.webos.app.home luna://com.webos.settingsservice/getSystemSettings "$2" </dev/null; echo; }\n';
E.forEach((e, i) => { sh += 'q ' + i + " '" + req(e, { keys: [e.key] }) + "'\n"; });
console.log('reading ' + E.length + ' values from the TV…');
const now = {}; let cur = -1;
tvRun(sh, 900000).split('\n').forEach(l => {
  const m = /^Q(\d+)$/.exec(l.trim()); if (m) { cur = +m[1]; return; }
  if (cur >= 0 && l.trim().startsWith('{')) { try { const r = JSON.parse(l); if (r.settings && E[cur].key in r.settings) now[cur] = r.settings[E[cur].key]; } catch (e) {} }
});
const diff = E.map((e, i) => ({ e, i })).filter(x => JSON.stringify(now[x.i]) !== JSON.stringify(x.e.value));
diff.forEach(({ e, i }) => console.log((e.category + '.' + e.key).padEnd(40), JSON.stringify(e.dimension || {}).padEnd(48), JSON.stringify(now[i]), '→', JSON.stringify(e.value)));
console.log(diff.length + ' of ' + E.length + ' differ.');
if (!apply) { if (diff.length) console.log('Nothing changed. Add --apply to write them.'); process.exit(0); }

// 2) write the differing ones
let w = 's(){ timeout 5 luna-send -n 1 -a com.webos.app.home luna://com.webos.settingsservice/setSystemSettings "$1" </dev/null; echo; }\n';
diff.forEach(({ e }) => { const st = {}; st[e.key] = e.value; w += "s '" + req(e, { settings: st, valueCheck: false }) + "'\n"; });
const res = tvRun(w, 600000).split('\n').filter(l => l.trim().startsWith('{'));
const bad = res.filter(l => /"returnValue":\s*false/.test(l));
console.log('written: ' + (res.length - bad.length) + ', refused: ' + bad.length); bad.slice(0, 10).forEach(l => console.log('  ' + l));
