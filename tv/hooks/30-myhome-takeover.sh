#!/bin/sh
# Re-apply "My Home" takeover at boot: bind-mount our launcher over com.webos.app.home, then
# restart SAM so it RESCANS and launches our WEB home as com.webos.app.home.
#
# Why restart sam (not kill+luna-launch): at COLD BOOT the old kill+relaunch raced with
# preloadmanager — SAM had already cached the stock flutter home, relaunched flutter / looped,
# and the screen went black. `restart sam` after the mount makes SAM re-read our web appinfo and
# bring up our page cleanly (verified live). Idempotent. In webOS failsafe this block is skipped.
LOG=/tmp/myhome-takeover.log
STAGE=/media/developer/myhome-home
TARGET=/usr/palm/applications/com.webos.app.home

echo "[$(date)] start" >> "$LOG"
[ -f "$STAGE/appinfo.json" ] || { echo "stage missing -> abort" >> "$LOG"; exit 0; }

si=$(stat -c %i "$STAGE/appinfo.json" 2>/dev/null)
ti=$(stat -c %i "$TARGET/appinfo.json" 2>/dev/null)
if [ -n "$si" ] && [ "$si" = "$ti" ]; then
  echo "mount already active (inode $ti)" >> "$LOG"
else
  if mount --bind "$STAGE" "$TARGET"; then
    echo "bind ok" >> "$LOG"
  else
    echo "bind FAILED" >> "$LOG"; exit 0
  fi
fi

# Restart SAM almost immediately (was: sleep 15 → the stock LG hub stayed on screen 15–100 s at cold boot).
# Timings are logged as seconds since kernel boot so we can measure how long the stock hub is visible.
# When SAM is back, create /tmp/myhome-sam-done — hook 36 waits for it before restarting the compositor,
# so the two heavy restarts no longer run at the same time.
up(){ cut -d" " -f1 /proc/uptime; }
echo "t=$(up)s mounted" >> "$LOG"
# Early takeover (deploy/early-takeover, LD_PRELOAD into SAM via /var/systemd/system/env/sam.env) already mounted
# our hub before SAM started → SAM launched ours first; no SAM restart needed.
if [ -f /tmp/myhome-early-done ]; then
  echo "t=$(up)s early takeover did it -> no sam restart" >> "$LOG"
  touch /tmp/myhome-sam-done
  # early.sh restarted the compositor + SAM at ~13 s; hook 36 then has nothing to do (and runs no watchdog),
  # so make sure a window is on screen: if nothing is in the foreground, launch our hub.
  fg=$(timeout 3 luna-send -n 1 -f luna://com.webos.surfacemanager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$fg" ]; then echo "t=$(up)s no foreground -> launch home" >> "$LOG"; luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
  else echo "t=$(up)s foreground=$fg ok" >> "$LOG"; fi
  exit 0
fi
rm -f /tmp/myhome-sam-done
( sleep 2; echo "t=$(up)s restart sam…" >> "$LOG"; restart sam >> "$LOG" 2>&1; echo "[$(date)] t=$(up)s sam restarted" >> "$LOG"; touch /tmp/myhome-sam-done ) &
exit 0
