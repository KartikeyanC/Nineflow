# Builds design/portfolio/assets/ from the Behance captures: web-sized WebP images and the fonts,
# so the four portfolio pages (logo, dashboard, mobile, website) work as one portable folder.
#   python design/behance/upscale_logo.py      (once, for the logo)
#   node design/behance/capture.mjs            (screens)
#   node design/behance/capture-features.mjs   (feature screens)
#   python design/behance/crop_dialogs.py      (dialog crops)
#   python design/portfolio/build_assets.py
from pathlib import Path
import shutil
from PIL import Image

here = Path(__file__).resolve().parent
root = here.parents[1]
shots = root / 'design' / 'behance' / 'shots'
logos = root / 'design' / 'behance' / 'logo'
out = here / 'assets'
(out / 'img').mkdir(parents=True, exist_ok=True)
(out / 'fonts').mkdir(parents=True, exist_ok=True)


def webp(src, dst, width, quality=84):
    im = Image.open(src)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(out / 'img' / dst, 'WEBP', quality=quality, method=6)
    return im.size


count = 0
for p in sorted(shots.glob('*.png')):
    name = p.stem
    if name.startswith('phone-'):
        width = 780          # shown up to ~390 px wide, sharp on 2x screens
    elif name.startswith('crop-'):
        width = 1400
    else:
        width = 2000         # desktop screens
    webp(p, f'{name}.webp', width)
    count += 1

for p in sorted(logos.glob('*@4x.png')):
    webp(p, p.name.replace('@4x.png', '.webp'), 1400, quality=92)
    count += 1

fonts = {
    'inter.woff2': root / 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
    'jakarta.woff2': root / 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
}
for name, src in fonts.items():
    shutil.copyfile(src, out / 'fonts' / name)

size = sum(f.stat().st_size for f in out.rglob('*') if f.is_file())
print(f'{count} images + 2 fonts, {size / 1e6:.1f} MB in {out}')
