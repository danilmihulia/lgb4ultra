// Laptop-side debug: evaluate JS inside our browser app (com.user.browser) over WAM DevTools (TV port 9998, LAN only).
// node scripts/debug/cdp-eval.js "<js>" [originMatch|top]  — runs in every frame whose origin contains originMatch
// (top = the app page itself), as a user gesture (so requestFullscreen etc. are allowed).
const [,, expr, match='w3schools'] = process.argv;
const IP = require('../tvssh').tvIp();
(async () => {
  const list = await (await fetch('http://' + IP + ':9998/json')).json();
  const pg = list.find(p => /index\.html/.test(p.url) && /com\.user\.browser/.test(p.url)) || list.find(p=>/user\.browser/.test(p.url));
  if (!pg) { console.log('no browser page', list.map(p=>p.url)); process.exit(1); }
  const ws = new WebSocket(pg.webSocketDebuggerUrl); let id = 0; const pend = {}; const ctx = [];
  const send = (method, params={}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id:i, method, params })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } if (m.method === 'Runtime.executionContextCreated') ctx.push(m.params.context); };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable'); await new Promise(r => setTimeout(r, 800));
  for (const c of ctx) {
    if (!(c.origin||'').includes(match) && !(match==='top' && /^file/.test(c.origin))) continue;
    const r = await send('Runtime.evaluate', { expression: expr, contextId: c.id, userGesture: true, awaitPromise: true, returnByValue: true });
    console.log(c.origin, c.name || '', JSON.stringify(r.result && (r.result.result ? (r.result.result.value ?? r.result.result.description) : r.result)));
  }
  ws.close();
})();
