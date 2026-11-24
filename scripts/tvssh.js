// Shared helper for the laptop-side scripts: run a shell script on the TV over SSH (root, key in config/).
// TV address + SSH key: config/device.local.json {"host": "192.168.1.50", "key": "~/.ssh/lgb4ultra_ed25519"} (not in git)
// or the TV_IP / TV_KEY environment variables. Default key: ~/.ssh/lgb4ultra_ed25519 (made by install/setup-ssh-key.js).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function cfg() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'device.local.json'), 'utf8')); } catch (e) { return {}; } }
function tvIp() {
  const ip = process.env.TV_IP || cfg().host || cfg().ip;
  if (!ip) throw new Error('TV address unknown: set TV_IP or config/device.local.json {"host": "..."}');
  return ip;
}
function tvKey() {
  const k = process.env.TV_KEY || cfg().key || '~/.ssh/lgb4ultra_ed25519';
  return k.startsWith('~') ? path.join(os.homedir(), k.slice(1)) : path.resolve(ROOT, k);
}
function tvRun(script, timeout = 120000) {
  const key = tvKey();
  return execFileSync('ssh', ['-i', key, '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes', 'root@' + tvIp(), 'sh -s'],
    { input: script, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
}
module.exports = { tvRun, tvIp, ROOT };
