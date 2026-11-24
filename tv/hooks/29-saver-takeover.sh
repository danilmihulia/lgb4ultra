#!/bin/sh
# Replace the stock Flutter screen saver (com.webos.app.screensaver) with our WEB slideshow.
# Mounts BEFORE 30-myhome-takeover.sh so that hook30's `restart sam` rescans and registers
# our web screensaver too — one rescan covers both home and saver. /usr is read-only squashfs,
# so we bind-mount a staged copy. Reversible: umount. Idempotent. Skipped in webOS failsafe.
STAGE=/media/developer/myhome-saver
TARGET=/usr/palm/applications/com.webos.app.screensaver
[ -f "$STAGE/appinfo.json" ] || exit 0
si=$(stat -c %i "$STAGE/appinfo.json" 2>/dev/null)
ti=$(stat -c %i "$TARGET/appinfo.json" 2>/dev/null)
[ -n "$si" ] && [ "$si" = "$ti" ] || mount --bind "$STAGE" "$TARGET" 2>/dev/null
# Wallpapers: ONE shared copy in myhome-home (edited by the «Файли» app). Bind it over the saver's
# (now empty) walls/ dir and walls.json placeholder so both slideshows always see the same set.
# (2026-11-19: replaced an 888 MB duplicate copy.) Idempotent via inode compare.
# walls-screen = screen-size copies of the oversized wallpapers (2026-11-21, scripts/make-screen-walls.py);
# both savers load walls-screen/<name>.jpg first and fall back to walls/<name>.
H=/media/developer/myhome-home
for p in walls walls.json walls-screen; do
  [ -e "$H/$p" ] && [ -e "$TARGET/$p" ] || continue
  [ "$(stat -c %i "$H/$p")" = "$(stat -c %i "$TARGET/$p")" ] && continue
  mount --bind "$H/$p" "$TARGET/$p" 2>/dev/null
done
exit 0
