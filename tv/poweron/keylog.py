# Diagnostics (runs ON THE TV, python3): log every key event from all input devices for N seconds
# to /media/developer/keylog.txt (survives suspend/reboot). usage: python3 keylog.py 300
import os, select, struct, sys, time
N = float(sys.argv[1]) if len(sys.argv) > 1 else 300
out = open('/media/developer/keylog.txt', 'a', buffering=1)
fds = {}
for n in sorted(os.listdir('/dev/input')):
    if n.startswith('event'):
        try: fds[os.open('/dev/input/' + n, os.O_RDONLY | os.O_NONBLOCK)] = n
        except OSError as e: out.write('skip %s %s\n' % (n, e))
SZ = struct.calcsize('llHHi')
out.write('%s start, devices %s\n' % (time.strftime('%T'), ' '.join(fds.values())))
end = time.time() + N
while time.time() < end:
    r, _, _ = select.select(list(fds), [], [], 1)
    for fd in r:
        try: data = os.read(fd, SZ * 64)
        except OSError: continue
        for i in range(0, len(data) - SZ + 1, SZ):
            s, us, t, c, v = struct.unpack('llHHi', data[i:i + SZ])
            if t == 1: out.write('%s %s code=%d value=%d\n' % (time.strftime('%T'), fds[fd], c, v))
out.write('%s end\n' % time.strftime('%T'))
