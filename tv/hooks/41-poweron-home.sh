#!/bin/sh
# My Home: power-on watcher (open our hub when the TV is switched on with the remote, not via PS5/CEC)
# + POWER-hold menu (pwrkey.py grabs the IR remote device; dies -> remote works directly again).
# Scripts: /media/developer/myhome-poweron/ (deploy/poweron in the repo). Revert: rm this file + reboot.
D=/media/developer/myhome-poweron
[ -f "$D/poweron-home.sh" ] && setsid /bin/sh "$D/poweron-home.sh" </dev/null >/dev/null 2>&1 &
# keep pwrkey.py running (restart if it ever exits; not more often than every 10 s); off switch: touch $D/pwrkey.off
if [ -f "$D/pwrkey.py" ] && [ ! -e "$D/pwrkey.off" ] && ! pgrep -f "myhome-poweron/pwrkey.py" >/dev/null; then
  setsid /bin/sh -c "while [ ! -e $D/pwrkey.off ]; do python3 $D/pwrkey.py; sleep 10; done" </dev/null >/dev/null 2>&1 &
fi
# «Канали» programme guide (iptv/service/epg.py): refresh every 6 h into the app folder; off switch: touch $D/epg.off
if [ -f "$D/epg.py" ] && [ ! -e "$D/epg.off" ] && ! pgrep -f "myhome-poweron/epg.py" >/dev/null; then
  setsid /bin/sh -c "while [ ! -e $D/epg.off ]; do nice -n 19 python3 $D/epg.py; sleep 60; done" </dev/null >/dev/null 2>&1 &
fi
exit 0
