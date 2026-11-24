# «Канали» EPG service — runs ON THE TV (python3), started by boot hook 41 (deploy/init.d/41-poweron-home.sh).
# Every 6 h: download free XMLTV guides (epgshare01) + the same free iptv-org playlists the app uses, match
# channels by name / tvg-id (Cyrillic transliterated), keep now-30 min .. now+12 h, and write a compact
#   epg.json  = { "<stream url>": [[start, stop, "title", "desc"], ...], ... }   (epoch seconds)
# into the app's own folder, where the web app reads it with fetch('epg.json'). Parsing is streamed (iterparse),
# so 70 MB guides never sit in memory — the WebAppMgr can't do this itself (TV RAM; see the wallpaper crash).
# Log: /media/developer/myhome-poweron/epg.log   Run once by hand: python3 epg.py --once
import gzip, json, os, re, sys, time, urllib.request
# NB: the TV's python3 has no xml package -> a small streaming regex parser below (XMLTV is very regular)

APP = '/media/developer/apps/usr/palm/applications/com.user.iptv'
OUT = APP + '/epg.json'
KEEP = '/media/developer/myhome-poweron/epg.json'   # survives app reinstalls
LOG = '/media/developer/myhome-poweron/epg.log'
TMP = '/tmp/myhome-epg'
PLAYLISTS = ['ua', 'be', 'uk', 'us', 'pl', 'de', 'fr', 'nl']          # iptv-org countries the app may show
GUIDES = ['UA1', 'BE2', 'UK1', 'US2', 'PLEX1', 'DISTROTV1', 'PL1', 'DE1', 'FR1', 'NL1']
EVERY = 6 * 3600     # refresh every 6 h; window below = 12 h ahead
UA = 'Mozilla/5.0 (webOS TV) myhome-epg'

def log(*a):
    try:
        with open(LOG, 'a') as f: f.write(time.strftime('%F %T ') + ' '.join(str(x) for x in a) + '\n')
    except Exception: pass

TR = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюяёэы',
              'a b v h g d e ye zh z y i yi y k l m n o p r s t u f kh ts ch sh shch  yu ya e e y'.split(' ')))
STOP = {'hd', 'sd', 'fhd', 'uhd', '4k', 'tv', 'channel', 'the', 'telekanal', 'int', 'international', 'europe', 'eu',
        'ua', 'uk', 'us', 'be', 'hevc'}
def key(s):
    s = ''.join(TR.get(ch, ch) for ch in s.lower())
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', '', s).split('@')[0]
    s = re.sub(r'\.(ua|uk|us2?|be|fr|nl|de|pl|cn)$', '', s)
    return ''.join(w for w in re.split(r'[^a-z0-9+]+', s) if w and w not in STOP)

def get(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f:
        while True:
            b = r.read(1 << 16)
            if not b: break
            f.write(b)

ENT = {'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'"}
def unesc(t):
    return re.sub(r'&(#x?[0-9a-fA-F]+|\w+);', lambda m: (chr(int(m.group(1)[2:], 16)) if m.group(1)[:2] == '#x' else
                  chr(int(m.group(1)[1:])) if m.group(1)[0] == '#' else ENT.get(m.group(1), m.group(0))), t)
RX_BLOCK = re.compile(r'<(channel|programme)\b([^>]*)>(.*?)</\1>', re.S)
RX_ATTR = re.compile(r'([\w-]+)="([^"]*)"')
def first(tag, body):
    m = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), body, re.S)
    return unesc(m.group(1)).strip() if m else ''
def blocks(path):
    """yield (kind, attrs, body) for every <channel>/<programme> of a gzipped XMLTV file, streaming"""
    buf = ''
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as f:
        while True:
            chunk = f.read(1 << 18)
            if not chunk: break
            buf += chunk
            last = 0
            for m in RX_BLOCK.finditer(buf):
                yield m.group(1), dict(RX_ATTR.findall(m.group(2))), m.group(3)
                last = m.end()
            buf = buf[last:]
            if len(buf) > 4 << 20: buf = buf[-(1 << 20):]   # safety: never let a broken file grow the buffer

