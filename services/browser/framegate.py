# «Браузер» helper service — runs ON THE TV (python3), started by boot hook 43 (deploy/init.d/43-browser.sh).
# Our browser app (com.user.browser) shows every site in its own <iframe name="tabN"> tab. This service connects to
# WebAppMgr's DevTools endpoint (127.0.0.1:9998) and, ONLY for com.user.browser:
#   1. serves the document of each TAB frame without the headers that forbid embedding (X-Frame-Options, CSP
#      frame-ancestors). Frames that sites themselves nest keep their headers.
#   2. reports tab navigations / titles to the app   (app global __fgRecv(json))
#   3. relays remote keys pressed while a site has focus (BACK, colour keys) and window.open / target=_blank
#      requests from sites to the app (a site's document is cross-origin, the app can't see its keys)
#   4. runs history back/forward/reload in a tab on the app's request (app → Runtime binding __fgSend(json)).
# The app shows no site until this service says "ready" (WAM would show error -27 for a blocked frame).
# Log: /media/developer/myhome-browser/framegate.log
import base64, json, sys, time
sys.path.insert(0, '/media/developer/myhome-browser')
from cdp import CDP

APP = '/com.user.browser/'
LOG = '/media/developer/myhome-browser/framegate.log'
DEBUG = False

# injected into every tab document (top-level document of a tab frame only)
RELAY = r'''(function(){ if (window.__fgRelay || window.top === window) return; window.__fgRelay = 1;   // every frame inside a tab (players are nested frames)
  var send = function(o){ try { window.__fgKey(JSON.stringify(o)); } catch (e) {} };
  var K = {461:'back', 403:'red', 404:'green', 405:'yellow', 406:'blue'};
  window.addEventListener('keydown', function(e){
    var k = K[e.keyCode];
    if (!k) return; e.preventDefault(); e.stopImmediatePropagation(); send({key:k});
  }, true);
  var op = window.open; window.open = function(u){ if (u) { try { send({open:new URL(u, location.href).href}); } catch (e) {} return null; } return op ? op.apply(window, arguments) : null; };
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[target]') : null;
    if (a && a.href && /^(_blank|_new|_top|_parent)$/i.test(a.target) && /^https?:/.test(a.href)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (/^(_top|_parent)$/i.test(a.target)) location.href = a.href; else send({open:a.href});
    }
  }, true);
})();'''


def log(*a):
    try:
        with open(LOG, 'a') as f: f.write(time.strftime('%F %T ') + ' '.join(str(x) for x in a) + '\n')
    except Exception: pass


def strip(hs):
    out = []
    for h in hs or []:
        n = h['name'].lower()
        if n == 'x-frame-options': continue
        if n in ('content-security-policy', 'content-security-policy-report-only'):
            v = ';'.join(p for p in h['value'].split(';') if not p.strip().lower().startswith('frame-ancestors'))
            if not v.strip(): continue
            h = {'name': h['name'], 'value': v}
        if n in ('content-encoding', 'content-length', 'transfer-encoding'): continue   # body is re-served decoded
        out.append(h)
    return out


