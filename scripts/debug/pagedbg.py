import sys, json
sys.path.insert(0, '/media/developer/myhome-browser')
from cdp import WS
ws = WS('ws://127.0.0.1:9998/devtools/page/' + sys.argv[1], timeout=10)
ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': sys.argv[2], 'returnByValue': True}}))
while True:
    m = json.loads(ws.recv())
    if m.get('id') == 1: print(json.dumps(m.get('result'))[:1500]); break
