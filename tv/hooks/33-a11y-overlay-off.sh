#!/bin/sh
# Disable the accessibility quick-overlay. Holding the ⋯ remote button launches
# com.webos.app.accessibility-overlay, which toggles "Звуковий опис" (audio description).
# /usr/palm is a read-only squashfs (firmware image) so we can't rm it; instead bind-mount
# an empty dir over the app so SAM has nothing to launch. Reversible: umount. Idempotent.
# The real Accessibility settings menu (com.webos.app.accessibility) is a separate app, untouched.
EMPTY=/media/developer/a11y-empty
TARGET=/usr/palm/applications/com.webos.app.accessibility-overlay
mkdir -p "$EMPTY"
[ -f "$TARGET/appinfo.json" ] || exit 0   # already masked (empty dir mounted) -> nothing to do
mount --bind "$EMPTY" "$TARGET" 2>/dev/null
exit 0
