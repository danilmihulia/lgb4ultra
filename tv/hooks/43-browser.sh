#!/bin/sh
# My Home: «Браузер» helper service (browser/service/framegate.py) — lets com.user.browser show sites in its own tabs
# (lifts "no embedding" headers for its tab frames only, relays keys/new-window requests). Talks to WebAppMgr's
# DevTools port 9998 on 127.0.0.1. Off: touch /media/developer/myhome-browser/framegate.off (+ kill the python process).
D=/media/developer/myhome-browser
# SECURITY (2026-11-24): websites open inside the browser's own frames, and WebAppMgr gives every frame of an app the
# webOS service bridge with the app's identity. Homebrew Channel's root «exec» service is open to the whole "public"
# group → a site could run root commands. Neither the browser nor «Канали» calls any luna service, so take both out
# of every group (the files are rewritten on each app (re)install; checked at every boot). Undo: put back
# {"<id>-*":["public"]} and run ls-control scan-services.
CH=""
for a in com.user.browser com.user.iptv; do
  F=/var/luna-service2-dev/client-permissions.d/$a.app.json
  [ -f "$F" ] || continue
  want="{\"$a-*\":[]}"
  [ "$(cat "$F")" = "$want" ] || { printf '%s' "$want" > "$F"; CH=1; }
done
[ -n "$CH" ] && ls-control scan-services >/dev/null 2>&1
if [ -f "$D/framegate.py" ] && [ ! -e "$D/framegate.off" ] && ! pgrep -f "myhome-browser/[f]ramegate.py" >/dev/null; then
  setsid /bin/sh -c "while [ ! -e $D/framegate.off ]; do python3 $D/framegate.py; sleep 5; done" </dev/null >/dev/null 2>&1 &
fi
exit 0
