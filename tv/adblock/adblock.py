# My Home ad/tracker blocking — runs ON THE TV (python3), started by boot hook 42 (deploy/init.d/42-adblock.sh).
# Appends a compact blocklist (Peter Lowe's ad/tracking server list, ~3.5k domains) to /etc/hosts and to the jailed
# copies apps like LG's browser read (/var/palm/jail/<app>/etc/hosts). /etc/hosts is a tmpfs file rebuilt every
# boot, so nothing persistent in the system is changed. A list this size costs ~2 ms per name lookup (the 76k-domain
# StevenBlack list cost ~40 ms on this CPU — too slow for every app).
# Also keeps DuckDuckGo as the search engine of LG's own browser (not used by us any more, but harmless).
# Files: /media/developer/myhome-adblock/  block.hosts (current list), allow.txt (your exceptions, one domain per line),
#        adblock.log. Refresh: weekly. Off: touch adblock.off (the section is removed within a minute) or rm the hook.
import glob, os, re, sys, time, urllib.request

D = '/media/developer/myhome-adblock'
LIST = D + '/block.hosts'
ALLOW = D + '/allow.txt'
OFF = D + '/adblock.off'
LOG = D + '/adblock.log'
MARK = '# MYHOME-ADBLOCK'
SRC = 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext'
EVERY = 7 * 86400
RX_NAME = re.compile(r'^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$')


def log(*a):
    try:
        with open(LOG, 'a') as f: f.write(time.strftime('%F %T ') + ' '.join(str(x) for x in a) + '\n')
    except Exception: pass


def targets():
    return ['/etc/hosts'] + sorted(glob.glob('/var/palm/jail/*/etc/hosts'))


def rewrite(path, block):
    """keep the system part of the file, replace our section (or drop it when block is None)"""
    try:
        txt = open(path, encoding='utf-8', errors='replace').read()
    except Exception:
        return False
    base = txt.split(MARK)[0].rstrip('\n') + '\n'
    new = base if block is None else base + MARK + '\n' + block
    if new == txt: return False
    with open(path, 'w', encoding='utf-8') as f: f.write(new)   # in place: /etc/hosts is a mount point
    return True


def load_block():
    try:
        allow = {l.strip().lower() for l in open(ALLOW) if l.strip() and not l.startswith('#')}
    except Exception:
        allow = set()
    try:
        names = [l.split()[1] for l in open(LIST) if l.startswith('0.0.0.0 ')]
    except Exception:
        return None
    names = [n for n in names if n not in allow]
    return ''.join('0.0.0.0 %s\n' % n for n in names) if names else None


def refresh():
    req = urllib.request.Request(SRC, headers={'User-Agent': 'Mozilla/5.0'})
    raw = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    names = []
    for l in raw.splitlines():
        p = l.split()
        if len(p) >= 2 and p[0] in ('127.0.0.1', '0.0.0.0') and RX_NAME.match(p[1].lower()) and p[1] != 'localhost':
            names.append(p[1].lower())
    if len(names) < 1000:
        raise ValueError('list too short (%d) — keeping the old one' % len(names))
    tmp = LIST + '.tmp'
    with open(tmp, 'w') as f: f.write(''.join('0.0.0.0 %s\n' % n for n in sorted(set(names))))
    os.replace(tmp, LIST)
    log('list refreshed:', len(set(names)), 'domains')


def apply(block):
    n = sum(1 for p in targets() if rewrite(p, block))
    if n: log('applied to', n, 'file(s)' if block else 'file(s) — removed')


# LG browser: DuckDuckGo as the default search. LG can re-download search_engines_list.json (server version bump),
# which would drop our engine, so it is re-added whenever it is missing and the browser is not running.
BR = '/mnt/lg/cache/webbrowser/chrome'
DDG = {"name": "DuckDuckGo", "keyword": "duckduckgo.com", "favicon_url": "https://duckduckgo.com/favicon.ico",
       "search_url": "https://duckduckgo.com/?q={searchTerms}",
       "suggest_url": "https://duckduckgo.com/ac/?q={searchTerms}&type=list", "encoding": "UTF-8", "type": 0, "id": 92}


def browser_running():
    for p in glob.glob('/proc/[0-9]*/cmdline'):
        try:
            if open(p, 'rb').read().startswith(b'/mnt/otncabi/usr/palm/applications/com.webos.app.browser/chrome'): return True
        except Exception: pass
    return False


def ensure_ddg():
    import json
    p = BR + '/search_engines_list.json'
    try:
        l = json.load(open(p, encoding='utf-8'))
    except Exception:
        return
    if 'duckduckgo' in l.get('engine_list', {}) and all(l['country_list'].get(c, ['duckduckgo'])[:1] == ['duckduckgo'] for c in ('BE', 'DEFAULT', 'UA')):
        return
    if browser_running(): return
    l.setdefault('engine_list', {})['duckduckgo'] = DDG
    if 'duckduckgo' not in l.get('engine_code', []): l.setdefault('engine_code', []).append('duckduckgo')
    for c in ('BE', 'DEFAULT', 'UA'):
        cl = l.get('country_list', {}).get(c)
        if cl is not None:
            if 'duckduckgo' in cl: cl.remove('duckduckgo')
            cl.insert(0, 'duckduckgo')
    st = os.stat(p)
    with open(p + '.tmp', 'w', encoding='utf-8') as f: json.dump(l, f, ensure_ascii=False, indent=1)
    os.chown(p + '.tmp', st.st_uid, st.st_gid); os.replace(p + '.tmp', p)
    log('LG browser: DuckDuckGo re-added as default search')


def main():
    os.makedirs(D, exist_ok=True)
    if not os.path.exists(ALLOW):
        open(ALLOW, 'w').write('# one domain per line: never blocked (takes effect within a minute)\n')
    last_refresh = os.path.getmtime(LIST) if os.path.exists(LIST) else 0
    while True:
        try:
            if os.path.exists(OFF):
                apply(None); log('off switch — section removed, exiting'); return
            if time.time() - last_refresh > EVERY:
                try: refresh()
                except Exception as e: log('refresh failed:', e)
                last_refresh = time.time()   # retry next week (or after a reboot) even on failure
            block = load_block()
            if block: apply(block)          # also re-applies after jails are rebuilt or allow.txt changes
            try: ensure_ddg()
            except Exception as e: log('ddg check failed:', e)
        except Exception as e:
            log('error:', e)
        if '--once' in sys.argv: return
        time.sleep(60)


main()