def parse_time(s):   # "20261121100000 +0200" -> epoch seconds
    try:
        import calendar
        base = calendar.timegm(time.strptime(s[:14], '%Y%m%d%H%M%S'))
        off = s[15:].strip()
        if off:
            sign = -1 if off[0] == '-' else 1
            base -= sign * (int(off[1:3]) * 3600 + int(off[3:5]) * 60)
        return base
    except Exception:
        return None

def update():
    os.makedirs(TMP, exist_ok=True)
    t0 = time.time()
    # 1) playlist channels: key -> [urls]
    want = {}
    nchan = 0
    for cc in PLAYLISTS:
        p = TMP + '/' + cc + '.m3u'
        try: get('https://iptv-org.github.io/iptv/countries/%s.m3u' % cc, p)
        except Exception as e: log('playlist', cc, 'failed', e); continue
        txt = open(p, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'#EXTINF([^\n]*),([^\n]*)\n(?:#[^\n]*\n)*([^#\s][^\n]*)', txt):
            attrs, name, url = m.group(1), m.group(2), m.group(3).strip()
            tid = re.search(r'tvg-id="([^"]*)"', attrs)
            nchan += 1
            for k in {key(re.sub(r'\(\d+p\)', '', name)), key(tid.group(1)) if tid else ''}:
                if k: want.setdefault(k, set()).add(url)
        os.remove(p)
    lo, hi = time.time() - 1800, time.time() + 12 * 3600
    progs = {}   # url -> list
    matched_keys = set()
    # 2) guides, streamed
    for g in GUIDES:
        p = TMP + '/' + g + '.xml.gz'
        try: get('https://epgshare01.online/epgshare01/epg_ripper_%s.xml.gz' % g, p)
        except Exception as e: log('guide', g, 'failed', e); continue
        cid2urls = {}
        n = 0
        try:
            for kind, at, body in blocks(p):
                if kind == 'channel':
                    cid = unesc(at.get('id', ''))
                    names = [cid] + [unesc(x) for x in re.findall(r'<display-name[^>]*>([^<]*)</display-name>', body)]
                    urls = set()
                    for nm in names:
                        k = key(nm)
                        if k in want and k not in matched_keys:
                            urls |= want[k]; matched_keys.add(k)
                    if urls: cid2urls[cid] = urls
                else:
                    urls = cid2urls.get(unesc(at.get('channel', '')))
                    if urls:
                        a, b = parse_time(at.get('start', '')), parse_time(at.get('stop', ''))
                        if a and b and b > lo and a < hi:
                            item = [a, b, first('title', body), first('desc', body)[:120]]
                            for u in urls: progs.setdefault(u, []).append(item)
                            n += 1
        except Exception as e:
            log('guide', g, 'parse error', e)
        os.remove(p)
        log('guide', g, 'channels', len(cid2urls), 'programmes', n)
    for u in progs: progs[u].sort(key=lambda x: x[0])
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump({'t': int(time.time()), 'p': progs}, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    try:
        import shutil; shutil.copyfile(OUT, KEEP)
    except Exception: pass
    log('done: %d of %d channels have a guide, %d KB, %.0f s' % (len(progs), nchan, os.path.getsize(OUT) // 1024, time.time() - t0))

def main():
    try: os.nice(19)
    except Exception: pass
    if '--once' in sys.argv:
        update(); return
    time.sleep(120)   # let the boot settle first
    while True:  # checks hourly; also every 2 min for the first 10 min (app reinstall -> restore quickly)
        try:
            if not os.path.isdir(APP):
                pass   # app not installed
            elif not os.path.exists(OUT) and os.path.exists(KEEP) and time.time() - os.path.getmtime(KEEP) < EVERY:
                import shutil; shutil.copyfile(KEEP, OUT); log('restored epg.json after app reinstall')
            elif not os.path.exists(OUT) or time.time() - os.path.getmtime(OUT) > EVERY:
                update()
        except Exception as e:
            log('update failed', e)
        time.sleep(3600)

main()
