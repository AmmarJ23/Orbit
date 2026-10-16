"""Generate Orbit logo concepts as black-first SVG geometry (shapely booleans)."""
import math, sys, os
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely import affinity
from shapely.ops import unary_union

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
V = sys.argv[2] if len(sys.argv) > 2 else "v1"
C = 128.0


def hexagon(cx, cy, r, rot=-90):
    return Polygon([(cx + r * math.cos(math.radians(rot + 60 * i)),
                     cy + r * math.sin(math.radians(rot + 60 * i))) for i in range(6)])


def ellipse_line(cx, cy, rx, ry, rot, a0=0, a1=360, n=360):
    pts = []
    for i in range(n + 1):
        t = math.radians(a0 + (a1 - a0) * i / n)
        pts.append((cx + rx * math.cos(t), cy + ry * math.sin(t)))
    return affinity.rotate(LineString(pts), rot, origin=(cx, cy))


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def ring_d(ring):
    pts = list(ring.coords)
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts[:-1]) + "Z"


def to_d(geom):
    geom = geom.simplify(0.15)
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    parts = []
    for p in polys:
        parts.append(ring_d(p.exterior))
        parts += [ring_d(i) for i in p.interiors]
    return " ".join(parts)


def svg(d, title, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img">'
            f'<title>{title}</title><path fill="#000" fill-rule="evenodd" d="{d}"/>{extra}</svg>\n')


def lockup(d, title, word="orbit"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 256" width="760" height="256" role="img">'
            f'<title>{title}</title><path fill="#000" fill-rule="evenodd" d="{d}"/>'
            f'<text x="290" y="168" font-family="Avenir Next, Avenir, Helvetica Neue, sans-serif" font-weight="600" '
            f'font-size="150" letter-spacing="-3" fill="#000">{word}</text></svg>\n')


GAP = 9  # knockout gap, units on 256 grid


# A — Hex Orbit: evolution of the current icon. Hex planet, one tilted ring passing in front.
def concept_a():
    tilt = -24
    planet = hexagon(C, C, 80)
    full = ellipse_line(C, C, 114, 30, tilt)
    band = full.buffer(7, cap_style=1)
    front = ellipse_line(C, C, 114, 30, tilt, 10, 170, 160)  # lower (front) arc
    planet = planet.difference(front.buffer(7 + GAP))
    return unary_union([planet, band])


# B — Centre: you at the centre, one task planet on the orbit (an "o" that is a system).
def concept_b():
    ring = Point(C, C).buffer(96, 256).difference(Point(C, C).buffer(78, 256))
    ang = math.radians(-45)
    px, py = C + 87 * math.cos(ang), C + 87 * math.sin(ang)
    planet = hexagon(px, py, 30, rot=-90)
    ring = ring.difference(planet.buffer(GAP, join_style=2))
    core = Point(C, C).buffer(22, 128)
    return unary_union([ring, planet, core])


# C — Spiral in: an orbit that decays into the completed core; the stroke thins as it falls in.
def concept_c():
    r0, r1, turns = 102, 40, 1.2
    a_start = -50
    w0, w1 = 11, 1.5
    n = 500
    left, right, pts = [], [], []
    for i in range(n + 1):
        t = i / n
        a = math.radians(a_start + 360 * turns * t)
        r = r0 + (r1 - r0) * t
        pts.append((r, a))
    for i, (r, a) in enumerate(pts):
        t = i / n
        w = w0 + (w1 - w0) * (t ** 0.8)
        left.append((C + (r + w) * math.cos(a), C + (r + w) * math.sin(a)))
        right.append((C + (r - w) * math.cos(a), C + (r - w) * math.sin(a)))
    trail = Polygon(left + right[::-1]).buffer(0)
    r, a = pts[0]
    sx, sy = C + r * math.cos(a), C + r * math.sin(a)
    trail = trail.union(Point(sx, sy).buffer(w0, 64))
    core = Point(C, C).buffer(26, 128)
    planet = hexagon(sx, sy, 24)
    trail = trail.difference(planet.buffer(GAP, join_style=2))
    return unary_union([trail, core, planet])


def center(geom):
    minx, miny, maxx, maxy = geom.bounds
    return affinity.translate(geom, 128 - (minx + maxx) / 2, 128 - (miny + maxy) / 2 - 1)


os.makedirs(OUT, exist_ok=True)
for key, fn, name in [("a", concept_a, "Hex Orbit"), ("b", concept_b, "Centre"), ("c", concept_c, "Spiral In")]:
    g = center(fn())
    d = to_d(g)
    open(f"{OUT}/concept-{key}-{V}.svg", "w").write(svg(d, f"Orbit — {name}"))
    small = affinity.scale(g, 0.86, 0.86, origin=(0, 0))
    small = affinity.translate(small, 20, 128 - 0.86 * 128 - 0)
    open(f"{OUT}/concept-{key}-lockup-{V}.svg", "w").write(lockup(to_d(small), f"Orbit — {name} lockup"))
    print(key, [round(b) for b in g.bounds])
