"""Router fixtures from the toolbox's own route(): grid steps in, grid steps out."""
import json, random, subprocess, sys
import numpy as np
from manimations.toolbox.wire import route, Junction
from manimations.toolbox.element import Pin
from manimations.toolbox import style

G = style.GRID
DIRS = {"left": (-1, 0), "right": (1, 0), "up": (0, 1), "down": (0, -1), None: None}

def end(p, d):
    pt = np.array([p[0] * G, p[1] * G, 0.0])
    if d is None:
        return tuple(pt[:2])
    return Pin(point=pt, direction=np.array([*DIRS[d], 0.0]))

rnd = random.Random(20261112)
cases = []
names = list(DIRS)
for i in range(60):
    p0 = [rnd.randint(-12, 12), rnd.randint(-12, 12)]
    p1 = [rnd.randint(-12, 12), rnd.randint(-12, 12)]
    d0, d1 = rnd.choice(names), rnd.choice(names)
    via = []
    if i % 3 == 1:
        via = [[rnd.randint(-12, 12), p0[1]]]
    elif i % 3 == 2:
        x = rnd.randint(-12, 12); y = rnd.randint(-12, 12)
        via = [[x, p0[1]], [x, y]]
    first = rnd.choice([None, None, "h", "v"])
    cases.append(dict(start=dict(at=p0, direction=d0), end=dict(at=p1, direction=d1), via=via, first=first))
# half-way Z midpoints: both rounding directions of round-half-even
cases += [dict(start=dict(at=[5, 0], direction="right"), end=dict(at=[16, 5], direction="left"), via=[], first=None),
          dict(start=dict(at=[5, 0], direction="right"), end=dict(at=[18, 5], direction="left"), via=[], first=None),
          dict(start=dict(at=[0, 3], direction="up"), end=dict(at=[4, 10], direction="down"), via=[], first=None),
          dict(start=dict(at=[0, 0], direction="right"), end=dict(at=[0, 0], direction="left"), via=[], first=None)]
out = []
for c in cases:
    pts = route(end(c["start"]["at"], c["start"]["direction"]), end(c["end"]["at"], c["end"]["direction"]),
                via=[(v[0] * G, v[1] * G) for v in c["via"]], first=c["first"])
    corners = [[p[0] / G, p[1] / G] for p in pts]
    assert all(abs(v - round(v)) < 1e-6 for q in corners for v in q), corners
    c["corners"] = [[int(round(v)) for v in q] for q in corners]
    out.append(c)
sha = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=sys.argv[1]).stdout.strip()
json.dump({"source": "manimations toolbox/wire.py route()", "commit": sha, "units": "grid steps, y up",
           "cases": out}, open(sys.argv[2], "w"), indent=None, separators=(",", ":"))
print(len(out), "cases from", sha)
