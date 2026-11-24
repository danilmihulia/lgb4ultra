# Minimal Chrome DevTools Protocol client (stdlib only — the TV's python3 has no websocket module).
# Talks to WebAppMgr's DevTools endpoint (127.0.0.1:9998, enabled by LG on every TV for WAM).
import base64, json, os, socket, struct, urllib.request


class WS:
    def __init__(self, url, timeout=None):
        assert url.startswith('ws://')
        hostport, path = url[5:].split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ('GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
               'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n') % (path, hostport, key)
        self.s.sendall(req.encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            c = self.s.recv(4096)
            if not c: raise IOError('handshake failed')
            buf += c
        if b' 101 ' not in buf.split(b'\r\n')[0]: raise IOError('handshake: ' + buf[:80].decode('latin1'))
        self.rest = buf.split(b'\r\n\r\n', 1)[1]
        self.s.settimeout(timeout)

    def _read(self, n):
        while len(self.rest) < n:
            c = self.s.recv(65536)
            if not c: raise IOError('closed')
            self.rest += c
        d, self.rest = self.rest[:n], self.rest[n:]
        return d

    def send(self, text):
        data = text.encode()
        h = bytearray([0x81])
        n = len(data)
        if n < 126: h.append(0x80 | n)
        elif n < 65536: h.append(0x80 | 126); h += struct.pack('>H', n)
        else: h.append(0x80 | 127); h += struct.pack('>Q', n)
        mask = os.urandom(4); h += mask
        self.s.sendall(bytes(h) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        msg = b''
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7f
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            payload = self._read(n)
            op = b0 & 0x0f
            if op == 8: raise IOError('closed by peer')
            if op == 9:  # ping → pong
                self.s.sendall(bytes([0x8a, 0x80]) + os.urandom(4)); continue
            if op in (0, 1, 2): msg += payload
            if b0 & 0x80: return msg.decode('utf-8', 'replace')


class CDP:
    def __init__(self, port=9998):
        v = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/version' % port, timeout=5))
        self.ws = WS(v['webSocketDebuggerUrl'])
        self.n = 0

    def send(self, method, params=None, session=None):
        self.n += 1
        m = {'id': self.n, 'method': method, 'params': params or {}}
        if session: m['sessionId'] = session
        self.ws.send(json.dumps(m))
        return self.n

    def recv(self):
        return json.loads(self.ws.recv())
