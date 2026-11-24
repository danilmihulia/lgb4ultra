#!/bin/sh
# Patch com.webos.app.inputcommon QML (the native HDMI/AV input app; hdmiN run on it):
#  - no-signal photo slideshow -> handed off to OUR saver com.webos.app.screensaver
#  - "HDMI n / device" input banner -> dark launcher-style card
# STAGE = full copy of the stock qml dir with 2 patched files (repo: deploy/inputcommon-patch/qml).
# /usr is read-only; we bind-mount over it. Reversible: umount TARGET + kill the inputcommon processes
# (SAM re-spawns them from stock). Idempotent (inode check).
STAGE=/media/developer/inputcommon-patched/qml
TARGET=/usr/palm/applications/com.webos.app.inputcommon/qml
[ -f "$STAGE/main.qml" ] || exit 0
si=$(stat -c %i "$STAGE/main.qml" 2>/dev/null)
ti=$(stat -c %i "$TARGET/main.qml" 2>/dev/null)
if [ -n "$si" ] && [ "$si" = "$ti" ]; then   # already mounted (early takeover binds it at ~13 s)
  # ...but the boot-restored process still runs the stock QML: restart it now (not at ~13 s, see early.sh)
  [ -e /tmp/myhome-inputcommon-restart ] && rm -f /tmp/myhome-inputcommon-restart && pkill -f "^/usr/bin/com.webos.app.inputcommon" 2>/dev/null
  exit 0
fi
mount --bind "$STAGE" "$TARGET" 2>/dev/null || exit 0
# Pre-launched snapshot processes may already hold the stock QML: restart them (they are re-spawned).
pkill -f "^/usr/bin/com.webos.app.inputcommon" 2>/dev/null
exit 0
