// "Файли" (com.user.explorer) backend: a tiny root HTTP API on 127.0.0.1 only.
// Started on demand by the app through org.webosbrew.hbchannel.service/exec +
// systemd-run (unit myhome-explorer). Exits on its own after IDLE_MS without requests.
// Node 16 on the TV, no dependencies.
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const VERSION = '1.3.0';
const PORT = +process.env.EXPLORER_PORT || 7655; // env override for side-by-side testing only
const HOST = '127.0.0.1';
const IDLE_MS = 30 * 60 * 1000;

const HOME = '/media/developer/myhome-home';
const WALLS = HOME + '/walls';
const WALLS_JSON = HOME + '/walls.json';
const SCREEN = HOME + '/walls-screen';   // screen-size copies for the savers (<name>.jpg); originals untouched
const USB_ROOT = '/tmp/usb';
const INT_TRASH = '/media/developer/.explorer-trash';
const TRASH_NAME = '.explorer-trash';

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const VID_RE = /\.(mp4|m4v|mkv|webm|avi|mov|ts|m2ts|mts|mpe?g|wmv|asf|flv|3gp|divx|vob)$/i;
const AUD_RE = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|wma|ac3|eac3|mka|ape|aiff?)$/i;
function kindOf(name) { return IMG_RE.test(name) ? 'image' : VID_RE.test(name) ? 'video' : AUD_RE.test(name) ? 'audio' : null; }
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', avif: 'image/avif', txt: 'text/plain; charset=utf-8', json: 'application/json',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm',
  avi: 'video/x-msvideo', ts: 'video/mp2t', m2ts: 'video/mp2t', mts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  wmv: 'video/x-ms-wmv', asf: 'video/x-ms-asf', flv: 'video/x-flv', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma', ac3: 'audio/ac3', mka: 'audio/x-matroska' };

let idleTimer = null;
function touch() { clearTimeout(idleTimer); idleTimer = setTimeout(() => process.exit(0), IDLE_MS); }

// ---------- helpers ----------
function norm(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) throw httpErr(400, 'bad path');
  const n = path.posix.normalize(p);
  return n.length > 1 ? n.replace(/\/+$/, '') : n;
}
function under(p, root) { return p === root || p.startsWith(root + '/'); }
function httpErr(code, msg) { const e = new Error(msg); e.code_ = code; return e; }

async function usbMounts() {
  let txt = '';
  try { txt = await fsp.readFile('/proc/mounts', 'utf8'); } catch (e) { return []; }
  const labels = {};
  try {
    for (const l of await fsp.readdir('/dev/disk/by-label')) {
      try { labels[fs.realpathSync('/dev/disk/by-label/' + l)] = l.replace(/\\x20/g, ' '); } catch (e) {}
    }
  } catch (e) {}
  const out = [];
  for (const line of txt.split('\n')) {
    const f = line.split(' ');
    if (f.length < 3) continue;
    const mp = f[1].replace(/\\040/g, ' ');
    if (!mp.startsWith(USB_ROOT + '/')) continue;
    let free = null, total = null;
    try { const s = fs.statfsSync ? fs.statfsSync(mp) : null; if (s) { free = s.bavail * s.bsize; total = s.blocks * s.bsize; } } catch (e) {}
    out.push({ path: mp, dev: f[0], fs: f[2], label: labels[f[0]] || path.posix.basename(mp), free, total });
  }
  return out;
}

async function dfOf(p) {
  return new Promise((res) => {
    execFile('df', ['-k', p], { timeout: 4000 }, (err, so) => {
      if (err) return res(null);
      const l = String(so).trim().split('\n').pop().trim().split(/\s+/);
      const n = l.length >= 6 ? l : null;
      res(n ? { total: +n[1] * 1024, free: +n[3] * 1024 } : null);
    });
  });
}

// Which roots allow destructive operations. Everything else is read-only.
async function writableRoot(p) {
  if (under(p, WALLS) && p !== WALLS) return { root: WALLS, trash: INT_TRASH };
  if (under(p, INT_TRASH) && p !== INT_TRASH) return { root: INT_TRASH, trash: null };
  for (const m of await usbMounts()) {
    if (under(p, m.path) && p !== m.path) {
      const t = m.path + '/' + TRASH_NAME;
      return { root: m.path, trash: under(p, t) ? null : t };
    }
  }
  return null;
}

async function trashRoots() {
  const r = [INT_TRASH];
  for (const m of await usbMounts()) r.push(m.path + '/' + TRASH_NAME);
  return r;
}

