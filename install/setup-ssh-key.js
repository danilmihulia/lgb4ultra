#!/usr/bin/env node
// One-time: let your PC log in to the TV as root with an SSH key (instead of Homebrew Channel's default password).
//   node install/setup-ssh-key.js <TV-IP> [--key <private key file>]
// Creates ~/.ssh/lgb4ultra_ed25519 if you give no key, then copies the PUBLIC key to /home/root/.ssh/authorized_keys
// on the TV. You type the TV's root password ONCE (Homebrew Channel default: alpine). After that the password login
// is no longer used. Keep the private key to yourself — it is full root access to your TV.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2), host = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--key');
const ki = argv.indexOf('--key');
if (!host) { console.log('usage: node install/setup-ssh-key.js <TV-IP> [--key <private key file>]'); process.exit(1); }
let key = ki >= 0 ? argv[ki + 1] : path.join(os.homedir(), '.ssh', 'lgb4ultra_ed25519');
if (!fs.existsSync(key)) {
  fs.mkdirSync(path.dirname(key), { recursive: true });
  const r = spawnSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'lgb4ultra', '-f', key], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ssh-keygen failed'); process.exit(1); }
}
const pub = fs.readFileSync(key + '.pub', 'utf8').trim();
console.log('Copying the public key to the TV. Type the TV root password when asked (Homebrew Channel default: alpine).');
const r = spawnSync('ssh', ['-o', 'StrictHostKeyChecking=accept-new', 'root@' + host,
  "mkdir -p /home/root/.ssh && chmod 700 /home/root/.ssh && touch /home/root/.ssh/authorized_keys && grep -qxF '" + pub + "' /home/root/.ssh/authorized_keys || echo '" + pub + "' >> /home/root/.ssh/authorized_keys; chmod 600 /home/root/.ssh/authorized_keys; echo KEY_OK"],
  { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
if (!/KEY_OK/.test(r.stdout || '')) { console.error('Could not add the key (is SSH enabled in Homebrew Channel → Settings?)'); process.exit(1); }
const t = spawnSync('ssh', ['-i', key, '-o', 'BatchMode=yes', 'root@' + host, 'id -u'], { encoding: 'utf8' });
console.log((t.stdout || '').trim() === '0' ? 'Key login works. Next: node install/install.js ' + host + ' --key "' + key + '"' : 'Key copied, but the key login test failed — check Homebrew Channel SSH settings.');
