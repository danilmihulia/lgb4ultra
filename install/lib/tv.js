// SSH helpers for the installer (OpenSSH client from the PC; root on the TV via Homebrew Channel's sshd).
'use strict';
const { execFileSync, spawnSync } = require('child_process');

function make(opts) {
  const base = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15'];
  if (opts.key) base.unshift('-i', opts.key);
  const target = 'root@' + opts.host;
  // run a shell script on the TV (script goes over stdin → no quoting problems); returns stdout
  function sh(script, { timeout = 300000, input, allowFail = false } = {}) {
    const r = spawnSync('ssh', base.concat([target, input ? script : 'sh -s']), {
      input: input || script, encoding: input ? undefined : 'utf8', timeout, maxBuffer: 256 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0 && !allowFail) throw new Error('TV command failed (exit ' + r.status + '): ' + String(r.stderr || '').trim().slice(-400));
    return input ? r.stdout : String(r.stdout || '');
  }
  // stream a Buffer to a command on the TV (e.g. "tar xzf - -C /")
  function pipe(cmd, buf, timeout = 600000) {
    const r = spawnSync('ssh', base.concat([target, cmd]), { input: buf, timeout, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error('TV command failed: ' + cmd + ' (exit ' + r.status + '): ' + String(r.stderr || '').slice(-400));
    return r.stdout;
  }
  // read a command's raw stdout (Buffer), e.g. a tar of stock files
  function read(cmd, timeout = 600000) {
    return execFileSync('ssh', base.concat([target, cmd]), { timeout, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return { sh, pipe, read, host: opts.host };
}
module.exports = { make };
