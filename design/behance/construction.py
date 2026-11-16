# Measures the NineFlow mark (public/brand/nineflow-mark.png, 512 x 407) and writes construction
# guides that follow its real edges and curves: design/behance/construction-guides.svg
# (an <svg viewBox="0 0 512 407"> to lay over the mark). Used by the Behance and portfolio pages.
#   python design/behance/construction.py
from pathlib import Path
import json
import numpy as np
from PIL import Image

here = Path(__file__).resolve().parent
root = here.parents[1]
a = np.asarray(Image.open(root / 'public/brand/nineflow-mark.png').convert('RGBA')).astype(int)
opaque = a[..., 3] > 128
dark = opaque & (a[..., 0] < 110)
orange = opaque & ~dark
ribbon = orange.copy()
ribbon[:152, 365:] = False        # the dot sits alone in the top right
dot = orange & ~ribbon
H, W = opaque.shape

# ---- Straight edges: Hough transform over the boundaries between transparent, dark and orange.
label = np.zeros(opaque.shape, int)
label[dark] = 1
label[orange] = 2
edge = np.zeros(opaque.shape, bool)
for dy, dx in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
    edge |= label != np.roll(np.roll(label, dy, 0), dx, 1)
edge[[0, -1], :] = edge[:, [0, -1]] = False
ys, xs = np.nonzero(edge & opaque)
thetas = np.deg2rad(np.arange(0, 180, 0.5))
diag = int(np.hypot(H, W)) + 1
acc = np.zeros((len(thetas), 2 * diag), int)
for i, t in enumerate(thetas):
    np.add.at(acc[i], np.round(xs * np.cos(t) + ys * np.sin(t)).astype(int) + diag, 1)


def strongest(theta_from, theta_to, rho_from, rho_to):
    """The best line whose normal angle and distance fall in the given ranges."""
    i0, i1 = int(theta_from * 2), int(theta_to * 2) + 1
    sub = acc[i0:i1, rho_from + diag:rho_to + diag]
    i, j = np.unravel_index(sub.argmax(), sub.shape)
    return float(np.rad2deg(thetas[i0 + i])), int(j + rho_from)


lines = {
    'ribbon-upper': strongest(138, 146, -40, 20),     # the ribbon's two parallel sides
    'ribbon-lower': strongest(138, 146, -200, -150),
    'play-lower': strongest(44, 54, 300, 380),        # the play shape's lower edge, pointing up-right
    'play-gap': strongest(132, 140, 40, 80),          # the white gap between the play shape and ribbon
}


# ---- Curves: least-squares circles through the outline of each rounded part.
def circle(points):
    x, y = points[:, 0].astype(float), points[:, 1].astype(float)
    cx, cy, c = np.linalg.lstsq(np.c_[2 * x, 2 * y, np.ones_like(x)], x * x + y * y, rcond=None)[0]
    return round(float(cx), 1), round(float(cy), 1), round(float(np.sqrt(c + cx * cx + cy * cy)), 1)


def column_edge(mask, x0, x1, top=True):
    pts = []
    for x in range(x0, x1):
        col = np.nonzero(mask[:, x])[0]
        if len(col):
            pts.append((x, col.min() if top else col.max()))
    return np.array(pts)


dy_, dx_ = np.nonzero(dot)
far = (np.abs(dx_ - 441) > 58) | (np.abs(dy_ - 80) > 58)
circles = {
    'dot': circle(np.c_[dx_[far], dy_[far]]),
    'top-arc': circle(column_edge(ribbon, 20, 200, top=True)),
    'bottom-arc': circle(column_edge(ribbon, 300, 500, top=False)),
    'body-top': circle(column_edge(dark, 380, 500, top=True)),
    'play-corner': circle(column_edge(dark, 5, 90, top=True)),
}

