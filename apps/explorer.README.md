# «Файли»: file explorer for the TV (com.user.explorer)

A remote-friendly file manager for the rooted LG B4. Browse the whole filesystem (read-only outside the safe roots), preview images full-screen, **play video and audio** (from USB or anywhere), **search file names** across the wallpapers and USB sticks, delete into a restorable Кошик, and copy images from a USB stick into the wallpapers. `walls.json` (read by both screensavers) is rebuilt after every change to `walls/`.

## Video / audio (v1.1)
- Players use the TV's own web media stack (`<video>`/`<audio>` in WAM, which uses the hardware decoders). The source is `file://<path>` first (the stick is read directly, any size, nothing is copied), then `http://127.0.0.1:7655/api/file` with HTTP Range as a fallback for paths the file:// sandbox refuses.
- Verified on this TV from `file:///tmp/usb/sda/sda1/…`:
  - Containers: MP4, MOV, MKV, TS, AVI, WebM.
  - Video codecs: H.264, HEVC 8/10-bit, AV1, VP9, XviD.
  - Audio: AAC, AC3, E-AC3, MP3, Opus, FLAC, Vorbis, WAV.
  - A 4K 40 Mbit/s 900 MB MKV plays and seeks instantly.
  - `canPlayType()` is unreliable here (it says "" for MKV, which plays fine), so the app just tries the file.
  - No need for LG's native player.
- The tvpower screensaver is held off while something plays (`registerScreenSaverRequest` → `ack:false`). A 150 s idle playback test was not interrupted.
- Video: position is remembered per file for videos longer than 5 minutes and resumed on reopen.
- Audio: the playlist is every audio file in the current folder (or search results), with auto-advance.
- Re-run the format check any time: launch with `{"probe":"/some/dir"}`. It plays each media file for about 3 s and writes results to `/tmp/explorer-client.log`.

## Launch params
| params | effect |
|---|---|
| `{}` | normal open (wallpapers) |
| `{"search":"text"}` | filename search (AND of words, case-insensitive) in `walls/` + every USB stick, max 400 hits. Works on cold start and on relaunch (`webOSRelaunch`). |
| `{"path":"/dir"}` | open that folder |
| `{"path":"/dir/file.mkv"}` | open the folder, focus the file and open it (image / video / audio) |
| `{"probe":"/dir"}` | dev: media format probe (see above) |

Search is also in 🔵 Menu → «Пошук файлів…» (on-screen keyboard). BACK from results goes back to where you were.

## How it works
- `app/index.html` is a normal dev web app in `/media/developer/apps/usr/palm/applications/com.user.explorer/`. It talks over XHR to `http://127.0.0.1:7655`.
- `app/server.js` is a Node 16 HTTP API that runs **as root**, listens only on 127.0.0.1, and has no dependencies. The app starts it on demand: `PalmServiceBridge` → `luna://org.webosbrew.hbchannel.service/exec` (public on this TV, runs as root) → `systemd-run --unit=myhome-explorer node …/server.js`. The transient systemd unit survives the exec call, and the server exits by itself after 30 minutes with no requests, or when the app is closed through its BACK dialog. **No boot hook and no system files changed.**
- Request guard: only the file:// app (`Origin: null`) or clients without an Origin header may call it. POST also requires the `X-Explorer: 1` header, which makes browsers send a preflight.

## Safety rules (enforced server-side)
- Writable only: files and folders inside `/media/developer/myhome-home/walls/`, inside USB mounts (`/tmp/usb/sdX/sdXN`), and inside the trash folders. Everything else returns «захищена папка» (protected folder).
- Delete = move to trash, which is restorable from Кошик:
  - internal → `/media/developer/.explorer-trash/`
  - USB → `<stick>/.explorer-trash/` (same filesystem, so the move is instant)
  - Each item gets a `.origin` file that holds its original path.
- «Видалити назавжди» («Delete forever»), only inside Кошик, and «Очистити кошик» («Empty trash») are the only permanent operations, and both ask for confirmation.
- Import never overwrites. A same-name, same-size file is skipped; a different file with the same name gets a `-1` suffix. It copies to a `.importing-*` temp file and then renames.

## Remote
| Key | List | Full-screen preview |
|---|---|---|
| ▲▼ / ◀ | move / go to Місця (places) | ◀▶ previous / next image |
| OK | open folder / preview image | show bar, then OK = delete |
| 🔴 | delete (marked or focused) | delete |
| 🟢 | copy to wallpapers (restore in Кошик) | copy to wallpapers |
| 🟡 | mark / unmark | — |
| 🔵 | menu: copy all images in folder, mark all, sort, rebuild walls.json, refresh | — |
| BACK | clear marks → parent folder → Місця → close dialog | close preview |

| Key | Video player | Audio player |
|---|---|---|
| OK / ▶❚❚ | play / pause | pause, or play the highlighted track |
| ◀ ▶ (also ⏪ ⏩) | −/+10 s; holding speeds up to 30 s, then 60 s | −/+10 s |
| ▲ ▼ | +/−1 min | move through the playlist |
| CH+ / CH− | previous / next video in folder | previous / next track |
| BACK / ⏹ | close (remembers position) | close |

The Magic Remote pointer can click every row, place and footer button.

## Build / deploy / remove
```powershell
powershell -ExecutionPolicy Bypass -File explorer\build.ps1      # -> explorer\dist\com.user.explorer_<ver>_all.ipk
powershell -ExecutionPolicy Bypass -File explorer\deploy.ps1     # scp + appInstallService/dev/install + launch
powershell -ExecutionPolicy Bypass -File explorer\deploy.ps1 -Uninstall
```
Uninstall keeps `/media/developer/.explorer-trash`. Delete it by hand if you want.

Future idea, not built: download from the internet onto the stick. See [DOWNLOADER-DESIGN.md](DOWNLOADER-DESIGN.md).

## Testing helpers
- `luna-send` over SSH prints nothing unless stdin is redirected: `luna-send -n 1 -f luna://… '{…}' </dev/null >/tmp/o.txt 2>&1 & sleep 3; cat /tmp/o.txt`.
- `tools/tvkey.py` runs on the TV: `python3 /tmp/tvkey.py DOWN OK 2 RED`. It writes key events into the Magic Remote evdev node (`/dev/input/event3`); a number means sleep for that many seconds. OK = 28, BACK = 412, colours = 398–401. (Writes through the networkinput pointer socket never reached the app. A new `/dev/uinput` device worked once, then stopped, so it's unreliable.)
- Laptop UI check: the `explorer-ui` entry in `.claude/launch.json` serves `explorer/app`. Run the server on the TV with `EXPLORER_DEV_ORIGIN=http://localhost:8765` behind `ssh -L 7655:127.0.0.1:7655`.
