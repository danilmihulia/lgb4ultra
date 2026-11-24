#!/bin/sh
# My Home: «Браузер» helper service (browser/service/framegate.py) — lets com.user.browser show sites in its own tabs
# (lifts "no embedding" headers for its tab frames only, relays keys/new-window requests). Talks to WebAppMgr's
# DevTools port 9998 on 127.0.0.1. Off: touch /media/developer/myhome-browser/framegate.off (+ kill the python process).
D=/media/developer/myhome-browser
if [ -f "$D/framegate.py" ] && [ ! -e "$D/framegate.off" ] && ! pgrep -f "myhome-browser/[f]ramegate.py" >/dev/null; then
  setsid /bin/sh -c "while [ ! -e $D/framegate.off ]; do python3 $D/framegate.py; sleep 5; done" </dev/null >/dev/null 2>&1 &
fi
exit 0
