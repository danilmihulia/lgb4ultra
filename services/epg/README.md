# «Канали» — IPTV app (com.user.iptv)
Web app; free public playlists from the open iptv-org catalogue (built-in: UA, BE, UK, US, CN on; PL/DE/FR/NL and world
news/sports/movies/music off), plus user M3U links (Джерела → ＋). Lists cached in localStorage, refreshed daily.
Keys: OK watch · ▲▼/CH± zap · digits = channel number · 🔴 favourite · 🟢 search · 🟡 refresh · 🔵 sources · BACK.
Dead streams are dimmed (retried after 7 days). Streams needing custom HTTP headers may fail (<video> can't send them).
GUIDE / TV keys open it (deploy/keyfilter), and it replaces LG Live TV everywhere (deploy/poweron/README.md).

## EPG (v1.1.0, 2026-11-22)
`iptv/service/epg.py` runs on the TV (hook 41, `/media/developer/myhome-poweron/epg.py`, log `epg.log`, off: touch `epg.off`).
Every 6 h: free XMLTV from epgshare01 (UA1 BE2 UK1 US2 PLEX1 DISTROTV1 PL1 DE1 FR1 NL1) + the iptv-org playlists, channels
matched by normalized name / tvg-id (Cyrillic transliterated), window now-30 min..+12 h, descriptions ≤120 chars →
`epg.json` {url: [[start, stop, title, desc]]} in the app folder (~2.3 MB; copy kept in myhome-poweron/ and restored
after an app reinstall). The TV python has NO xml module → streaming regex parser. ~1 min per run; 1017/3010 channels.
App: card shows ▶ now + progress bar; player OSD now/next; ▶ (RIGHT) = programme panel (next 9 items).
Build/install: `iptv\build.ps1`, `iptv\deploy.ps1`.
