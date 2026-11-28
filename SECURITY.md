# Security

Rooting a TV changes its security. This is what changes with Homebrew Channel + lgb4ultra and what we do about it.
Please report problems privately via GitHub's «Report a vulnerability» (Security tab), not in a public issue.

## What root (Homebrew Channel) changes — on every rooted LG TV

- **SSH as root** on your home network. Use a key (`install/setup-ssh-key.js`): once a key is installed, Homebrew
  Channel no longer sets its default password (`alpine`) and password logins fail. **Turn Telnet off** — it has no password.
- **Homebrew Channel's `exec` service runs commands as root for any app** that may call public services. So only
  install apps you trust; a malicious app = full control of the TV.
- **Blocked system updates** = no LG security fixes either. That is the price of keeping root. Keep the TV behind
  your router (never port-forward to it) and don't browse shady sites on the TV.

## What lgb4ultra does

- **Our browser shows websites inside its own frames.** webOS gives every frame of an app the service bridge with the
  app's identity — so a website could have called Homebrew Channel's root `exec`. Since 2026-11-24 the browser (and
  «Channels») are removed from every service group: they don't call system services, and calls from their pages are
  refused (`Denied method call`). Hook `tv/hooks/43-browser.sh` re-checks this at every boot and the installer
  applies it right away. «Files» keeps access (it starts its own file service through Homebrew Channel) and shows only
  local files.
- **Our services don't listen on the network**: the Files service is bound to `127.0.0.1`; the other helpers have
  no network ports.
- **The browser helper strips anti-embedding headers** (`X-Frame-Options`, CSP `frame-ancestors`) — only for our
  browser's own tabs, so sites can be shown there. «Clickjacking» protection doesn't apply inside it.
- **Ad / tracker blocking** (`/etc/hosts`) and LG's ad / tracking settings switched off — fewer third-party scripts.

- **WebAppMgr's DevTools port 9998 is kept on the TV itself.** LG's own start script opens it
  (`--remote-debugging-port=9998`) on all network interfaces with no password, so any device on your home network
  could attach to a running web app and, through it, reach Homebrew Channel's root service. The engine has no
  "listen address" option and the kernel has no firewall (no iptables, no tc), so we preload a tiny library
  (`tv/bindlocal/bindlocal.c`, one function, no libc) that turns only `bind(0.0.0.0:9998)` into `bind(127.0.0.1:9998)`.
  It is loaded through a bind-mounted copy of LG's `webapp-mgr.sh` with one extra `LD_PRELOAD` line (the stock file
  is untouched), set up by hook `tv/hooks/34-devtools-local.sh` — at ~13 s from `early.sh`, before the engine starts.
  Casting from phones, AirPlay and the ThinQ app use other ports and are not affected. The browser helper still uses
  the port locally. Off: `touch /media/developer/myhome-sec/bindlocal.off` and reboot.

## Known open point

- Nothing big that we know of. Root itself is still root: keep the TV behind your router (never port-forward to it),
  keep untrusted devices off your home network (guest Wi-Fi for visitors) and only install apps you trust.
