import sys, json
sys.path.insert(0, '/media/developer/myhome-browser')
from cdp import CDP
c = CDP()
c.send('Target.getTargets')
while True:
    m = c.recv()
    if m.get('id') == 1: break
t = [x for x in m['result']['targetInfos'] if '/com.user.browser/' in x.get('url', '')][0]
c.send('Target.attachToTarget', {'targetId': t['targetId'], 'flatten': True})
while True:
    m = c.recv()
    if m.get('id') == 2: s = m['result']['sessionId']; break
c.send('Runtime.evaluate', {'expression': sys.argv[1], 'awaitPromise': True, 'returnByValue': True}, s)
while True:
    m = c.recv()
    if m.get('id') == 3: print(json.dumps(m.get('result'))[:2000]); break
