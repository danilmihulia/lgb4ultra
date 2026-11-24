#!/bin/sh
# My Home: route remote SETTINGS / SOURCE keys to our launcher screens.
# Bind-mounts a patched com.webos.surfacemanager.json that adds our key filter
# (/media/developer/myhome-keyfilter/myhome-keys.js) right after handleScreenSaver,
# then asks configd to reconfigure -> surface-manager re-creates its key filters live (no restart).
# Reversible: umount the target + reconfigure '{}'. Skipped in failsafe (webosbrew init.d not run).
STAGE=/media/developer/myhome-keyfilter/com.webos.surfacemanager.json
TARGET=/etc/configd/layers/base/com.webos.surfacemanager.json
[ -f "$STAGE" ] || exit 0
[ -f /media/developer/myhome-keyfilter/myhome-keys.js ] || exit 0
mount 2>/dev/null | grep -q "com.webos.surfacemanager.json" && exit 0
mount --bind "$STAGE" "$TARGET" 2>/dev/null || exit 0
# NOTE: reloadConfigs does NOT re-read layers (configd serves its boot snapshot /var/preferences/configd_db.json).
# reconfigure '{}' (what factorymanager calls at boot) rebuilds from layers and notifies subscribers;
# subscribers (surface-manager reads key filters only at startup, hence the restart below).
luna-send -n 1 luna://com.webos.service.config/reconfigure '{}' >/dev/null 2>&1 </dev/null &
# Verified 2026-11-19: surface-manager does NOT re-create key filters on reconfigure; it reads them at startup.
# So restart the compositor once (screen blinks; home is re-launched by SAM). Delay so hook 30's `restart sam` settles.
# Wait until hook 30 has restarted SAM (flag /tmp/myhome-sam-done, max 120 s), THEN restart the compositor once —
# running both restarts at the same time made cold boot much slower.
(
  i=0
  while [ ! -f /tmp/myhome-sam-done ] && [ $i -lt 120 ]; do sleep 1; i=$((i+1)); done
  echo "t=$(cut -d' ' -f1 /proc/uptime)s restart surface-manager (waited ${i}s)" >> /tmp/myhome-takeover.log
  systemctl restart surface-manager-daemon
  # Watchdog (2026-11-20 cold-boot black screen): SAM's home launch can land while the compositor is still
  # coming up -> the window is lost and the screen stays black with NO foreground app. For 60 s, every 3 s:
  # if nothing is in the foreground, launch home again. Stops once any app is visible.
  sleep 4; j=0
  while [ $j -lt 20 ]; do
    fg=$(luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -1)
    if [ -n "$fg" ]; then echo "t=$(cut -d' ' -f1 /proc/uptime)s foreground=$fg ok" >> /tmp/myhome-takeover.log; break; fi
    echo "t=$(cut -d' ' -f1 /proc/uptime)s no foreground -> launch home" >> /tmp/myhome-takeover.log
    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
    sleep 3; j=$((j+1))
  done
) >/dev/null 2>&1 &
exit 0
