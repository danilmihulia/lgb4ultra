#!/bin/sh
# Restyle LG system alerts + toasts (surface-manager QML /usr/lib/qml/SystemUI/Notification)
# to match the My Home launcher (dark cards, white text, white focus ring).
# STAGE = full copy of the stock dir with 4 patched files (deploy/notif-restyle/qml in the repo).
# /usr is read-only; we bind-mount over it. Reversible: umount TARGET + restart surface-manager-daemon.
# Runs at boot before/around surface-manager start; if surface-manager already loaded the stock
# QML it is restarted ONCE so the patch takes effect. Idempotent (inode check).
STAGE=/media/developer/notif-patched
TARGET=/usr/lib/qml/SystemUI/Notification
[ -f "$STAGE/Toast.qml" ] || exit 0
si=$(stat -c %i "$STAGE/Toast.qml" 2>/dev/null)
ti=$(stat -c %i "$TARGET/Toast.qml" 2>/dev/null)
[ -n "$si" ] && [ "$si" = "$ti" ] && exit 0   # already mounted
mount --bind "$STAGE" "$TARGET" 2>/dev/null || exit 0
# surface-manager must restart once to load the patched QML. Hook 36 already does that at boot
# (+12s, after this mount), so only restart here when hook 36 is absent.
[ -x /var/lib/webosbrew/init.d/36-keyfilter-patch.sh ] || \
  (sleep 15; systemctl restart surface-manager-daemon) >/dev/null 2>&1 &
exit 0
