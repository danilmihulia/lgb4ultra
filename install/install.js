#!/usr/bin/env node
// lgb4ultra installer — run on your PC (Node.js 18+ and an OpenSSH client), TV rooted with Homebrew Channel + SSH.
//   node install/install.js <TV-IP> [options]
//     --key <file>        SSH private key for root@TV (default: your ssh config / ~/.ssh/id_*)
//     --dry-run           build everything and show what would be installed; change NOTHING on the TV
//     --compare           (with --dry-run) also compare every file with what is on the TV now
//     --no-early          skip the early boot takeover (LG's own hub shows for ~30 s at boot, then ours)
//     --no-sm-restart     early takeover without the compositor restart (LG boot logo stays; LG popups stay grey
//                         until the next compositor restart)
//     --no-adblock        skip the /etc/hosts ad/tracker blocking
//     --no-privacy        don't switch off LG's ad / tracking / recommendation settings
//     --recommended-settings  also apply the author's TV settings (presets/settings-recommended.json: picture per
//                         input and mode, PS5 game mode, sound, power, privacy…) — a suggestion; see README
//     --force             skip the model / firmware check (NOT recommended: untested on anything else)
//     --yes               don't ask before installing / rebooting
// Everything is reversible: node install/uninstall.js <TV-IP>. Nothing in LG's read-only system image is changed;
// our files live in /media/developer, /var/lib/myhome and /var/lib/webosbrew/init.d and are bind-mounted over the stock ones.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), readline = require('readline');
const { execFileSync } = require('child_process');
const pack = require('./lib/pack'), TV = require('./lib/tv');
const R = path.join(__dirname, '..');
// text files go to the TV with LF line endings even if git on Windows checked them out as CRLF
const lf = (p, b) => /\.(sh|py|js|qml|json|html|txt|env|css|md)$/.test(p) ? Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n')) : b;

// ---------- arguments ----------
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const host = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--key');
const ki = argv.indexOf('--key'), key = ki >= 0 ? argv[ki + 1] : null;
const O = { dry: flag('--dry-run'), compare: flag('--compare'), early: !flag('--no-early'), smRestart: !flag('--no-sm-restart'),
  adblock: !flag('--no-adblock'), privacy: !flag('--no-privacy'), force: flag('--force'), yes: flag('--yes'), rec: flag('--recommended-settings') };
if (!host) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(1); }
const tv = TV.make({ host, key });
const step = s => console.log('\n== ' + s);
const ask = q => O.yes ? Promise.resolve(true) : new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q + ' [y/N] ', a => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }); });