# The gap between the dot and the body under it: their shared (internal) tangent, rising to the right.
(x1, y1, r1), (x2, y2, r2) = circles['dot'][:3], circles['body-top'][:3]
# Line y = m·x + k touching both circles from opposite sides: signed distances +r1 and -r2.
# Subtracting the two conditions leaves one equation in m; solve it on a fine grid (rising lines, m < 0).
ms = np.linspace(-3, -0.05, 60001)
n = np.sqrt(1 + ms * ms)
f = ms * (x1 - x2) - (y1 - y2) - (r1 + r2) * n
m = float(ms[np.argmin(np.abs(f))])
k = r1 * np.sqrt(1 + m * m) - m * x1 + y1           # signed distance to the dot's centre is r1
theta = float(np.rad2deg(np.arctan2(-1, m)) % 180)  # normal of m·x - y + k = 0 is (m, -1)
t = np.deg2rad(theta)
# rho for x·cosθ + y·sinθ = rho, from a point on the line
px = 500.0
py = m * px + k
lines['shared-tangent'] = (round(theta, 1), round(float(px * np.cos(t) + py * np.sin(t)), 1))

top = round(circles['top-arc'][1] - circles['top-arc'][2], 1)
bottom = round(circles['bottom-arc'][1] + circles['bottom-arc'][2], 1)
left = int(np.nonzero(opaque.any(0))[0].min())
right = int(np.nonzero((dark | ribbon).any(0))[0].max())
axis = round((circles['dot'][0] + circles['body-top'][0]) / 2, 1)


def clip(theta_deg, rho, box=(-48, -48, 560, 455)):
    """Endpoints of the line x·cosθ + y·sinθ = rho inside the box."""
    t = np.deg2rad(theta_deg)
    c, s = np.cos(t), np.sin(t)
    x0, y0, x1, y1 = box
    pts = []
    for x in (x0, x1):
        if abs(s) > 1e-9:
            y = (rho - x * c) / s
            if y0 <= y <= y1: pts.append((x, y))
    for y in (y0, y1):
        if abs(c) > 1e-9:
            x = (rho - y * s) / c
            if x0 <= x <= x1: pts.append((x, y))
    pts = sorted(set((round(px, 1), round(py, 1)) for px, py in pts))
    return pts[0], pts[-1]


svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 407" fill="none" overflow="visible" aria-hidden="true">',
       '  <g stroke="#111" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="3 4">']
for y in (top, circles['dot'][1], bottom):
    svg.append(f'    <line x1="-48" y1="{y}" x2="560" y2="{y}"/>')
svg.append(f'    <line x1="{axis}" y1="-48" x2="{axis}" y2="455"/>')
svg.append('  </g>')
svg.append('  <g stroke="#2BB24C" stroke-width="1.1">')
for x in (left, right):
    svg.append(f'    <line x1="{x}" y1="-48" x2="{x}" y2="455"/>')
for name, (theta, rho) in lines.items():
    (ax, ay), (bx, by) = clip(theta, rho)
    svg.append(f'    <line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}"/>')
svg.append('  </g>')
svg.append('  <g stroke="#F2420E" stroke-width="1.1">')
for name, (cx, cy, r) in circles.items():
    svg.append(f'    <circle cx="{cx}" cy="{cy}" r="{r}"/>')
    svg.append(f'    <circle cx="{cx}" cy="{cy}" r="2.2" fill="#F2420E" stroke="none"/>')
svg.append('  </g>')
svg.append('</svg>')
(here / 'construction-guides.svg').write_text('\n'.join(svg) + '\n', encoding='utf-8')

facts = {'lines': lines, 'circles': circles, 'top': top, 'bottom': bottom, 'left': left, 'right': right, 'axis': axis,
         'ribbon_angle': round(lines['ribbon-upper'][0] - 90, 1),
         'ribbon_width': abs(lines['ribbon-upper'][1] - lines['ribbon-lower'][1])}
print(json.dumps(facts, indent=1))
