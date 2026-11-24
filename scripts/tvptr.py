# Runs ON THE TV (python3). Moves the Magic Remote pointer (absolute ABS_X/ABS_Y on the remote's evdev node)
# and optionally clicks (OK while the pointer is visible = click at the pointer).
# usage: python3 tvptr.py X Y [click]     (screen coords, 1920x1080)
import os, struct, sys, time
dev = os.environ.get('TVKEY_DEV', '/dev/input/event3')
fd = os.open(dev, os.O_WRONLY)
def ev(t, c, v): os.write(fd, struct.pack('llHHi', 0, 0, t, c, v))
x, y = int(sys.argv[1]), int(sys.argv[2])
for i in range(6):                       # a few samples so the compositor shows the cursor
    ev(3, 0, x + (i % 2)); ev(3, 1, y); ev(0, 0, 0); time.sleep(0.05)
if len(sys.argv) > 3 and sys.argv[3] == 'click':
    time.sleep(0.3); ev(1, 28, 1); ev(0, 0, 0); time.sleep(0.08); ev(1, 28, 0); ev(0, 0, 0)
os.close(fd)
