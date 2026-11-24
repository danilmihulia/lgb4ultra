# inputcommon-patch — HDMI no-signal → our saver, input banner restyle
`node make-patch.js <stock com.webos.app.inputcommon/qml copy> ./qml` regenerates the 2 patched files.
On TV: `/media/developer/inputcommon-patched/qml` = full stock copy + these files; hook 38 bind-mounts it.
Flow: LG PhotoSlide (opacity 0) starts → 2 s debounce → launch com.webos.app.screensaver.
Any key → saver closes itself (saver/index.html bye() → closeByAppId); SAM `running` subscription
notices it and, if there is still no signal, launches com.webos.app.home (user lands on the launcher, not black).
The 2-min comeback timer only relaunches while the input app is foreground. Signal back → closeByAppId.
NB: eim getAllInputStatus reports `activate:false` for HDMI_2 even while hdmi2 is on screen — don't use it.
Verified 2026-11-20 03:33–03:40: saver on no-signal, key → home, no saver over home for 160 s.
Banner: since 2026-11-22 ALL LG input banners are suppressed (BannerInterfaces.show() returns false; user does not want them). The InputBanner/SimpleBanner restyle stays but is no longer seen.

## CRIU snapshots (2026-11-22) — why patches "sometimes" didn't apply
inputcommon is usually RESTORED from a CRIU snapshot, not started: `/mnt/lg/cmn_data/checkpoint/com.webos.app.inputcommon`
(persistent) and `/tmp/checkpoint/...` (this boot). The old persistent snapshot (Oct 1) had stock QML in memory, so every
restore ran stock code regardless of our bind mount. Fixed: old snapshot moved to `/media/developer/criu-backup/`
(emmc + tmp); LG dumped a new one from a process running our QML. At cold boot LG still starts inputcommon fresh at
~6.6 s (stock, before our bind) and dumps it to /tmp — early.sh moves that /tmp snapshot aside before restarting the
process at ~13.7 s, so the relaunch comes from the patched persistent snapshot.
**If the patch ever changes or is reverted:** move `/mnt/lg/cmn_data/checkpoint/com.webos.app.inputcommon` aside again
(otherwise the old in-memory QML keeps running). Revert to stock = put criu-backup/emmc back.
