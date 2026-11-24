# Make screen-size display copies of oversized wallpapers for the slideshows (originals stay untouched).
# Each copy covers a 3840x2160 screen (scale = max(3840/w, 2160/h), never upscaled) and is saved as
# <original file name>.jpg (quality 92). The savers load walls-screen/<name>.jpg and fall back to walls/<name>.
# Why: 8K/12K originals decode to 130-240 MB each in the WebAppMgr; two savers at once exhausted swap and
# triggered the cpuAbnormal watchdog resets of 2026-11-21.
# usage: python make-screen-walls.py <dir with originals> <out dir>
import os, sys
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
n = 0
for f in sorted(os.listdir(src)):
    p = os.path.join(src, f)
    with Image.open(p) as im:
        w, h = im.size
        s = max(3840 / w, 2160 / h)
        if s >= 1:
            continue
        im = im.convert('RGB').resize((round(w * s), round(h * s)), Image.LANCZOS)
        im.save(os.path.join(out, f + '.jpg'), 'JPEG', quality=92, optimize=True)
        n += 1
        print(f, w, 'x', h, '->', im.size[0], 'x', im.size[1], flush=True)
print('done', n)
