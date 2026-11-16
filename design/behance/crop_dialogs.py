# Cuts the dialog (the bright card over the blurred page) out of feature screenshots, plus a few
# fixed regions, into shots/crop-*.png for the Behance feature pages.
#   python design/behance/crop_dialogs.py
from pathlib import Path
import numpy as np
from PIL import Image

shots = Path(__file__).resolve().parent / 'shots'


def dialog_box(im, thresh=236, pad=-5):
    """The bright dialog over the dimmed, blurred page: rows and columns that are mostly bright."""
    a = np.asarray(im.convert('L'), np.int16)
    mask = a > thresh
    cols = mask.sum(0)
    rows = mask.sum(1)
    xs = np.nonzero(cols > cols.max() * 0.45)[0]
    ys = np.nonzero(rows > rows.max() * 0.30)[0]
    return (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, im.width), min(ys.max() + pad, im.height))


def save(name, im, box):
    im.crop(box).save(shots / f'crop-{name}.png', optimize=True)
    print(name, box)


for name in ['ask', 'finishgate', 'goal-form', 'goal-plan', 'interrupt', 'invoice', 'palette', 'quickadd', 'voice']:
    src = shots / f'feat-{name}.png'
    if src.exists():
        im = Image.open(src).convert('RGB')
        save(name, im, dialog_box(im))

# Fixed regions (desktop shots are 2880 x 1800).
regions = {
    'loadbar': ('desk-light-dashboard.png', (520, 236, 2844, 478)),
    'carried': ('desk-light-dashboard.png', (520, 512, 2844, 756)),
    'checklist': ('feat-checklist.png', (1540, 0, 2880, 1800)),
    'workspaces': ('feat-workspaces.png', (30, 120, 720, 560)),
    'versions': ('feat-versions.png', (528, 1000, 2070, 1520)),
    'clients': ('feat-clients.png', (528, 1240, 2844, 1790)),
}
for name, (file, box) in regions.items():
    src = shots / file
    if src.exists():
        save(name, Image.open(src).convert('RGB'), box)
