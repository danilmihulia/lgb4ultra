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

## Known open point

- **WebAppMgr's DevTools port 9998** is opened by LG's own start script (`--remote-debugging-port=9998`, all network
  interfaces) and has no password: any device on your home network can attach to running web apps. The browser
  helper uses it locally. The kernel has no firewall (no iptables), so it can't simply be blocked; binding it to
  localhost needs a patched WebAppMgr start script (planned). Until then: keep untrusted devices off your home
  network (use a guest Wi-Fi for visitors).
