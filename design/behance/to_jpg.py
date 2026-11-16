# Turns the rendered PNG pages into high-quality JPGs for Behance (export/*.jpg).
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent
src = here / 'export' / 'png'
for p in sorted(src.glob('*.png')):
    im = Image.open(p).convert('RGB')
    dst = here / 'export' / (p.stem + '.jpg')
    im.save(dst, 'JPEG', quality=93, subsampling=0, optimize=True, progressive=True, dpi=(144, 144))
    print(f'{dst.name}: {im.size[0]} x {im.size[1]}, {dst.stat().st_size / 1e6:.1f} MB')
