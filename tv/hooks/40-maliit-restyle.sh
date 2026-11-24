#!/bin/sh
# My Home: LG's system on-screen keyboard (Maliit plugin QML) in our style + remote colour keys.
# STAGE = /usr/lib/maliit/plugins/qml copy patched by deploy/maliit-restyle/patch.js.
# /usr is read-only; bind-mount over it. MaliitServer starts on demand, so no restart is needed at boot.
# Revert: umount /usr/lib/maliit/plugins/qml; kill MaliitServer (it restarts on the next text field).
STAGE=/media/developer/maliit-qml
TARGET=/usr/lib/maliit/plugins/qml
[ -f "$STAGE/view-global/main.qml" ] || exit 0
grep -q myHomeColor "$STAGE/view-global/main.qml" || exit 0
grep -q " $TARGET " /proc/mounts && exit 0
mount --bind "$STAGE" "$TARGET" 2>/dev/null
exit 0
