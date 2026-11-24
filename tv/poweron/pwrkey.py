# My Home: hold POWER on the remote -> our power menu (off / screen off / restart); a short press still turns
# the TV off exactly like before. Runs ON THE TV (python3), started by boot hook 41.
#
# Findings (2026-11-22):
#  - LG's compositor handles POWER in C++ (QStarfishPowerDBridge) before any QML key filter -> our key filter
#    never sees it.
#  - tvpower's power-off request clients can't veto: a NACK is answered "The response is too late" and the TV
#    powers off anyway.
#  - The Magic Remote sends every key over "LGE M-RCU"/event2 EXCEPT power, which comes alone on "LGE RCU" (IR).
# So we take "LGE RCU" exclusively (EVIOCGRAB): the compositor no longer sees POWER directly. On release:
#   held <  HOLD s -> we write press+release back into the device node (the kernel hands them to the compositor
#                     as if the remote sent them) -> LG powers off as usual;
#   held >= HOLD s -> our menu opens (already while the key is still held).
# Any other key that ever shows up on this device is passed through the same way (as a tap on release:
# the kernel drops a re-injected press while the real key is still down).
# Fail-safe: if this process dies the kernel drops the grab and the remote works directly again.
# Log: /media/developer/myhome-poweron/pwrkey.log
import fcntl, glob, json, os, select, struct, subprocess, sys, time

HOLD = 0.7
KEY_POWER = 116
EVIOCGRAB = 0x40044590
FMT = 'llHHi'; SZ = struct.calcsize(FMT)
LOG = '/media/developer/myhome-poweron/pwrkey.log'
SYN = (0, 0, 0)

def log(*a):
    try:
        with open(LOG, 'a') as f:
            f.write(time.strftime('%T ') + ' '.join(str(x) for x in a) + '\n'); f.flush(); os.fsync(f.fileno())   # power-offs cut the cache
    except Exception: pass

def luna(uri, params, timeout=4):
    try:
        return subprocess.run(['luna-send', '-n', '1', uri, json.dumps(params)], stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout).stdout.decode('utf-8', 'replace')
    except Exception:
        return ''

def tv_active():
    out = luna('luna://com.webos.service.tvpower/power/getPowerState', {})
    return '"state": "Active"' in out or '"state":"Active"' in out

dev = None
for n in sorted(glob.glob('/sys/class/input/event*/device/name')):
    try:
        if open(n).read().strip() == 'LGE RCU': dev = '/dev/input/' + n.split('/')[4]
    except Exception: pass
if not dev: log('no LGE RCU device -> exit'); sys.exit(0)
fd = os.open(dev, os.O_RDWR | os.O_NONBLOCK)

def grab(on): fcntl.ioctl(fd, EVIOCGRAB, 1 if on else 0)

def tap(code):
    """give the compositor a press+release of `code`: drop the grab, write, take it back, discard our own echo"""
    ev = [(1, code, 1), SYN, (1, code, 0), SYN]
    grab(False)
    try:
        for (t, c, v) in ev: os.write(fd, struct.pack(FMT, 0, 0, t, c, v))
        time.sleep(0.05)
    finally:
        grab(True)
    while True:
        r, _, _ = select.select([fd], [], [], 0)
        if not r: break
        try: os.read(fd, SZ * 64)
        except BlockingIOError: break

def watch_state():   # power-state timeline in the same log (who turned the TV off, and why)
    import threading
    def run():
        p = subprocess.Popen(['luna-send', '-i', 'luna://com.webos.service.tvpower/power/getPowerState', '{"subscribe":true}'],
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for line in p.stdout: log('state', line.decode('utf-8', 'replace').strip())
    threading.Thread(target=run, daemon=True).start()

grab(True)
log('grabbed', dev)
watch_state()
down = {}            # code -> press time
menu_done = False    # the hold for the current press was handled
pass_on = False      # ...but the release must still go to LG (TV wasn't fully on)

while True:
    timeout = None
    if KEY_POWER in down and not menu_done:
        timeout = max(0.0, HOLD - (time.time() - down[KEY_POWER]))
    r, _, _ = select.select([fd], [], [], timeout)
    if not r:
        if KEY_POWER in down and not menu_done and time.time() - down[KEY_POWER] >= HOLD:
            menu_done = True
            if tv_active():
                # the IR power key also reached the micom, which hard-resets the TV a few seconds later unless the
                # host powers off; cancelPowerOff = tvpower -> micom_power_Set_CancelPowerOff (test 2026-11-22)
                c1 = luna('luna://com.webos.service.tvpower/power/cancelPowerOff', {})
                c2 = luna('luna://com.webos.service.tvpower/power2/cancelPowerOff', {})
                luna('luna://com.webos.applicationManager/launch',
                     {'id': 'com.webos.app.home', 'params': {'open': 'power', 'ts': int(time.time() * 1000)}})
                log('POWER held -> menu | cancelPowerOff', c1.strip(), '| power2', c2.strip())
            else:
                pass_on = True      # screen off / standby etc.: behave like the stock remote on release
                log('POWER held while not active -> will pass to LG')
        continue
    try: data = os.read(fd, SZ * 64)
    except BlockingIOError: continue
    except OSError as e:
        log('read error', e, '-> exit (grab released)'); break
    for i in range(0, len(data) - SZ + 1, SZ):
        _, _, t, c, v = struct.unpack(FMT, data[i:i + SZ])
        if t != 1: continue
        if v == 1:
            down[c] = time.time(); log('key %d down' % c)
            if c == KEY_POWER: menu_done = False; pass_on = False
        elif v == 0:
            t0 = down.pop(c, None)
            if c == KEY_POWER and menu_done and not pass_on:
                log('POWER released after menu -> swallowed'); menu_done = False
                continue
            held = time.time() - t0 if t0 and t0 > 0 else 0
            log('key %d released (%.2fs) -> passed to LG' % (c, held))
            tap(c)
        # value 2 (autorepeat): swallowed
