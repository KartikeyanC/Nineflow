# Enlarges the NineFlow logo PNGs 4x for the Behance pages, keeping the edges crisp.
#   python design/behance/upscale_logo.py
# Resizes in premultiplied colour (no dark or bright fringes), then steepens the alpha
# around 50% so the edge is sharp again while staying anti-aliased.
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public' / 'brand'
OUT = Path(__file__).resolve().parent / 'logo'
OUT.mkdir(exist_ok=True)
SCALE = 4
SLOPE = 8


def upscale(name):
    a = np.asarray(Image.open(SRC / name).convert('RGBA')).astype(np.float32) / 255
    h, w = a.shape[:2]
    size = (w * SCALE, h * SCALE)
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    P = np.stack([np.asarray(Image.fromarray(pm[..., i]).resize(size, Image.LANCZOS)) for i in range(4)], -1)
    al = np.clip(P[..., 3], 0, 1)
    rgb = np.clip(P[..., :3] / np.maximum(al, 1e-4)[..., None], 0, 1)
    A = 1 / (1 + np.exp(-(al - 0.5) * SLOPE))
    A = (A - A.min()) / (A.max() - A.min())
    Image.fromarray((np.dstack([rgb, A]) * 255).round().astype(np.uint8)).save(OUT / name.replace('.png', '@4x.png'), optimize=True)
    print(name, '->', size)


for n in ['nineflow-mark.png', 'nineflow-tile.png', 'nineflow-mark-white.png', 'nineflow-mark-dark.png']:
    upscale(n)
