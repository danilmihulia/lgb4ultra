# lgb4ultra — your own interface for the LG OLED B4 (2024)

A complete custom interface for one TV model: LG's home screen, screen saver, browser, input banners, system
pop-ups and on-screen keyboard are replaced with our own — no ads, no LG recommendations, fast and minimal.
Picture processing, HDMI, OLED protection, DRM and the firmware itself are **not** touched.

🇷🇺 / 🇺🇦 [Инструкция на русском — README.ru.md](README.ru.md)

> ⚠️ **Read [Disclaimer](#disclaimer) first.** This needs a rooted TV. It worked on **one** TV; your TV is your
> responsibility. Everything is reversible, but rooting and system changes always carry some risk.

## What you get

| | |
|---|---|
| **Hub** (home screen) | Replaces LG Home and the HOME button: categories, favourites, drag & drop, search, input switcher, our own settings screen (picture per input, sound, power timers, privacy, remote buttons), 10 interface languages, dark / light theme, «Power» menu on a long POWER press. |
| **Screen saver** | Your own wallpapers as a slideshow with a clock; also replaces LG's «No signal» photo show on HDMI. |
| **Browser** | Our own: tabs, bookmarks, history, start page, zoom, fullscreen video. No LG browser. |
| **Files** | File manager: USB sticks, wallpapers, trash, search, built-in video and audio player, import wallpapers from USB. |
| **Channels** | Free public IPTV playlists ([iptv-org](https://github.com/iptv-org/iptv)) with a programme guide; replaces LG's Live TV and opens on the GUIDE / TV buttons. Add your own M3U links. |
| **System** | LG alerts / toasts / USB card in the hub's style, our on-screen keyboard (remote colour keys work in it), no LG input banners, remote buttons → our screens (SETTINGS, SOURCE, GUIDE, digits, app buttons you choose). |
| **Boot** | No LG hub at power-on: black screen, then our hub (~40 s). LG logo off. A PS5 (HDMI-CEC) power-on goes straight to the console. |
| **Privacy** | Ad / tracker blocking for the whole TV (`/etc/hosts`), LG advertising / tracking / «smart tips» settings switched off. |

## Will it work on my TV?

**Only this combination was built and tested:**

- LG **OLED B4** (2024) — model `OLEDxxB4…` (tested: a 55″ OLED55B4)
- firmware **33.31.x** (tested: 33.31.75), webOS **25** (internally webOS 10.3)

The installer checks this and stops on anything else. Other 2024 LG models on the same platform *may* work with
`--force`, but nobody has tried — please don't, unless you know how to recover a rooted TV.

> ❗ **Do not update the TV's firmware.** LG closed the root exploit in firmware released after about 10 October 2026.
> Once updated you cannot root again (and a factory reset can also take root away). Switch automatic updates off
> (Settings → Support → Software Update; menu names can differ slightly) and turn on «Block system updates» in
> Homebrew Channel (step 3).

## What you need

- the TV and a PC (Windows, macOS or Linux) **on the same home network**;
- on the PC: [Python 3.8+](https://www.python.org/downloads/) (for the root tool), [Node.js 18+](https://nodejs.org/)
  (for our installer), an OpenSSH client (built into Windows 10/11, macOS and Linux);
- ~30 minutes.

## Installation

### 1. Check your TV

Settings → Support → Software Update (or «About this TV»): note the **firmware version** — it must be `33.31.xx`.
The model is on the same screen or on the sticker on the back. Write down the TV's **IP address**
(Settings → Network → Wi-Fi / wired → Advanced), e.g. `192.168.1.50`.

### 2. Root the TV with SlopBro

[SlopBro](https://github.com/throwaway96/slopbro) (by throwaway96) uses a webOS bug to get root and installs
[Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel). It does **not** flash firmware or touch the
bootloader. We don't redistribute it — get it from its author:

1. Download SlopBro: <https://github.com/throwaway96/slopbro> → green **Code** button → **Download ZIP** (or the
   [releases](https://github.com/throwaway96/slopbro/releases) page), unpack it.
2. TV on, connected to the internet (it downloads Homebrew Channel during the process).
3. On the PC, in the SlopBro folder:
   ```
   python3 slopbro.py 192.168.1.50
   ```
   (Windows: `python slopbro.py 192.168.1.50`; use your TV's IP.)
4. **Accept the pairing request on the TV** with the remote. Wait until it finishes — the **Homebrew Channel**
   app appears in the app list.
5. Problems? Read SlopBro's README: `--local-ip <your PC's IP>` if the TV can't reach the PC (allow Python through
   your firewall), `--webos-version`, `--debug`. Please don't open issues there just to report that it worked.

More about rooting LG TVs: [webosbrew.org](https://www.webosbrew.org/guides/rooting/), [cani.rootmy.tv](https://cani.rootmy.tv).

### 3. Homebrew Channel settings

Open **Homebrew Channel** on the TV → **Settings**:

- **Root status** must say *ok*;
- turn **on**: *SSH server*, *Block system updates*;
- turn **off**: *Telnet* (it has no password).

Then restart the TV once (hold POWER or unplug it for 30 s) and check that Homebrew Channel still shows root.

### 4. Get this project

```
git clone https://github.com/danilmihulia/lgb4ultra.git
cd lgb4ultra
```
(or green **Code** button → **Download ZIP**, unpack, open a terminal in the folder.)

### 5. SSH key (one time)

```
node install/setup-ssh-key.js 192.168.1.50
```
It creates `~/.ssh/lgb4ultra_ed25519` on your PC and asks once for the TV's root password: Homebrew Channel's
default is **`alpine`**. From then on the PC logs in with the key. Keep that key private — it is full access to your TV.

### 6. Try first (changes nothing)

```
node install/install.js 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519 --dry-run
```
Checks model + firmware, reads LG's original files from your TV, builds the patched copies and our apps locally and
prints what it would install. Windows PowerShell: write the key path as `"$HOME\.ssh\lgb4ultra_ed25519"`.

### 7. Install

```
node install/install.js 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519
```
Answer `y`, then let it reboot the TV. After the reboot the screen stays black for a while, then **our hub** appears.

Options: `--no-early` (keep LG's normal boot; our hub replaces it ~35 s later), `--no-sm-restart` (keep the LG boot
logo; LG pop-ups stay grey until the next compositor restart), `--no-adblock`, `--no-privacy` (leave LG's ad / tracking
settings alone), `--yes` (don't ask).

### 8. First steps

- **Wallpapers:** copy pictures to a USB stick → plug it in → «Open in Files» → select a folder → «Copy all to wallpapers».
- **Settings:** ⚙ in the hub (or the SETTINGS button): language, theme, picture, buttons, screen saver…
- **Remote:** HOME = hub · SETTINGS = hub settings · SOURCE = inputs · GUIDE = Channels · hold POWER = Power menu ·
  in the browser 🔴 = address bar, 🟢 = new tab, 🟡/🔵 = switch tabs.

## Recommended settings and wallpapers (optional)

Suggestions from the author's TV — not rules. Skip them and set everything yourself if you prefer.

**TV settings** — `presets/settings-recommended.json`: all ~3600 values of the author's TV (picture for every input ×
picture mode, sound, power, OLED care, privacy, accessibility…). Highlights:

- apps / hub: **Cinema** (SDR), **HDR Cinema**, Dolby Vision **Cinema Bright** without AI brightness — accurate picture,
  no motion smoothing;
- PS5 on **HDMI 1**: Game Optimizer with VRR + ALLM, **HGIG** for HDR games, **Deep Colour** on, AI brightness off;
  outside games Cinema / HDR Cinema;
- OLED care: pixel shift on, logo dimming high; LG tips, ad cookies, HbbTV ID, automatic updates off.

```
node scripts/settings-snapshot.js --tv 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519
node scripts/settings-restore.js presets/settings-recommended.json --tv 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519
node scripts/settings-restore.js presets/settings-recommended.json --tv 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519 --apply
```
1st line: a backup of **your** settings (`backups/settings/…`, restore it the same way). 2nd: shows what would change.
3rd: applies. Or add `--recommended-settings` to the install command. If your console is not on HDMI 1, the
console part lands on the wrong input — use `--only "general|option|sound|other"` or set the picture yourself.

**Wallpapers** — 115 pictures picked from the collections of wallhaven user
[43PR](https://wallhaven.cc/user/43PR) (list: `presets/wallpapers/wallhaven.txt`). They are **not** stored here: the
script downloads them from wallhaven.cc; the rights belong to their authors (personal use).

```
node scripts/get-wallpapers.js                                                     (→ ./wallpapers, then via USB)
node scripts/get-wallpapers.js --tv 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519    (straight onto the TV)
```
Then open «Files» once — it makes screen-size copies of very large images so the slideshow stays light.

## Security

Root changes the TV's security model — read [SECURITY.md](SECURITY.md) (what is exposed, what we lock down, what is still open).

## Uninstall

```
node install/uninstall.js 192.168.1.50 --key ~/.ssh/lgb4ultra_ed25519
```
Removes our boot hooks and apps, unmounts everything, puts LG's files back in use, reboots → stock LG interface.
`--purge` also deletes our data folders (wallpapers included). Root / Homebrew Channel stay (remove them in
Homebrew Channel if you want).

If the TV ever fails to start properly: Homebrew Channel's **failsafe mode** (it switches itself on after a crash at
boot) skips all our hooks and the early takeover → the TV starts with LG's stock interface; then run the uninstaller.

## How it works

Nothing in LG's read-only system image is modified. Our files live in `/media/developer`, `/var/lib/myhome` and
`/var/lib/webosbrew/init.d` and are **bind-mounted over** the stock ones at boot; unmount = stock again. LG's own
QML files are never shipped here: the installer reads them from **your** TV and patches them on the fly with the
scripts in `tv/`. Details: [docs/how-it-works.md](docs/how-it-works.md).

## Repository layout

| folder | |
|---|---|
| `apps/` | hub, screen saver, browser, files, channels (web apps) |
| `services/` | browser helper (`framegate.py`), programme-guide builder (`epg.py`) |
| `tv/` | boot hooks, early takeover, key filter, patch scripts for LG's pop-ups / input app / keyboard, power-on watcher, ad blocking |
| `install/` | installer, uninstaller, SSH key setup |
| `i18n/` | translations (10 languages); `scripts/` — translation tools, settings backup/restore, debug tools |

## Disclaimer

- This is an independent hobby project. **Not affiliated with, endorsed or supported by LG Electronics.** «LG»,
  «webOS» and other names are trademarks of their owners and are used only to say which TV this is for.
- **No LG software is included.** The patch scripts contain only short text anchors to find the places they change;
  the patched copies are created on your own TV from your own TV's files.
- Root tools (SlopBro, Homebrew Channel) are third-party projects; we only link to them.
- **Use at your own risk.** Rooting can void your warranty; system changes can make a TV unusable. The software is
  provided «as is», without warranty of any kind (see [LICENSE](LICENSE)). The authors are not liable for any damage.
- Channels shows only free public playlists from iptv-org and links you add yourself; the browser and Files are
  general-purpose tools. You are responsible for what you watch and open, and for following the laws of your country.

## License

[MIT](LICENSE) for everything in this repository. Third-party notes: [NOTICE.md](NOTICE.md).