(async () => {
  // ---------- 1. check the TV ----------
  step('Checking the TV at ' + host);
  const info = tv.sh(`id -u; luna-send -n 1 luna://com.webos.service.tv.systemproperty/getSystemInfo '{"keys":["modelName","firmwareVersion","sdkVersion"]}' </dev/null; echo
nyx-cmd OSInfo query webos_release 2>/dev/null; [ -d /var/lib/webosbrew/init.d ] && echo HBC_OK; command -v python3 >/dev/null && echo PY_OK; df -m /media/developer | tail -1`);
  const L = info.split('\n');
  if (L[0].trim() !== '0') throw new Error('not root on the TV (ssh must log in as root via Homebrew Channel)');
  const si = JSON.parse(L.find(l => l.startsWith('{')) || '{}');
  const rel = (L.find(l => /^\d+\.\d+/.test(l.trim())) || '').trim();
  console.log('  model ' + si.modelName + ', firmware ' + si.firmwareVersion + ', webOS ' + rel);
  if (!/HBC_OK/.test(info)) throw new Error('Homebrew Channel not found (/var/lib/webosbrew/init.d missing) — root the TV first (see README)');
  if (!/PY_OK/.test(info)) throw new Error('python3 not found on the TV');
  const ok = /^OLED\d{2}B4/.test(si.modelName || '') && /^33\.31\./.test(si.firmwareVersion || '') && /^10\./.test(rel);
  if (!ok && !O.force) throw new Error('This was built and tested ONLY on LG OLED B4 (2024), firmware 33.31.x, webOS 10 (webOS 25).\n' +
    'Your TV reports something else. Stopping. (--force skips this check — at your own risk.)');
  if (!ok) console.log('  !! model/firmware not tested — continuing because of --force');

  // ---------- 2. LG's stock files from THIS TV (read through a non-recursive bind, i.e. underneath our mounts) ----------
  step('Reading LG stock files from the TV (to patch them locally — no LG files ship with this project)');
  // a bind mount is not recursive → /tmp/lgb4u-usr shows the original /usr without anything mounted over it
  const stock = pack.untar(tv.read('mkdir -p /tmp/lgb4u-usr && mount --bind /usr /tmp/lgb4u-usr && ( cd /tmp/lgb4u-usr && tar cf - lib/qml/SystemUI/Notification palm/applications/com.webos.app.inputcommon/qml lib/maliit/plugins/qml ); umount /tmp/lgb4u-usr; rmdir /tmp/lgb4u-usr'));
  Object.assign(stock, pack.untar(tv.read('mkdir -p /tmp/lgb4u-root && mount --bind / /tmp/lgb4u-root && ( cd /tmp/lgb4u-root && tar cf - etc/configd/layers/base/com.webos.surfacemanager.json ); umount /tmp/lgb4u-root; rmdir /tmp/lgb4u-root')));
  const nStock = Object.keys(stock).length; console.log('  ' + nStock + ' files');
  if (!stock['etc/configd/layers/base/com.webos.surfacemanager.json'] || !stock['lib/qml/SystemUI/Notification/Toast.qml']) throw new Error('stock files missing — unexpected firmware layout');

  // ---------- 3. build everything locally ----------
  step('Building');
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 'lgb4u-'));
  const put = (rel, data) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
  const sub = (prefix) => Object.keys(stock).filter(k => k.startsWith(prefix + '/')).forEach(k => put(path.join('stock', k), stock[k]));
  sub('lib/qml/SystemUI/Notification'); sub('palm/applications/com.webos.app.inputcommon/qml'); sub('lib/maliit/plugins/qml');
  put('stock/sm.json', stock['etc/configd/layers/base/com.webos.surfacemanager.json']);
  const node = (script, ...a) => execFileSync(process.execPath, [path.join(R, script), ...a], { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
  const S = p => path.join(W, 'stock', p), G = p => path.join(W, 'gen', p);
  const copyDir = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { const pa = path.join(a, e.name), pb = path.join(b, e.name); e.isDirectory() ? copyDir(pa, pb) : fs.copyFileSync(pa, pb); } };
  // notifications / alerts (hook 37)
  copyDir(S('lib/qml/SystemUI/Notification'), G('notif'));
  node('tv/notif-restyle/make-patch.js', S('lib/qml/SystemUI/Notification'), G('notif-out'));
  copyDir(G('notif-out'), G('notif'));
  node('tv/notif-restyle/usbalert-patch.js', G('notif/AlertView.qml'), G('notif/AlertView.qml.new'));
  fs.renameSync(G('notif/AlertView.qml.new'), G('notif/AlertView.qml'));
  // input app: no-signal → our saver, no LG banners (hook 38)
  copyDir(S('palm/applications/com.webos.app.inputcommon/qml'), G('ic'));
  node('tv/inputcommon-patch/make-patch.js', S('palm/applications/com.webos.app.inputcommon/qml'), G('ic-out'));
  copyDir(G('ic-out'), G('ic'));
  // on-screen keyboard (hook 40)
  node('tv/maliit-restyle/patch.js', S('lib/maliit/plugins/qml'), G('maliit'));
  fs.copyFileSync(path.join(R, 'tv/maliit-restyle/MyHomeKeyboard.qml'), G('maliit/view-global/MyHomeKeyboard.qml'));
  // key filter config (hook 36)
  node('tv/keyfilter/make-patched-config.js', S('sm.json'), G('sm.json'), '/media/developer/myhome-keyfilter/myhome-keys.js');
  console.log('  patched LG files generated');

  // staging tree = TV paths
  const T = []; const file = (p, src, mode) => T.push({ path: p, data: lf(p, Buffer.isBuffer(src) ? src : fs.readFileSync(src)), mode: mode || (/\.(sh|py)$/.test(p) ? 0o755 : 0o644) });
  const tree = (dir, prefix) => pack.dirEntries(dir, prefix, p => /\.(sh|py)$/.test(p) ? 0o755 : 0o644).forEach(e => { if (e.data) e.data = lf(e.path, e.data); T.push(e); });
  const D = 'media/developer/';
  // hub (bind-mounted over com.webos.app.home) + system screen saver (over com.webos.app.screensaver)
  tree(path.join(R, 'apps/hub'), D + 'myhome-home');
  tree(path.join(R, 'apps/saver'), D + 'myhome-saver');
  file(D + 'myhome-saver/icon.png', path.join(R, 'apps/hub/icon.png'));
  ['myhome-home/walls/', 'myhome-home/walls-screen/', 'myhome-saver/walls/', 'myhome-saver/walls-screen/', 'a11y-empty/'].forEach(d => T.push({ path: D + d, dir: true }));
  for (const f of ['myhome-keys.js', 'make-patched-config.js']) file(D + 'myhome-keyfilter/' + f, path.join(R, 'tv/keyfilter', f));
  file(D + 'myhome-keyfilter/com.webos.surfacemanager.json', G('sm.json'));
  file(D + 'myhome-keyfilter/com.webos.surfacemanager.json.orig', S('sm.json'));
  tree(G('notif'), D + 'notif-patched');
  tree(G('ic'), D + 'inputcommon-patched/qml');
  tree(G('maliit'), D + 'maliit-qml');
  for (const f of ['poweron-home.sh', 'pwrkey.py', 'keylog.py']) file(D + 'myhome-poweron/' + f, path.join(R, 'tv/poweron', f));
  file(D + 'myhome-poweron/epg.py', path.join(R, 'services/epg/epg.py'));
  if (O.adblock) file(D + 'myhome-adblock/adblock.py', path.join(R, 'tv/adblock/adblock.py'));
  for (const f of ['cdp.py', 'framegate.py']) file(D + 'myhome-browser/' + f, path.join(R, 'services/browser', f));
  file(D + 'myhome-sec/libbindlocal.so', path.join(R, 'tv/bindlocal/libbindlocal.so'));   // DevTools 9998 → 127.0.0.1 only (hook 34)
  for (const h of fs.readdirSync(path.join(R, 'tv/hooks')).sort()) {
    if (!O.adblock && /adblock/.test(h)) continue;
    file('var/lib/webosbrew/init.d/' + h, path.join(R, 'tv/hooks', h), 0o755);
  }
  if (O.early) { file('var/lib/myhome/early.sh', path.join(R, 'tv/early-takeover/early.sh'), 0o755); file('var/lib/myhome/libmyhome-early.so', path.join(R, 'tv/early-takeover/libmyhome-early.so')); }
  const apps = ['browser', 'explorer', 'iptv'].map(a => pack.ipk(path.join(R, 'apps', a), lf));
  apps.forEach(a => file('tmp/lgb4u-ipk/' + a.id + '.ipk', a.buf));
  const nFiles = T.filter(e => !e.dir).length, bytes = T.reduce((n, e) => n + (e.data ? e.data.length : 0), 0);
  console.log('  ' + nFiles + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB; apps: ' + apps.map(a => a.id + ' ' + a.version).join(', '));

  if (O.dry) {
    if (O.compare) compare(T, apps);
    console.log('\nDry run — nothing was changed on the TV. Build folder: ' + W);
    return;
  }

  // ---------- 4. install ----------
  console.log('\nThis will install into /media/developer, /var/lib/myhome, /var/lib/webosbrew/init.d' + (O.early ? ', /var/systemd/system/env' : '') +
    (O.privacy ? ' and switch off LG ad/tracking settings' : '') + '. Undo any time: node install/uninstall.js ' + host);
  if (!(await ask('Install now?'))) { console.log('Cancelled.'); return; }
  step('Copying files to the TV');
  tv.pipe('tar xzf - -C /', pack.tgz(T));
  step('Setting up on the TV');
  const PRIV = O.privacy ? [['option', 'livePlus', 'off'], ['option', 'watchedListCollection', 'off'], ['option', 'livePromotion', 'off'], ['option', 'hbbTvDeviceId', 'off'],
    ['option', 'thirdPartyCookie', 'off'], ['general', 'adCookie', 'off'], ['general', 'customizedAd', 'off'], ['general', 'homePromotion', 'off'],
    ['general', 'screenSaverAd', 'off'], ['general', 'aiNudge', 'off'], ['general', 'aiSettingsNudge', 'off'], ['general', 'doNotSellMyPersonalInformation', 'on']] : [];
  const setS = (c, k, v) => `luna-send -n 1 -a com.webos.app.home luna://com.webos.settingsservice/setSystemSettings '${JSON.stringify({ category: c, settings: { [k]: v } })}' </dev/null >/dev/null 2>&1 && echo "  setting ${c}.${k} = ${v}"`;
  const out = tv.sh(`D=/media/developer
for f in myhome-home/walls.json myhome-saver/walls.json; do [ -f "$D/$f" ] || echo '[]' > "$D/$f"; done
[ -f $D/myhome-adblock/adblock.py ] && [ ! -f $D/myhome-adblock/allow.txt ] && echo '# one domain per line: never blocked (takes effect within a minute)' > $D/myhome-adblock/allow.txt
chmod 755 /var/lib/webosbrew/init.d/*.sh
${O.early ? `mkdir -p /var/systemd/system/env
printf 'LD_PRELOAD=/var/lib/myhome/libmyhome-early.so\\nMYHOME_EARLY=1\\n' > /var/systemd/system/env/criu_remove_img.env
${O.smRestart ? 'touch /var/lib/myhome/sm-restart' : 'rm -f /var/lib/myhome/sm-restart'}
echo "  early boot takeover on"` : 'rm -f /var/systemd/system/env/criu_remove_img.env'}
# LG restores the input app from a CRIU snapshot taken with its stock QML → move that snapshot aside once (kept for uninstall)
C=/mnt/lg/cmn_data/checkpoint/com.webos.app.inputcommon
if [ -d $C ] && [ ! -e $D/criu-backup/emmc/com.webos.app.inputcommon ]; then mkdir -p $D/criu-backup/emmc && mv $C $D/criu-backup/emmc/ && echo "  input-app snapshot moved to $D/criu-backup"; fi
# apps
for ipk in /tmp/lgb4u-ipk/*.ipk; do
  id=$(basename $ipk .ipk); L=/tmp/lgb4u-inst.log
  luna-send -i -f luna://com.webos.appInstallService/dev/install "{\\"id\\":\\"$id\\",\\"ipkUrl\\":\\"$ipk\\",\\"subscribe\\":true}" </dev/null > $L 2>&1 &
  P=$!; i=0; while [ $i -lt 120 ]; do grep -q '"state": *"installed"\\|errorText\\|"returnValue": *false' $L && break; sleep 0.5; i=$((i+1)); done; kill $P 2>/dev/null
  if [ -f /media/developer/apps/usr/palm/applications/$id/appinfo.json ]; then echo "  app $id installed"; else echo "  app $id FAILED: $(grep -o '"errorText": *"[^"]*"' $L | tail -1)"; fi
done
rm -rf /tmp/lgb4u-ipk /tmp/lgb4u-inst.log
# security: websites in the browser must not reach Homebrew Channel's root service (see SECURITY.md) — applied now,
# not only at the next boot (hook 43 also starts the browser helper)
sh /var/lib/webosbrew/init.d/43-browser.sh && echo "  browser + channels: no access to system services"
# debug port 9998 → only the TV itself; takes effect when the web engine restarts (at the latest: next boot)
sh /var/lib/webosbrew/init.d/34-devtools-local.sh && grep -q bindlocal /etc/systemd/system/scripts/webapp-mgr.sh && echo "  debug port 9998: local only from the next restart"
${setS('other', 'lgLogoDisplay', 'off')}
${PRIV.map(p => setS(...p)).join('\n')}
sync`, { timeout: 600000 });
  console.log(out.trimEnd());
  fs.rmSync(W, { recursive: true, force: true });
  if (O.rec) {
    step('Applying the recommended settings (presets/settings-recommended.json)');
    const env = Object.assign({}, process.env, { TV_IP: host }, key ? { TV_KEY: path.resolve(key) } : {});
    execFileSync(process.execPath, [path.join(R, 'scripts/settings-restore.js'), path.join(R, 'presets/settings-recommended.json'), '--apply'],
      { env, stdio: ['ignore', 'pipe', 'inherit'] }).toString().split('\n').filter(l => /differ|written|refused/.test(l)).forEach(l => console.log('  ' + l.trim()));
  }
  console.log('\nInstalled. Everything starts at the next boot.');
  if (await ask('Reboot the TV now?')) { tv.sh('(sleep 1; reboot) >/dev/null 2>&1 &', { allowFail: true }); console.log('Rebooting… our hub appears ~40 s after power-on.'); }
  else console.log('Reboot later (unplug or "reboot" over ssh) to start it.');
})().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });

