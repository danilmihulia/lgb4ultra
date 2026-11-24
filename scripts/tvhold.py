# Runs ON THE TV: hold one remote key. usage: python3 tvhold.py <code> <seconds>
import os, struct, sys, time
dev = os.environ.get('TVKEY_DEV', '/dev/input/event3'); fd = os.open(dev, os.O_WRONLY)
def ev(t, c, v): os.write(fd, struct.pack('llHHi', 0, 0, t, c, v))
c = int(sys.argv[1]); secs = float(sys.argv[2])
ev(1, c, 1); ev(0, 0, 0)
end = time.time() + secs
while time.time() < end:
    time.sleep(0.1); ev(1, c, 2); ev(0, 0, 0)   # autorepeat like a real held key
ev(1, c, 0); ev(0, 0, 0); os.close(fd)
