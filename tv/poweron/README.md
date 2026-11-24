# Power-on hub + POWER-hold menu

Both run on the TV from boot hook `deploy/init.d/41-poweron-home.sh`; files live in `/media/developer/myhome-poweron/`.

## poweron-home.sh — hub on power-on
- Subscribes to `tvpower/power/getPowerState`; on a real power-on (any state → `Active`, except screen-off) it reads
  `getPowerOnReason`. Remote / TV button / voice (`remoteKey localKey aiKey upDownKey lastPowerOn quickStart voice*`)
  → launch our hub. PS5 over HDMI-CEC (`hdmiCec`), casting, Wake-on-LAN, app buttons, timers → untouched.
- Guard (after boot and after every hub power-on): close `com.webos.app.livetv` (LG starts it first; with no aerial its
  no-signal slideshow then launched our saver over the hub) and for 30–40 s close `com.webos.app.screensaver` if it
  pops up over the hub.
- Log: `/media/developer/myhome-poweron/poweron.log`.

## pwrkey.py — hold POWER → our menu
- POWER never reaches surface-manager key filters (eaten in C++ by `QStarfishPowerDBridge`), and tvpower's
  power-off request clients can't veto (`NACK` → "The response is too late").
- The Magic Remote sends POWER alone over the IR device `LGE RCU` (all other keys use `LGE M-RCU`), so pwrkey.py
  takes that device exclusively (`EVIOCGRAB`):
  - short press → re-injected into the device node on release → LG powers off as usual;
  - hold ≥ 0.7 s → `tvpower/power/cancelPowerOff` + `power2/cancelPowerOff` (**required**: the micom also saw the IR
    key and hard-resets the TV a few seconds later unless told to cancel), then the hub opens `{open:'power'}`.
- Hub menu «Живлення»: Вимкнути (`power2/powerOff`), Вимкнути екран (`power/turnOffScreen`), Перезавантажити
  (`micomservice/requestAutoPowerOffOn` — LG's own restart), Скасувати (back to the previous app).
- Fail-safe: process dies → the kernel drops the grab → stock POWER behaviour.
- Off switch: `touch /media/developer/myhome-poweron/pwrkey.off` and kill the python process (or reboot).
- Log: `/media/developer/myhome-poweron/pwrkey.log` (fsync'd — power-offs cut the write cache).
- `keylog.py` = diagnostics (logs every key event of every input device).

## «Канали» instead of Live TV (2026-11-22)
poweron-home.sh also subscribes to SAM getForegroundAppInfo: when `com.webos.app.livetv` comes to the foreground
after boot (uptime ≥ 90 s; LG menus, keys, anything) it is closed and `com.user.iptv` opens instead (verified).
Also: hub «Джерело сигналу» → «📺 Канали», hub FALLBACK, key filter GUIDE / TV / Live-TV-menu keys → com.user.iptv.
