# Runs ON THE TV (python3). Presses remote keys for automated UI tests by writing input
# events into the Magic Remote's evdev node (kernel injects them as if the remote sent them).
# usage: python3 tvkey.py DOWN DOWN OK 2 RED   (a number = sleep seconds)
#        TVKEY_DEV=/dev/input/eventN to override the device
import os, struct, sys, time
KEYS = {'UP': 103, 'DOWN': 108, 'LEFT': 105, 'RIGHT': 106, 'OK': 28, 'ENTER': 28, 'KOK': 352, 'BACK': 412,
        'RED': 398, 'GREEN': 399, 'YELLOW': 400, 'BLUE': 401, 'PGUP': 104, 'PGDN': 109}
dev = os.environ.get('TVKEY_DEV', '/dev/input/event3')
fd = os.open(dev, os.O_WRONLY)
def ev(t, c, v): os.write(fd, struct.pack('llHHi', 0, 0, t, c, v))
for k in sys.argv[1:]:
    try: time.sleep(float(k)); continue
    except ValueError: pass
    c = int(k) if k.isdigit() else KEYS[k.upper()]
    ev(1, c, 1); ev(0, 0, 0); time.sleep(0.06); ev(1, c, 0); ev(0, 0, 0); time.sleep(0.4)
os.close(fd)