let syncing = Promise.resolve();
function syncWallsJson() {
  syncing = syncing.then(async () => {
    const names = (await fsp.readdir(WALLS)).filter((n) => IMG_RE.test(n) && !n.startsWith('.')).sort();
    const tmp = WALLS_JSON + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(names));
    await fsp.rename(tmp, WALLS_JSON);
    try { const keep = new Set(names.map((n) => n + '.jpg')); for (const c of await fsp.readdir(SCREEN)) if (!keep.has(c) && !c.startsWith('.')) await fsp.unlink(SCREEN + '/' + c).catch(() => {}); } catch (e) {}
    return names.length;
  }).catch((e) => { console.error('walls.json sync failed', e); return -1; });
  return syncing;
}

async function uniqueName(dir, name) {
  const ext = path.posix.extname(name), base = name.slice(0, name.length - ext.length);
  let cand = name, i = 1;
  while (true) {
    try { await fsp.lstat(dir + '/' + cand); } catch (e) { return cand; }
    cand = base + '-' + i++ + ext;
  }
}

async function moveAcross(src, dst) {
  try { await fsp.rename(src, dst); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fsp.cp(src, dst, { recursive: true, errorOnExist: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

// ---------- API ----------
async function apiList(q) {
  const p = norm(q.path || '/');
  const st = await fsp.stat(p);
  if (!st.isDirectory()) throw httpErr(400, 'not a directory');
  const names = await fsp.readdir(p);
  const entries = [];
  for (const name of names) {
    const fp = (p === '/' ? '' : p) + '/' + name;
    let s, isLink = false;
    try { const l = await fsp.lstat(fp); isLink = l.isSymbolicLink(); s = isLink ? await fsp.stat(fp) : l; }
    catch (e) { entries.push({ name, type: 'broken', size: 0, mtime: 0, link: isLink }); continue; }
    entries.push({ name, type: s.isDirectory() ? 'dir' : (s.isFile() ? 'file' : 'other'), size: s.size,
      mtime: s.mtimeMs, link: isLink, image: s.isFile() && IMG_RE.test(name), kind: s.isFile() ? kindOf(name) : null });
  }
  entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  const wr = await writableRoot(p + '/x');
  return { path: p, parent: p === '/' ? null : path.posix.dirname(p), entries,
    writable: !!wr, isWalls: p === WALLS, isTrash: (await trashRoots()).includes(p) };
}

async function apiPlaces() {
  let wallsCount = 0;
  try { wallsCount = (await fsp.readdir(WALLS)).filter((n) => IMG_RE.test(n)).length; } catch (e) {}
  const trash = await apiTrashList();
  return { walls: { path: WALLS, count: wallsCount, df: await dfOf(WALLS) }, usb: await usbMounts(),
    trash: { count: trash.items.length, size: trash.size }, version: VERSION };
}

async function apiDelete(body) {
  const paths = (body.paths || []).map(norm);
  const done = [], failed = [];
  let walls = false;
  for (const p of paths) {
    try {
      const wr = await writableRoot(p);
      if (!wr) throw httpErr(403, 'захищена папка');
      if (under(p, WALLS)) walls = true;
      if (!wr.trash) { // already in trash -> permanent
        await fsp.rm(p, { recursive: true, force: true });
        await fsp.rm(p + '.origin', { force: true });
      } else {
        await fsp.mkdir(wr.trash, { recursive: true });
        const id = Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '__' + path.posix.basename(p);
        await fsp.rename(p, wr.trash + '/' + id);
        await fsp.writeFile(wr.trash + '/' + id + '.origin', p);
      }
      done.push(p);
    } catch (e) { failed.push({ path: p, error: e.message }); }
  }
  const wallsCount = walls ? await syncWallsJson() : undefined;
  return { done, failed, wallsCount };
}

async function apiTrashList() {
  const items = []; let size = 0;
  for (const t of await trashRoots()) {
    let names; try { names = await fsp.readdir(t); } catch (e) { continue; }
    for (const n of names) {
      if (n.endsWith('.origin')) continue;
      let orig = null; try { orig = (await fsp.readFile(t + '/' + n + '.origin', 'utf8')).trim(); } catch (e) {}
      let s; try { s = await fsp.stat(t + '/' + n); } catch (e) { continue; }
      size += s.size;
      items.push({ path: t + '/' + n, name: n.replace(/^\d+-[a-z0-9]+__/, ''), orig, size: s.size,
        dir: s.isDirectory(), deleted: +n.split('-')[0] || s.mtimeMs, image: IMG_RE.test(n), kind: s.isDirectory() ? null : kindOf(n) });
    }
  }
  items.sort((a, b) => b.deleted - a.deleted);
  return { items, size };
}

async function apiRestore(body) {
  const done = [], failed = []; let walls = false;
  const roots = await trashRoots();
  for (const p0 of body.paths || []) {
    const p = norm(p0);
    try {
      if (!roots.some((t) => under(p, t) && p !== t)) throw httpErr(403, 'не з кошика');
      const orig = (await fsp.readFile(p + '.origin', 'utf8')).trim();
      const dir = path.posix.dirname(orig);
      await fsp.mkdir(dir, { recursive: true });
      const name = await uniqueName(dir, path.posix.basename(orig));
      await moveAcross(p, dir + '/' + name);
      await fsp.rm(p + '.origin', { force: true });
      if (under(orig, WALLS)) walls = true;
      done.push(dir + '/' + name);
    } catch (e) { failed.push({ path: p, error: e.message }); }
  }
  return { done, failed, wallsCount: walls ? await syncWallsJson() : undefined };
}

async function apiEmptyTrash() {
  let n = 0;
  for (const t of await trashRoots()) {
    let names; try { names = await fsp.readdir(t); } catch (e) { continue; }
    for (const x of names) { await fsp.rm(t + '/' + x, { recursive: true, force: true }); if (!x.endsWith('.origin')) n++; }
  }
  return { removed: n };
}

// ---- screen copies ----
// Image size from the header only (JPEG SOF / PNG IHDR / WebP), never decoding the picture.
async function imgDims(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const b = Buffer.alloc(512 * 1024); const { bytesRead } = await fh.read(b, 0, b.length, 0); const n = bytesRead;
    if (n > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (n > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const t = b.toString('ascii', 12, 16);
      if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < n - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    return null;
  } finally { await fh.close(); }
}
// walls that are bigger than a 3840x2160 screen (cover) and have no copy yet
async function apiScreenTodo() {
  const names = (await fsp.readdir(WALLS)).filter((n) => IMG_RE.test(n) && !n.startsWith('.')).sort();
  let have = new Set(); try { have = new Set(await fsp.readdir(SCREEN)); } catch (e) {}
  const todo = [];
  for (const n of names) {
    if (have.has(n + '.jpg')) continue;
    let d = null; try { d = await imgDims(WALLS + '/' + n); } catch (e) {}
    if (!d || !d.w || !d.h) continue;
    const s = Math.max(3840 / d.w, 2160 / d.h);
    if (s < 1) todo.push({ name: n, path: WALLS + '/' + n, w: Math.round(d.w * s), h: Math.round(d.h * s) });
  }
  return { todo };
}
// raw JPEG body → walls-screen/<name>.jpg (name must be an existing wallpaper)
function saveScreenCopy(req, res, q, cors) {
  const name = path.posix.basename(String(q.name || ''));
  const done = (code, out) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors)); res.end(JSON.stringify(out)); };
  if (!name || !IMG_RE.test(name) || !fs.existsSync(WALLS + '/' + name)) { req.resume(); return done(400, { error: 'немає такої шпалери' }); }
  const chunks = []; let len = 0;
  req.on('data', (c) => { len += c.length; if (len > 40e6) { req.destroy(); return; } chunks.push(c); });
  req.on('end', async () => {
    try {
      const buf = Buffer.concat(chunks);
      if (buf.length < 1000 || buf[0] !== 0xff || buf[1] !== 0xd8) return done(400, { error: 'не JPEG' });
      await fsp.mkdir(SCREEN, { recursive: true });
      const tmp = SCREEN + '/.tmp-' + name + '.jpg';
      await fsp.writeFile(tmp, buf); await fsp.rename(tmp, SCREEN + '/' + name + '.jpg');
      done(200, { ok: true, size: buf.length });
    } catch (e) { done(500, { error: e.message }); }
  });
}

// Copy images into the walls folder (from USB or anywhere readable).
async function apiImport(body) {
  const done = [], skipped = [], failed = [];
  for (const p0 of body.paths || []) {
    const p = norm(p0);
    try {
      if (under(p, WALLS)) { skipped.push({ path: p, why: 'вже в шпалерах' }); continue; }
      const st = await fsp.stat(p);
      if (!st.isFile() || !IMG_RE.test(p)) { skipped.push({ path: p, why: 'не зображення' }); continue; }
      const base = path.posix.basename(p).replace(/[\\/:*?"<>|]/g, '_');
      let same = false;
      try { const ex = await fsp.stat(WALLS + '/' + base); same = ex.size === st.size; } catch (e) {}
      if (same) { skipped.push({ path: p, why: 'такий файл уже є' }); continue; }
      const name = await uniqueName(WALLS, base);
      const tmp = WALLS + '/.importing-' + name;
      await fsp.copyFile(p, tmp);
      await fsp.rename(tmp, WALLS + '/' + name);
      done.push(name);
    } catch (e) { failed.push({ path: p, error: e.message }); }
  }
  const wallsCount = done.length ? await syncWallsJson() : undefined;
  return { done, skipped, failed, wallsCount };
}

// Streams a file; supports HTTP Range so <video> can seek in big films (fallback when file:// is refused).
function sendFile(req, res, q) {
  const p = norm(q.path || '');
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    const ext = path.posix.extname(p).slice(1).toLowerCase();
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=60', 'Access-Control-Allow-Origin': '*' };
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && st.size) {
      if (m[1] === '') { start = Math.max(0, st.size - (+m[2] || 0)); }
      else { start = +m[1]; if (m[2] !== '') end = Math.min(+m[2], st.size - 1); }
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      code = 206; h['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    }
    h['Content-Length'] = st.size ? end - start + 1 : 0;
    res.writeHead(code, h);
    if (req.method === 'HEAD' || !st.size) return res.end();
    const rs = fs.createReadStream(p, { start, end });
    rs.on('error', () => res.destroy());
    res.on('close', () => rs.destroy());
    rs.pipe(res);
  });
}

// Filename search across the wallpapers and every mounted USB stick (tokens AND-ed, case-insensitive).
async function apiSearch(q) {
  const tokens = String(q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { q: '', results: [], truncated: false };
  const roots = [{ path: WALLS, label: 'Шпалери' }].concat((await usbMounts()).map((m) => ({ path: m.path, label: m.label })));
  const results = [], MAX = 400, t0 = Date.now();
  let visited = 0, truncated = false;
  const hit = (name) => { const n = name.toLowerCase(); return tokens.every((t) => n.includes(t)); };
  async function walk(dir, depth, root) {
    if (truncated) return;
    let names; try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of names) {
      if (results.length >= MAX || ++visited > 60000 || Date.now() - t0 > 10000) { truncated = true; return; }
      if (d.name.startsWith('.')) continue; // skips .explorer-trash, .importing-*, hidden system dirs
      const fp = dir + '/' + d.name, isDir = d.isDirectory();
      if (hit(d.name)) {
        let st = null; try { st = await fsp.stat(fp); } catch (e) {}
        results.push({ path: fp, name: d.name, dir, root: root.label, type: isDir ? 'dir' : 'file', size: st ? st.size : 0,
          mtime: st ? st.mtimeMs : 0, image: !isDir && IMG_RE.test(d.name), kind: isDir ? null : kindOf(d.name) });
      }
      if (isDir && depth < 10) await walk(fp, depth + 1, root);
    }
  }
  for (const r of roots) await walk(r.path, 0, r);
  return { q: q.q, results, truncated, roots: roots.map((r) => r.path) };
}

// Small client log (used by the media-format probe: launch params {"probe":"/dir"}).
async function apiLog(body) {
  const f = '/tmp/explorer-client.log';
  try { const st = await fsp.stat(f); if (st.size > 512 * 1024) await fsp.rm(f); } catch (e) {}
  await fsp.appendFile(f, new Date().toISOString() + ' ' + JSON.stringify(body) + '\n');
  return { ok: true };
}

// Safe eject: flush, ask LG's storage manager to eject (no «unsafe removal» alert), fall back to umount.
function run(cmd, args, ms) {
  return new Promise((res) => execFile(cmd, args, { timeout: ms || 8000 }, (err, so, se) => res({ err: err ? String(err.message || err) : null, out: String(so || ''), errOut: String(se || '') })));
}
function luna(uri, params) {
  return run('sh', ['-c', "luna-send -n 1 -f '" + uri + "' '" + JSON.stringify(params || {}).replace(/'/g, '') + "' </dev/null"], 8000).then((r) => { try { return JSON.parse(r.out); } catch (e) { return { returnValue: false, raw: r.out, err: r.err }; } });
}
async function stillMounted(p) { try { return (await fsp.readFile('/proc/mounts', 'utf8')).split('\n').some((l) => (l.split(' ')[1] || '').replace(/\\040/g, ' ') === p); } catch (e) { return false; } }
async function apiEject(b) {
  const p = String((b && b.path) || '');
  const m = (await usbMounts()).find((x) => x.path === p);
  if (!m) throw httpErr(400, 'це не підключена флешка');
  await run('sync', [], 20000);
  const list = await luna('luna://com.webos.service.attachedstoragemanager/listDevices', {});
  const devs = (list && list.devices) || [];
  const blk = path.posix.basename(m.dev || '');                       // e.g. sda1
  const disk = blk.replace(/\d+$/, '');                               // e.g. sda
  const d = devs.find((x) => x.deviceUri === p) || devs.find((x) => x.deviceUri && (p.startsWith(x.deviceUri + '/') || x.deviceUri.startsWith(path.posix.dirname(p))))
    || devs.find((x) => /usb/i.test(x.deviceType || '') && (String(x.deviceId).indexOf(disk) >= 0 || JSON.stringify(x).indexOf(blk) >= 0))
    || devs.find((x) => /usb/i.test(x.deviceType || ''));
  let how = null, resp = null;
  if (d) {
    resp = await luna('luna://com.webos.service.attachedstoragemanager/ejectDevice', { deviceId: d.deviceId });
    for (let i = 0; i < 15 && await stillMounted(p); i++) await new Promise((r) => setTimeout(r, 200));
    if (!(await stillMounted(p))) how = 'lg';
  }
  if (!how) {
    const u = await run('umount', [p], 15000);
    if (!(await stillMounted(p))) how = 'umount'; else throw httpErr(409, 'флешка зайнята (' + (u.errOut || u.err || 'umount') + ')');
  }
  await apiLog({ eject: p, how, device: d || null, resp });
  return { ok: true, how, label: m.label };
}

const ROUTES = {
  'GET /api/ping': async () => ({ ok: true, version: VERSION, pid: process.pid }),
  'GET /api/places': apiPlaces,
  'GET /api/list': apiList,
  'GET /api/trash': apiTrashList,
  'GET /api/search': apiSearch,
  'POST /api/log': (q, b) => apiLog(b),
  'POST /api/delete': (q, b) => apiDelete(b),
  'POST /api/restore': (q, b) => apiRestore(b),
  'POST /api/trash/empty': () => apiEmptyTrash(),
  'POST /api/import': (q, b) => apiImport(b),
  'GET /api/screen-todo': () => apiScreenTodo(),
  'POST /api/sync-walls': async () => ({ wallsCount: await syncWallsJson() }),
  'POST /api/eject': (q, b) => apiEject(b),
  'POST /api/quit': async () => { setTimeout(() => process.exit(0), 100); return { ok: true }; },
};

http.createServer((req, res) => {
  touch();
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  // Only our file:// app (Origin "null") or no-Origin clients; never other web origins.
  const origin = req.headers.origin;
  const cors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'Content-Type, X-Explorer',
    'Access-Control-Allow-Methods': 'GET, POST' };
  const devOrigin = process.env.EXPLORER_DEV_ORIGIN; // laptop UI testing over an ssh tunnel only
  if (devOrigin && origin === devOrigin) cors['Access-Control-Allow-Origin'] = devOrigin;
  else if (origin && origin !== 'null' && u.pathname !== '/api/file') { res.writeHead(403); return res.end(); }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/api/file') return sendFile(req, res, q);
  if (req.method === 'POST' && u.pathname === '/api/screen-copy') {
    if (req.headers['x-explorer'] !== '1') { res.writeHead(403, cors); return res.end(); }
    return saveScreenCopy(req, res, q, cors);
  }
  const fn = ROUTES[req.method + ' ' + u.pathname];
  if (!fn) { res.writeHead(404, cors); return res.end('{}'); }
  if (req.method === 'POST' && req.headers['x-explorer'] !== '1') { res.writeHead(403, cors); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let out, code = 200;
    try { out = await fn(q, raw ? JSON.parse(raw) : {}); }
    catch (e) { code = e.code_ || (e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500); out = { error: e.message }; }
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
    res.end(JSON.stringify(out));
  });
}).listen(PORT, HOST, () => { touch(); console.log('explorer server', VERSION, 'on', HOST + ':' + PORT); });
