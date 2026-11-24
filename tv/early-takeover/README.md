# Early takeover (no LG hub at boot)

Our boot hooks (`/var/lib/webosbrew/init.d`) run only at ~33 s, so LG's stock hub used to show first and two
restarts (SAM, compositor) followed. This moves the takeover to ~13 s.

How: `criu_remove_img.service` (a tiny LG boot script, starts right after the writable flash is mounted at ~12.5 s)
reads `/var/systemd/system/env/criu_remove_img.env`, which preloads `libmyhome-early.so` with `MYHOME_EARLY=1`.
The library's constructor bind-mounts our hub + screensaver (+ walls), then runs `/var/lib/myhome/early.sh`, which
binds the compositor-side patches (key filter config, notifications, inputcommon, Maliit keyboard), asks configd to
reconfigure, and in the background restarts the compositor, then SAM, then makes sure our hub is on screen.
SAM itself can't be used: it starts at ~6.4 s, before `/var` (p59) is mounted.

Files on the TV: `/var/lib/myhome/libmyhome-early.so`, `/var/lib/myhome/early.sh`,
`/var/systemd/system/env/criu_remove_img.env`. Log: `/tmp/myhome-early.log`.
Boot screenshots for diagnostics: `touch /var/lib/myhome/bootshots` → `/tmp/bootshots/t<sec>.jpg` (remove after).

Revert: `rm /var/systemd/system/env/criu_remove_img.env` (hooks 29–40 still do everything later, as before).
Build: `zig cc -target arm-linux-gnueabi.2.17 -shared -fPIC -O2 -s -o libmyhome-early.so myhome-early.c`
(32-bit soft-float userspace, glibc 2.35; `_FILE_OFFSET_BITS 64` is required or stat() fails on ext4 inodes).

## 2026-11-22 — v2 timing rules (learned the hard way)
- No compositor restart (it killed LG's boot logo and cost ~12 s); the key filter still loads.
- **Never restart SAM before LG's first app is on screen** (~17–20 s). A SAM restart at ~14 s made LG launch the
  input app as bare `com.webos.app.inputcommon` instead of `hdmi1`, and HDMI inputs (PS5) stayed black for the whole
  session (Homebrew-failsafe A/B test proved it was ours). early.sh now waits for a foreground app, then restarts SAM
  (~22 s); hub still on screen ~37 s.
- Don't kill inputcommon at ~13 s either: early.sh only binds the patch and leaves a marker; hook 38 restarts the
  process at ~35 s.

## v3 (2026-11-22, current) — no SAM restart at all
- After the binds early.sh makes SAM re-read just our two apps: `blockSystemApp` + `releaseBlockSystemApp` for
  `com.webos.app.home` and `com.webos.app.screensaver` (SAM rescans an app when it is unblocked — verified: getAppInfo
  picked up a changed appinfo.json live). The calls take ~4 s at boot.
- Once LG's first app is up (~19 s, the last input): power-on reason `hdmiCec` (PS5 woke the TV) → leave it, no hub;
  otherwise close that input app (else LG's "Немає сигналу" box + no-signal saver show until the hub is ready) and
  launch our hub. Hub on screen ~41 s (WebAppMgr isn't ready earlier). PS5 picture OK (user-verified).
- Old v2 path (SAM restart after the first app): `touch /var/lib/myhome/sam-restart`.

## 2026-11-22 evening — compositor restart back ON (`/var/lib/myhome/sm-restart` exists on the TV)
- Without it surface-manager never loads the restyled popups (hook 37 / notif-patched is bound at ~13 s, but the
  compositor started at ~3 s with the stock QML) → after every boot LG's grey «Бажаєте вийти з програми?», USB card,
  toasts. Found after a reboot (test alert was grey; `systemctl restart surface-manager-daemon` fixed it live).
- User's choice of 3 options (blink after the hub / restart in standby / this): **black screen instead of LG's logo
  from ~13 s until the hub, no blink afterwards.** Undo: `rm /var/lib/myhome/sm-restart`.
- (Can't preload into surface-manager: it starts at ~3 s, before /var and /media are mounted.)

## Boot logos (2026-11-22)
- LG logo at power-on: OFF via the stock hidden setting `lgLogoDisplay` (settingsservice category `other`, read by
  tvpowerd). User-verified after a reboot. Undo: setSystemSettings {category:"other", settings:{lgLogoDisplay:"on"}}.
- webOS animation: bootd launches `com.webos.app.bootlogo` (QML /usr/lib/qml/BootLogo) via systemUIManager at ~5 s,
  before /var and /media are mounted → nothing of ours can stop it; customization.supportBootLogo is already false.
  It ends when the compositor restarts (~19 s); black screen until the hub (~45 s).
