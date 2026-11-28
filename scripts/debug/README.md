# Debug tools

Run from the laptop (`node …`) or on the TV (`python3 …`, copy with scp to `/tmp` first). The TV address comes from
`config/device.local.json` (`host`) or the `TV_IP` environment variable.

| Tool | Where | What it does |
|---|---|---|
| `cdp-eval.js "<js>" [origin\|top]` | laptop | Runs JS in our browser app over WAM DevTools (TV port 9998): in every site frame whose origin contains the text, or in the app page itself with `top`. Runs as a user gesture, so `requestFullscreen()` etc. are allowed. |

Since 2026-11-28 port 9998 listens only on the TV itself (hook 34, `native/bindlocal`). For the laptop tools open a tunnel first: `ssh -i <your TV key> -N -L 9998:127.0.0.1:9998 root@<TV>` and point them at 127.0.0.1.

| `cdp-click.js x y` | laptop | A real mouse click at x,y in the browser app (move, press, release). |
| `brdbg.py`, `hubdbg.py`, `pagedbg.py <pageId> "<js>"` | TV | The same from the TV itself (127.0.0.1:9998), via the browser helper's `cdp.py` in `/media/developer/myhome-browser`. |
| `../tvkey.py UP DOWN OK 2 RED` | TV | Presses remote keys (writes into the Magic Remote's evdev node). A bare number = sleep seconds; for numeric key codes use a raw evdev writer. |
| `../settings-snapshot.js` | laptop | Snapshot of all TV settings → `backups/settings/` (read only). |
| `../settings-restore.js <snapshot> [--apply] [--only "cat\|cat"]` | laptop | Shows what differs from a snapshot; with `--apply` writes it back. |
