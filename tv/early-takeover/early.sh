#!/bin/sh
# My Home early takeover, step 2 — run by libmyhome-early.so (via criu_remove_img.env) at ~12.9 s, right after
# the hub/saver bind mounts. Applies the compositor-side patches that boot hooks 36/37/38/40 used to apply at
# ~33 s (and then needed a compositor restart → black screen until ~50 s), and restarts the compositor + SAM
# now, while the boot logo is still up. Hooks 36–40 stay as a fallback: they see the mounts and do nothing.
# Revert everything early: rm /var/systemd/system/env/criu_remove_img.env.
LOG=/tmp/myhome-early.log
up(){ cut -d" " -f1 /proc/uptime; }
say(){ echo "t=$(up)s $*" >> "$LOG"; }
same(){ [ "$(stat -c %d:%i "$1" 2>/dev/null)" = "$(stat -c %d:%i "$2" 2>/dev/null)" ]; }
bindif(){ # src dst probe
  [ -e "$1$3" ] && [ -e "$2$3" ] || { say "skip $1 (missing)"; return 1; }
  same "$1$3" "$2$3" && { say "already $1"; return 1; }
  mount --bind "$1" "$2" && say "bind ok $1" || say "bind FAILED $1"
}
D=/media/developer
need_sm=0
# 34: WAM DevTools port 9998 only on 127.0.0.1 (LD_PRELOAD libbindlocal.so via a bind-mounted copy of LG's
# webapp-mgr.sh). FIRST, because WebAppMgr starts at ~15.6 s and must see the patched start script.
[ -f /var/lib/webosbrew/init.d/34-devtools-local.sh ] && { sh /var/lib/webosbrew/init.d/34-devtools-local.sh; say "bindlocal: $(tail -n 1 /tmp/myhome-sec.log 2>/dev/null)"; }
# 36: key filter config (HOME/SETTINGS/SOURCE/⋯/MIC + colour keys over the system keyboard)
if [ -f $D/myhome-keyfilter/myhome-keys.js ] && bindif $D/myhome-keyfilter/com.webos.surfacemanager.json /etc/configd/layers/base/com.webos.surfacemanager.json ""; then
  # background: it took ~4.4 s and blocked everything after it
  ( timeout 8 luna-send -n 1 luna://com.webos.service.config/reconfigure '{}' </dev/null >/dev/null 2>&1; say "configd reconfigure rc=$?" ) &
  need_sm=1
fi
# 37: alerts/toasts restyle + our USB card
bindif $D/notif-patched /usr/lib/qml/SystemUI/Notification /Toast.qml && need_sm=1
# 38: HDMI no-signal → our saver, dark input banner
# Restart the boot-restored (snapshot, stock QML) inputcommon now, before LG opens the last input (~17 s), so the
# input shown at boot already runs our QML (no "PS5" banner at boot). [Test 2026-11-22: the PS5-black bug turned out
# to be the early SAM restart, not this.] Hook 38 still restarts it at ~35 s if this didn't happen (marker file).
if bindif $D/inputcommon-patched/qml /usr/palm/applications/com.webos.app.inputcommon/qml /main.qml; then
  # its CRIU snapshot in /tmp was dumped from the stock-QML process LG started at ~6.6 s: set it aside (tmpfs, rebuilt
  # every boot) so the relaunch loads our QML / the patched snapshot in /mnt/lg/cmn_data/checkpoint instead
  [ -d /tmp/checkpoint/com.webos.app.inputcommon ] && rm -rf /tmp/myhome-ckpt-stale && mv /tmp/checkpoint/com.webos.app.inputcommon /tmp/myhome-ckpt-stale
  pkill -f "^/usr/bin/com.webos.app.inputcommon" 2>/dev/null && say "inputcommon restarted" || touch /tmp/myhome-inputcommon-restart
fi
# 40: our system keyboard (MaliitServer starts on demand; nothing to restart)
grep -q myHomeColor $D/maliit-qml/view-global/main.qml 2>/dev/null && bindif $D/maliit-qml /usr/lib/maliit/plugins/qml /view-global/main.qml
# restarts: compositor first (re-reads key filters + Notification QML), then SAM (rescans → our hub).
# --no-block = only queue the jobs; never wait inside the boot sequence.
# v3 (2026-11-22): make SAM re-read our hub + saver WITHOUT restarting it — SAM scanned the stock apps at ~6 s.
# block + release of a system app = SAM rescans that one app ("Try to rescan for unbinding"); verified live:
# getAppInfo picked up a changed appinfo.json. (A SAM restart at ~14 s broke HDMI/PS5 video for the session.)
rescan(){ luna-send -n 1 luna://com.webos.applicationManager/blockSystemApp "{\"id\":\"$1\"}" </dev/null >/dev/null 2>&1
          r=$(luna-send -n 1 luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$1\"}" </dev/null 2>&1)
          say "rescan $1: $r"; }
if [ ! -e /var/lib/myhome/sam-restart ]; then
  rescan com.webos.app.home
  same /media/developer/myhome-saver/appinfo.json /usr/palm/applications/com.webos.app.screensaver/appinfo.json && rescan com.webos.app.screensaver
fi
touch /tmp/myhome-early-done
# boot diagnostics (only if /var/lib/myhome/bootshots exists): a DISPLAY screenshot every 3 s until ~50 s
if [ -e /var/lib/myhome/bootshots ]; then
  ( mkdir -p /tmp/bootshots; while [ "$(cut -d. -f1 /proc/uptime)" -lt 52 ]; do
      n=$(cut -d. -f1 /proc/uptime)
      luna-send -n 1 luna://com.webos.service.capture/executeOneShot "{\"source\":\"DISPLAY\",\"path\":\"/tmp/bootshots/t$n.jpg\",\"format\":\"JPEG\",\"width\":480,\"height\":270}" </dev/null >/dev/null 2>&1 &
      sleep 3; kill $! 2>/dev/null
    done ) </dev/null >/dev/null 2>&1 &
fi
# In the background (the unit is RemainAfterExit, so this survives the script's exit), ONE AT A TIME:
# compositor restart → wait until it is up → SAM restart → watchdog that our hub really is on screen.
# (Both restarts at once lost the hub window: SAM launched it while the compositor was still coming up.)
(
  fgapp(){ timeout 3 luna-send -n 1 -f luna://com.webos.surfacemanager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -1; }
  # v2 (2026-11-22): NO compositor restart by default — it killed LG's boot logo (black screen) and cost ~12 s.
  # The compositor is already running at ~12 s; whatever it can't pick up live is tested on the TV.
  # Old behaviour back: touch /var/lib/myhome/sm-restart
  [ -e /var/lib/myhome/sm-restart ] || { [ $need_sm = 1 ] && say "compositor restart skipped (v2)"; need_sm=0; }
  if [ $need_sm = 1 ]; then
    old=$(pidof surface-manager)
    systemctl --no-block restart surface-manager-daemon.service; say "queued surface-manager restart"
    i=0
    while { p=$(pidof surface-manager); [ -z "$p" ] || [ "$p" = "$old" ]; } && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done   # new process
    i=0
    until timeout 2 luna-send -n 1 luna://com.webos.surfacemanager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | grep -q 'returnValue": *true' || [ $i -ge 30 ]; do sleep 1; i=$((i+1)); done
    sleep 1; say "compositor up (waited $i)"
  fi
  # Restarting SAM at ~14 s (before LG's boot sequence has launched the first app) left HDMI inputs (PS5) black for
  # the whole session (2026-11-22). Wait until LG's first app is on screen (bootd launches it ~17-20 s), max 30 s.
  i=0
  until [ -n "$(fgapp)" ] || [ $i -ge 30 ]; do sleep 1; i=$((i+1)); done
  if [ -e /var/lib/myhome/sam-restart ]; then   # old v2 path (SAM restart once the first app is up)
    sleep 2; systemctl --no-block restart sam.service; say "queued sam restart (first app up after ${i}s)"; sleep 4
  else
    fg=$(fgapp); say "first app up after ${i}s: $fg"
    # Woken by the PS5 (HDMI-CEC)? Then leave its input alone — no hub (same rule as the power-on watcher).
    r=$(timeout 3 luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerOnReason '{}' </dev/null 2>/dev/null | sed -n 's/.*"reason": *"\([^"]*\)".*/\1/p')
    if [ "$r" = hdmiCec ]; then say "power-on reason hdmiCec -> keep the input, no hub"; exit 0; fi
    # LG's first app is the last input (Live TV / HDMI). With no signal it pops LG's "Немає сигналу" box and then our
    # saver over everything until the hub is ready (~40 s) — close it; the boot logo / black stays until the hub.
    case "$fg" in com.webos.app.inputcommon|com.webos.app.livetv|com.webos.app.hdmi*|com.webos.app.comp*|com.webos.app.av*)
      timeout 5 luna-send -n 1 luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$fg\"}" </dev/null >/dev/null 2>&1; say "closed $fg (reason=$r)";;
    esac
  fi
  # then our hub on top (LG would only bring its home much later, via last_input_handler)
  j=0
  while [ $j -lt 20 ]; do
    fg=$(fgapp); [ "$fg" = com.webos.app.home ] && { say "foreground=$fg ok"; break; }
    say "foreground=${fg:-none} -> launch home"; luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
    sleep 2; j=$((j+1))
  done
) </dev/null >/dev/null 2>&1 &
exit 0
