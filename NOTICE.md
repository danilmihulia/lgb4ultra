# Notices

**Not affiliated with LG Electronics.** LG, webOS, the LG logo and related names are trademarks of LG Electronics Inc.
Other product names (PS5, YouTube, Netflix, …) belong to their owners. They are mentioned only to describe
compatibility.

## What is NOT in this repository

- **No LG software, firmware, QML, images or icons.** LG's files that we change (system pop-ups, the input app, the
  on-screen keyboard, the compositor key-filter config) are read from the user's own TV by `install/install.js` and
  patched there and then; the scripts in `tv/` contain only short search strings to locate the lines they replace,
  plus our own code.
- No root exploit. Rooting uses third-party tools that are linked, not copied:
  - SlopBro — <https://github.com/throwaway96/slopbro>
  - Homebrew Channel — <https://github.com/webosbrew/webos-homebrew-channel>
- No TV channels, streams or media. «Channels» loads the public playlists of
  [iptv-org/iptv](https://github.com/iptv-org/iptv) at run time and any M3U links the user adds; the programme guide
  uses public XMLTV files from [epgshare01](https://epgshare01.online/). Their content and its legality in your
  country are the responsibility of their providers and of you.

## Data downloaded at run time

| What | From | Used by |
|---|---|---|
| Ad / tracker host list | Peter Lowe's list, <https://pgl.yoyo.org/adservers/> | `tv/adblock/adblock.py` |
| IPTV playlists | <https://iptv-org.github.io/> | `apps/iptv` |
| Programme guide (XMLTV) | <https://epgshare01.online/> | `services/epg/epg.py` |

## Build tools

`tv/early-takeover/libmyhome-early.so` is built from `myhome-early.c` (in the same folder) with Zig's C compiler:
`zig cc -target arm-linux-gnueabi.2.17 -shared -fPIC -O2 -s -o libmyhome-early.so myhome-early.c`.