class Gate:
    def __init__(self):
        self.c = CDP()
        self.app = None          # app page session
        self.main = None         # app main frame id
        self.tabframes = {}      # frameId -> tab name (direct iframes of the app page)
        self.sess_tab = {}       # child session -> tab name   (out-of-process tab frames)
        self.ctx = {}            # frameId -> default execution context id (in-process tab frames)
        self.ctx_frame = {}      # execution context id -> frameId
        self.pending = {}        # cmd id -> callback

    def call(self, method, params=None, session=None, cb=None):
        i = self.c.send(method, params or {}, session)
        if cb: self.pending[i] = cb
        return i

    def to_app(self, obj):
        if self.app:
            self.call('Runtime.evaluate', {'expression': 'window.__fgRecv && __fgRecv(%s)' % json.dumps(json.dumps(obj))}, self.app)

    def session_for(self, tab):
        for s, t in self.sess_tab.items():
            if t == tab: return s
        return None

    # ---- setup ----
    def attach_app(self, s):
        self.app = s; self.tabframes = {}; self.sess_tab = {}; self.ctx = {}; self.ctx_frame = {}
        log('app attached')
        self.call('Page.enable', {}, s)
        self.call('Runtime.enable', {}, s)
        self.call('Runtime.addBinding', {'name': '__fgSend'}, s)
        self.call('Runtime.addBinding', {'name': '__fgKey'}, s)            # for in-process tab frames
        self.call('Page.addScriptToEvaluateOnNewDocument', {'source': RELAY}, s)
        def tree(r):   # also picks up tabs that were already open (service restarted while the app ran)
            ft = r['frameTree']; self.main = ft['frame']['id']
            for ch in ft.get('childFrames', []) or []:
                f = ch['frame']
                if (f.get('name') or '').startswith('tab'): self.tabframes[f['id']] = f['name']
        self.call('Page.getFrameTree', {}, s, cb=tree)
        self.call('Target.setAutoAttach', {'autoAttach': True, 'waitForDebuggerOnStart': True, 'flatten': True}, s)
        self.call('Fetch.enable', {'patterns': [{'urlPattern': '*', 'resourceType': 'Document', 'requestStage': 'Response'},
                                                   {'urlPattern': 'file:///usr/share/localization/wam/loaderror.html*', 'requestStage': 'Request'}]}, s)
        self.call('Page.addScriptToEvaluateOnNewDocument', {'source': 'window.__framegate=1;'}, s)
        self.ready()

    def ready(self):
        if self.app:
            self.call('Runtime.evaluate', {'expression': 'window.__framegate=1;window.dispatchEvent(new Event("framegate"))'}, self.app)

    def attach_child(self, s, ti):
        # an out-of-process frame (targetId == frameId); paused until resumed here
        tab = self.tabframes.get(ti['targetId'])
        if tab: self.sess_tab[s] = tab
        for m, p in (('Page.enable', {}), ('Runtime.addBinding', {'name': '__fgKey'}),
                     ('Page.addScriptToEvaluateOnNewDocument', {'source': RELAY}),
                     ('Fetch.enable', {'patterns': [{'urlPattern': '*', 'resourceType': 'Document', 'requestStage': 'Response'}]}),
                     ('Target.setAutoAttach', {'autoAttach': True, 'waitForDebuggerOnStart': True, 'flatten': True})):
            self.call(m, p, s)
        self.call('Runtime.evaluate', {'expression': RELAY}, s)
        self.call('Runtime.runIfWaitingForDebugger', {}, s)
        if DEBUG: log('child', tab, ti.get('url', '')[:60])

    def where(self, tab):
        # (session, extra evaluate params) to run code inside a tab's document, or None
        s = self.session_for(tab)
        if s: return s, {}
        for fid, name in self.tabframes.items():
            if name == tab and fid in self.ctx: return self.app, {'contextId': self.ctx[fid]}
        return None

    def evaluate(self, tab, expr, cb=None):
        w = self.where(tab)
        if not w: return False
        prm = dict({'expression': expr, 'returnByValue': True}, **w[1])
        self.call('Runtime.evaluate', prm, w[0], cb=cb)
        return True

    def title(self, s, tab):
        def cb(r):
            v = (r or {}).get('result', {}).get('value')
            if v is not None: self.to_app({'ev': 'title', 'tab': tab, 'title': v})
        self.evaluate(tab, 'document.title', cb)

    def nav(self, tab, url, s=None):
        self.to_app({'ev': 'nav', 'tab': tab, 'url': url})

    # ---- events ----
    def handle(self, m):
        if 'id' in m:
            cb = self.pending.pop(m['id'], None)
            if 'error' in m and DEBUG: log('cmd error', m['error'])
            if cb:
                try: cb(m.get('result'))
                except Exception as e: log('cb error', e)
            return
        meth, p, s = m.get('method'), m.get('params', {}), m.get('sessionId')
        if meth in ('Target.targetCreated', 'Target.targetInfoChanged'):
            ti = p['targetInfo']
            if ti.get('type') == 'page' and APP in ti.get('url', '') and not ti.get('attached'):
                self.call('Target.attachToTarget', {'targetId': ti['targetId'], 'flatten': True})
        elif meth == 'Target.attachedToTarget':
            ti, ns = p['targetInfo'], p['sessionId']
            if ti.get('type') == 'page' and APP in ti.get('url', '') and not s: self.attach_app(ns)
            elif ti.get('type') == 'iframe': self.attach_child(ns, ti)
            else: self.call('Runtime.runIfWaitingForDebugger', {}, ns)
        elif meth == 'Target.detachedFromTarget':
            ds = p.get('sessionId')
            if ds == self.app: self.app = None; log('app detached')
            self.sess_tab.pop(ds, None)
        elif meth == 'Page.frameAttached' and s == self.app:
            if p.get('parentFrameId') == self.main: self.tabframes.setdefault(p['frameId'], None)
        elif meth == 'Page.frameDetached' and s == self.app:
            self.tabframes.pop(p.get('frameId'), None)
        elif meth == 'Runtime.executionContextCreated' and s == self.app:
            c = p.get('context', {}); aux = c.get('auxData') or {}
            if aux.get('isDefault') and aux.get('frameId'):
                self.ctx[aux['frameId']] = c['id']; self.ctx_frame[c['id']] = aux['frameId']
        elif meth == 'Runtime.executionContextDestroyed' and s == self.app:
            fid = self.ctx_frame.pop(p.get('executionContextId'), None)
            if fid and self.ctx.get(fid) == p.get('executionContextId'): self.ctx.pop(fid, None)
        elif meth == 'Runtime.executionContextsCleared' and s == self.app:
            self.ctx = {}; self.ctx_frame = {}
        elif meth == 'Page.frameStoppedLoading' and s == self.app:
            tab = self.tabframes.get(p.get('frameId'))
            if tab: self.title(s, tab)
        elif meth == 'Page.frameNavigated':
            f = p.get('frame', {})
            fid, name = f.get('id'), f.get('name') or ''
            if s == self.app:
                if f.get('parentId') != self.main or not name.startswith('tab'): return
                self.tabframes[fid] = name
            else:
                if f.get('parentId'): return                       # a site's own nested frame
                name = self.sess_tab.get(s) or self.tabframes.get(fid) or (name if name.startswith('tab') else None)
                if not name: return
                self.sess_tab[s] = name; self.tabframes[fid] = name
            self.nav(name, f.get('url', '') + (f.get('urlFragment') or ''))
        elif meth == 'Page.loadEventFired':
            if s in self.sess_tab: self.title(s, self.sess_tab[s])
            elif s == self.app: self.ready()
        elif meth == 'Page.navigatedWithinDocument':
            tab = self.sess_tab.get(s) if s != self.app else self.tabframes.get(p.get('frameId'))
            if tab:
                self.nav(tab, p.get('url', ''))
                if s in self.sess_tab: self.title(s, tab)
        elif meth == 'Runtime.bindingCalled':
            try: msg = json.loads(p.get('payload') or '{}')
            except Exception: return
            tab = self.sess_tab.get(s) if s != self.app else self.tabframes.get(self.ctx_frame.get(p.get('executionContextId')))
            if p.get('name') == '__fgKey' and (tab or s != self.app or self.ctx_frame.get(p.get('executionContextId')) != self.main):
                msg['tab'] = tab or ''          # a nested frame (e.g. a video player): the app uses its active tab
                if 'open' in msg:
                    if not str(msg['open']).startswith(('http://', 'https://')): return
                    self.to_app({'ev': 'open', 'tab': msg['tab'], 'url': msg['open']})
                elif msg.get('key') in ('back', 'red', 'green', 'yellow', 'blue'):
                    self.to_app({'ev': 'key', 'tab': msg['tab'], 'key': msg['key']})
            elif p.get('name') == '__fgSend' and s == self.app and self.ctx_frame.get(p.get('executionContextId'), self.main) == self.main:   # only the app itself, not sites
                self.command(msg)
        elif meth == 'Fetch.requestPaused':
            self.paused(s, p)

    def paused(self, s, p):
        req, hs, fid = p['requestId'], p.get('responseHeaders'), p.get('frameId')
        url = p.get('request', {}).get('url', '')
        # WAM replaces the WHOLE app with its error page when any frame fails (e.g. a site's nested ad frame cut off
        # by the ad blocker) → never let that page load into our app; the failed frame just stays empty
        if url.startswith('file:///usr/share/localization/wam/loaderror.html'):
            if DEBUG: log('blocked WAM error page', url[45:120])
            self.call('Fetch.failRequest', {'requestId': req, 'errorReason': 'Aborted'}, s); return
        # every frame inside our browser (tabs and the frames sites nest in them): "same origin" checks would compare
        # with our app page (file://), so a site's own nested frames would be blocked too
        ours = (s == self.app and fid != self.main) or s in self.sess_tab or (s != self.app)
        if DEBUG: log('paused', 'app' if s == self.app else 'child', fid, 'ours' if ours else 'NOT', p.get('request', {}).get('url', '')[:70], [h['name'] for h in (hs or []) if h['name'].lower() in ('x-frame-options', 'content-security-policy')])
        if hs is None or not ours:
            self.call('Fetch.continueRequest', {'requestId': req}, s); return
        blocking = any(h['name'].lower() == 'x-frame-options' or
                       (h['name'].lower() == 'content-security-policy' and 'frame-ancestors' in h['value'].lower()) for h in hs)
        if not blocking:
            self.call('Fetch.continueRequest', {'requestId': req}, s); return
        code, new = p.get('responseStatusCode', 200), strip(hs)
        def cb(r):
            if not r:
                self.call('Fetch.continueRequest', {'requestId': req}, s); return
            body = r['body'] if r.get('base64Encoded') else base64.b64encode(r['body'].encode('utf-8')).decode()
            self.call('Fetch.fulfillRequest', {'requestId': req, 'responseCode': code, 'responseHeaders': new, 'body': body}, s)
        self.call('Fetch.getResponseBody', {'requestId': req}, s, cb=cb)

    def command(self, msg):
        tab, cmd = msg.get('tab'), msg.get('cmd')
        if cmd == 'hello':
            self.ready(); return
        js = {'back': 'history.back()', 'forward': 'history.forward()', 'reload': 'location.reload()'}.get(cmd)
        if cmd == 'title': self.title(None, tab)
        elif js: self.evaluate(tab, js)

    def run(self):
        self.call('Target.setDiscoverTargets', {'discover': True})
        log('connected')
        while True:
            self.handle(self.c.recv())


if __name__ == '__main__':
    if '--debug' in sys.argv: DEBUG = True
    while True:
        try: Gate().run()
        except Exception as e: log('error:', repr(e))
        time.sleep(3)
