#!/usr/bin/env node
// Remove lgb4ultra from the TV and go back to LG's stock interface.
//   node install/uninstall.js <TV-IP> [--key <file>] [--purge] [--yes]
//     --purge   also delete our data folders (wallpapers, hub/saver copies, logs, backups of LG's input-app snapshot
//               are put back first). Without it they stay in /media/developer (harmless, nothing uses them).
// Homebrew Channel / root stay as they are (remove those with Homebrew Channel's own options if you want).
'use strict';
const readline = require('readline');
const TV = require('./lib/tv');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const host = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--key');
const ki = argv.indexOf('--key'), key = ki >= 0 ? argv[ki + 1] : null;
if (!host) { console.log('usage: node install/uninstall.js <TV-IP> [--key <file>] [--purge] [--yes]'); process.exit(1); }
const tv = TV.make({ host, key });
const ask = q => flag('--yes') ? Promise.resolve(true) : new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q + ' [y/N] ', a => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }); });

(async () => {
  if (!(await ask('Remove lgb4ultra from ' + host + ' and restore the stock LG interface?'))) return console.log('Cancelled.');
  const out = tv.sh(`D=/media/developer
# 1. nothing of ours starts at the next boot
rm -f /var/systemd/system/env/criu_remove_img.env
for h in 29-saver-takeover 30-myhome-takeover 33-a11y-overlay-off 36-keyfilter-patch 37-notif-restyle 38-inputcommon-patch 40-maliit-restyle 41-poweron-home 42-adblock 43-browser; do rm -f /var/lib/webosbrew/init.d/$h.sh; done
touch $D/myhome-poweron/pwrkey.off $D/myhome-poweron/epg.off $D/myhome-adblock/adblock.off $D/myhome-browser/framegate.off 2>/dev/null
# 2. stop our background scripts (match the python/sh command line only — never this ssh session)
for p in $(pgrep -f myhome-poweron/; pgrep -f myhome-adblock/; pgrep -f myhome-browser/); do case "$(tr '\\0' ' ' </proc/$p/cmdline 2>/dev/null)" in python3*|/bin/sh*poweron-home.sh*|/bin/sh\\ -c\\ while*) kill $p 2>/dev/null;; esac; done
# 3. unmount everything we mounted over the stock system
for m in /usr/palm/applications/com.webos.app.screensaver/walls-screen /usr/palm/applications/com.webos.app.screensaver/walls.json \\
         /usr/palm/applications/com.webos.app.screensaver/walls /usr/palm/applications/com.webos.app.screensaver \\
         /usr/palm/applications/com.webos.app.home /usr/palm/applications/com.webos.app.accessibility-overlay \\
         /etc/configd/layers/base/com.webos.surfacemanager.json /usr/lib/qml/SystemUI/Notification \\
         /usr/palm/applications/com.webos.app.inputcommon/qml /usr/lib/maliit/plugins/qml; do
  grep -q " $m " /proc/mounts && umount $m && echo "  unmounted $m"
done
# 4. LG's input-app snapshot back (it was moved aside so LG would not restore its stock QML over our patch)
C=/mnt/lg/cmn_data/checkpoint/com.webos.app.inputcommon
if [ -d $D/criu-backup/emmc/com.webos.app.inputcommon ]; then rm -rf $C; mv $D/criu-backup/emmc/com.webos.app.inputcommon $C && echo "  input-app snapshot restored"; fi
# 5. our apps
for id in com.user.browser com.user.explorer com.user.iptv; do
  [ -d $D/apps/usr/palm/applications/$id ] || continue
  luna-send -i -f luna://com.webos.appInstallService/dev/remove "{\\"id\\":\\"$id\\",\\"subscribe\\":true}" </dev/null > /tmp/lgb4u-rm.log 2>&1 &
  P=$!; sleep 6; kill $P 2>/dev/null; echo "  app $id removed"
done
systemctl stop myhome-explorer 2>/dev/null
# 6. LG logo at power-on back on
luna-send -n 1 -a com.webos.app.home luna://com.webos.settingsservice/setSystemSettings '{"category":"other","settings":{"lgLogoDisplay":"on"}}' </dev/null >/dev/null 2>&1
${flag('--purge') ? 'rm -rf /var/lib/myhome $D/myhome-home $D/myhome-saver $D/myhome-keyfilter $D/notif-patched $D/inputcommon-patched $D/maliit-qml $D/myhome-poweron $D/myhome-adblock $D/myhome-browser $D/a11y-empty $D/.explorer-trash; rmdir $D/criu-backup/emmc $D/criu-backup 2>/dev/null; echo "  data folders deleted"' : 'rm -rf /var/lib/myhome; echo "  data folders kept in $D (use --purge to delete)"'}
sync`, { timeout: 300000 });
  console.log(out.trimEnd());
  console.log('\nDone. LG ad/privacy settings that the installer switched off stay off (change them in LG settings).');
  if (await ask('Reboot the TV now (needed to bring everything back to stock)?')) { tv.sh('(sleep 1; reboot) >/dev/null 2>&1 &', { allowFail: true }); console.log('Rebooting…'); }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
