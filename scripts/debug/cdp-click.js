// Laptop-side debug: a real mouse click (move/press/release) at x,y in our browser app over WAM DevTools.
// node scripts/debug/cdp-click.js 1807 99
const [,, x, y] = process.argv.map(Number);
const IP = require('../tvssh').tvIp();
(async () => {
  const list = await (await fetch('http://' + IP + ':9998/json')).json();
  const pg = list.find(p => /com\.user\.browser/.test(p.url));
  const ws = new WebSocket(pg.webSocketDebuggerUrl); let id = 0;
  const send = (method, params) => new Promise(r => { const i = ++id; ws.addEventListener('message', function h(e) { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener('message', h); r(m); } }); ws.send(JSON.stringify({ id:i, method, params })); });
  await new Promise(r => ws.onopen = r);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  ws.close(); console.log('clicked', x, y);
})();