// dry-run comparison with what is on the TV now (for development / checking an existing install)
function compare(T, apps) {
  step('Comparing with the TV');
  const files = T.filter(e => !e.dir && !e.path.startsWith('tmp/'));
  const appRoot = '/media/developer/apps/usr/palm/applications/';
  const appFiles = [];
  for (const a of apps) {
    const ents = pack.untar(require('zlib').gunzipSync(extractAr(a.buf)['data.tar.gz']));
    for (const p of Object.keys(ents)) if (p.startsWith('usr/palm/applications/')) appFiles.push({ path: p.replace('usr/palm/applications/', appRoot.slice(1)), data: ents[p] });
  }
  const all = files.concat(appFiles);
  const got = pack.untar(tv.pipe('cd / && while read f; do [ -f "$f" ] && echo "$f"; done | tar cf - -T -', Buffer.from(all.map(e => e.path).join('\n') + '\n')));
  let same = 0; const diff = [], missing = [];
  for (const e of all) { const g = got[e.path]; if (!g) missing.push(e.path); else if (Buffer.compare(lf(e.path, g), lf(e.path, Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data)))) diff.push(e.path); else same++; }
  console.log('  same: ' + same + ', different: ' + diff.length + ', not on the TV: ' + missing.length);
  diff.slice(0, 40).forEach(p => console.log('  DIFF    /' + p)); missing.slice(0, 40).forEach(p => console.log('  MISSING /' + p));
}
function extractAr(b) { const out = {}; let o = 8; while (o < b.length) { const h = b.slice(o, o + 60).toString(); const n = h.slice(0, 16).trim(), s = parseInt(h.slice(48, 58)); out[n] = b.slice(o + 60, o + 60 + s); o += 60 + s + (s % 2); } return out; }
