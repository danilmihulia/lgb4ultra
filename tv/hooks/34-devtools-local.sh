#!/bin/sh
# DevTools port 9998 -> only the TV itself (127.0.0.1), not the whole home network.
#
# LG's /etc/systemd/system/scripts/webapp-mgr.sh starts WebAppMgr with --remote-debugging-port=9998 and the engine
# binds it to 0.0.0.0 without auth: any device on the Wi-Fi could attach to a public-group app (YouTube…) and call
# Homebrew Channel's root exec. The engine has no "listen address" switch and the kernel has no firewall, so we preload
# our tiny libbindlocal.so (native/bindlocal/bindlocal.c) that rewrites only bind(0.0.0.0:9998) -> bind(127.0.0.1:9998).
#
# How: a patched COPY of the stock start script (one LD_PRELOAD line before `exec`) is bind-mounted over the original.
# Runs before hook 36, whose compositor restart also restarts WAM (PartOf=surface-manager) -> picked up at boot for free.
# Stock files are never modified.  Off: touch /media/developer/myhome-sec/bindlocal.off  (+ reboot, or umount + restart WAM).
D=/media/developer/myhome-sec
S=/etc/systemd/system/scripts/webapp-mgr.sh
LOG=/tmp/myhome-sec.log
[ -e "$D/bindlocal.off" ] && { echo "bindlocal: off" >> $LOG; exit 0; }
[ -f "$D/libbindlocal.so" ] || exit 0
# Normally done at ~13 s by early.sh (before WAM starts at ~15.6 s); this boot-hook run (~33 s) is the fallback.
if grep -q bindlocal "$S"; then                        # already mounted -> just report whether WAM really has it
  p=$(pidof WebAppMgr | tr ' ' '\n' | sort -n | head -1)
  [ -n "$p" ] && ! grep -q libbindlocal /proc/$p/maps && echo "bindlocal: WARNING WAM started before the mount -> 9998 open until WAM restarts" >> $LOG
  exit 0
fi
# Patch whatever the CURRENT stock script is (survives firmware updates); if the exec line changed, do nothing.
grep -q '^exec \$WAM_EXE_PATH ' "$S" || { echo "bindlocal: stock exec line not found -> skipped" >> $LOG; exit 0; }
awk -v lib="$D/libbindlocal.so" '/^exec \$WAM_EXE_PATH /{ print "# myhome: DevTools 9998 only on 127.0.0.1 (bindlocal)"; print "export LD_PRELOAD=\"" lib "${LD_PRELOAD:+:$LD_PRELOAD}\"" } { print }' "$S" > "$D/webapp-mgr.sh" || exit 0
chown root:root "$D/webapp-mgr.sh" "$D/libbindlocal.so"; chmod 755 "$D" "$D/webapp-mgr.sh"; chmod 644 "$D/libbindlocal.so"
mount --bind "$D/webapp-mgr.sh" "$S" && echo "bindlocal: mounted at t=$(cut -d' ' -f1 /proc/uptime)s" >> $LOG
