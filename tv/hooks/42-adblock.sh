#!/bin/sh
# My Home: ad/tracker blocking via /etc/hosts (deploy/adblock/adblock.py). /etc/hosts is a tmpfs file rebuilt every
# boot, so removing this hook + a reboot restores stock completely. Off without reboot:
#   touch /media/developer/myhome-adblock/adblock.off   (our section is removed within a minute)
D=/media/developer/myhome-adblock
if [ -f "$D/adblock.py" ] && [ ! -e "$D/adblock.off" ] && ! pgrep -f "myhome-adblock/adblock.py" >/dev/null; then
  setsid /bin/sh -c "while [ ! -e $D/adblock.off ]; do nice -n 19 python3 $D/adblock.py; sleep 60; done" </dev/null >/dev/null 2>&1 &
fi
exit 0
