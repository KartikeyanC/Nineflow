# Makes public/brand/nineflow-mark-white.png for the phone app's splash screen: the white "N" from the
# Android launcher artwork with the orange taken out, on the same 432x432 canvas, so the in-app splash can
# draw it at exactly the size and place Android's own splash does.
#   python scripts/splash-mark.py
# The artwork is white on orange (#FF6A13). The blue channel goes from 19 (orange) to 255 (white), so it
# tells how white each pixel is: that becomes its opacity, which keeps the soft edges.
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Image.open(root / 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png').convert('RGB')
out = Image.new('RGBA', src.size, (255, 255, 255, 0))
px, po = src.load(), out.load()
for y in range(src.height):
    for x in range(src.width):
        b = px[x, y][2]
        a = max(0, min(255, round((b - 19) * 255 / (255 - 19))))
        po[x, y] = (255, 255, 255, a)
dest = root / 'public/brand/nineflow-mark-white.png'
out.save(dest, optimize=True)
print(dest, out.size)
