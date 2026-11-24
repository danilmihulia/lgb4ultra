// Minimal archive writers with no dependencies: ustar (.tar / .tar.gz) and webOS .ipk (ar of debian-binary,
// control.tar.gz, data.tar.gz — the same layout ares-package produces).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function header(name, size, mode, type) {
  const h = Buffer.alloc(512);
  let pre = '';
  if (Buffer.byteLength(name) > 100) {   // ustar: split into prefix (≤155) + name (≤100) at a '/'
    const i = name.lastIndexOf('/', name.length - 1 - (type === '5' ? 1 : 0));
    let cut = i; while (cut > 0 && (Buffer.byteLength(name.slice(cut + 1)) > 100 || cut > 155)) cut = name.lastIndexOf('/', cut - 1);
    if (cut <= 0) throw new Error('path too long for tar: ' + name);
    pre = name.slice(0, cut); name = name.slice(cut + 1);
  }
  h.write(name, 0, 100);
  h.write(mode.toString(8).padStart(7, '0') + '\0', 100);
  h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); h.write(type, 156);
  h.write('ustar\0', 257); h.write('00', 263);
  h.write(pre, 345, 155);
  let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

// entries: [{ path: 'a/b.txt', data: Buffer|string, mode? } | { path: 'a/', dir: true }]
function tar(entries) {
  const parts = [];
  for (const e of entries) {
    if (e.dir) { parts.push(header(e.path.replace(/\/?$/, '/'), 0, e.mode || 0o755, '5')); continue; }
    const d = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    parts.push(header(e.path, d.length, e.mode || 0o644, '0'), d, Buffer.alloc((512 - (d.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
const tgz = entries => zlib.gzipSync(tar(entries), { level: 9 });

// every file under dir → entries below prefix (directories included, sorted)
function dirEntries(dir, prefix, modeFor) {
  const out = [];
  (function walk(d, p) {
    out.push({ path: p + '/', dir: true });
    for (const n of fs.readdirSync(d).sort()) {
      const full = path.join(d, n), rel = p + '/' + n;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else out.push({ path: rel, data: fs.readFileSync(full), mode: modeFor ? modeFor(rel) : 0o644 });
    }
  })(dir, prefix.replace(/\/$/, ''));
  return out;
}

function ar(members) {
  const parts = [Buffer.from('!<arch>\n')];
  const t = String(Math.floor(Date.now() / 1000));
  for (const [name, data] of members) {
    parts.push(Buffer.from(name.padEnd(16) + t.padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(data.length).padEnd(10) + '`\n'), data);
    if (data.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

// a web app folder (with appinfo.json) → .ipk Buffer
function ipk(appDir, filter) {
  const info = JSON.parse(fs.readFileSync(path.join(appDir, 'appinfo.json'), 'utf8'));
  const id = info.id, ver = info.version;
  const data = [{ path: 'usr/', dir: true }, { path: 'usr/palm/', dir: true }, { path: 'usr/palm/packages/', dir: true }]
    .concat(dirEntries(appDir, 'usr/palm/applications/' + id).map(e => (filter && e.data ? Object.assign(e, { data: filter(e.path, e.data) }) : e)))
    .concat([{ path: 'usr/palm/packages/' + id + '/', dir: true },
      { path: 'usr/palm/packages/' + id + '/packageinfo.json', data: JSON.stringify({ id, version: ver, app: id }, null, 2) + '\n' }]);
  const size = data.reduce((n, e) => n + (e.data ? e.data.length : 0), 0);
  const control = 'Package: ' + id + '\nVersion: ' + ver + '\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: ' + size +
    '\nMaintainer: N/A <nobody@example.com>\nDescription: This is a webOS application.\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n';
  return { id, version: ver, buf: ar([['debian-binary', Buffer.from('2.0\n')], ['control.tar.gz', tgz([{ path: 'control', data: control }])], ['data.tar.gz', tgz(data)]]) };
}

// .tar / .tar.gz Buffer → { 'path/file': Buffer } (files only; ustar prefix + GNU long names)
function untar(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const out = {}; let o = 0, longName = null;
  while (o + 512 <= buf.length) {
    const h = buf.slice(o, o + 512); if (h.every(b => b === 0)) break;
    const str = (a, n) => h.slice(a, a + n).toString().replace(/\0[\s\S]*$/, '');
    const size = parseInt(str(124, 12).trim() || '0', 8), type = String.fromCharCode(h[156] || 48);
    let name = str(0, 100); const pre = str(345, 155); if (pre && h.slice(257, 262).toString() === 'ustar') name = pre + '/' + name;
    const data = buf.slice(o + 512, o + 512 + size); o += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = data.toString().replace(/\0+$/, ''); continue; }
    if (longName) { name = longName; longName = null; }
    if (type === '0' || type === '\0' || type === '7') out[name.replace(/^\.\//, '')] = data;
  }
  return out;
}

module.exports = { tar, tgz, untar, dirEntries, ipk };
