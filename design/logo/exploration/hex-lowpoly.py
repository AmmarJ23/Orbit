"""Hex Orbit, low-poly round: faceted hex planet + tilted ring, three treatments."""
import math, sys, os
from shapely.geometry import Polygon, MultiPoint, LineString, MultiPolygon
from shapely import affinity, delaunay_triangles
from shapely.ops import unary_union

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
V = sys.argv[2] if len(sys.argv) > 2 else "v1"
C = 128.0
R = 80          # planet radius
TILT = -24      # ring tilt
RX, RY, BAND = 114, 30, 7
GAP = 8
SEAM = 2.2      # half seam width between facets
LIGHT = (-0.6, -0.8)  # light from upper left
TONES = ["#c4c4c4", "#9a9a9a", "#707070", "#474747", "#1e1e1e"]  # light → dark
# Hand-assigned per facet (light from upper left, no two neighbours share a tone).
# Order matches facets(): centre, TL edge, R edge, BL edge, top, UR inner, LR, low inner, left, left inner
FACET_TONE = [2, 1, 3, 4, 0, 1, 4, 3, 2, 0]


def pt(r, deg, cx=C, cy=C):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))


def facets():
    V = [pt(R, -90 + 60 * i) for i in range(6)]            # pointy-top hex: top, UR, LR, bottom, LL, UL
    P = [pt(R * 0.42, a) for a in (-120, 0, 120)]          # inner triangle aims at edge midpoints, not vertices
    idx = [("P0", "P1", "P2"),
           ("P0", "V5", "V0"), ("P1", "V1", "V2"), ("P2", "V3", "V4"),
           ("P0", "V0", "V1"), ("P0", "V1", "P1"),
           ("P1", "V2", "V3"), ("P1", "V3", "P2"),
           ("P2", "V4", "V5"), ("P2", "V5", "P0")]
    pts = {f"V{i}": v for i, v in enumerate(V)} | {f"P{i}": p for i, p in enumerate(P)}
    return [Polygon([pts[a], pts[b], pts[c]]) for a, b, c in idx], Polygon(V)


def tone(poly):
    cx, cy = poly.centroid.coords[0]
    dx, dy = cx - C, cy - C
    n = math.hypot(dx, dy) or 1
    lum = (dx * LIGHT[0] + dy * LIGHT[1]) / n  # -1..1
    lum = lum * min(1, n / (R * 0.35))
    idx = int(round((lum + 1) / 2 * (len(TONES) - 1)))
    return TONES[max(0, min(len(TONES) - 1, idx))]


def ellipse(a0=0, a1=360, n=360, poly_n=None):
    if poly_n:  # low-poly ring: straight segments between evenly spaced vertices
        pts = [(C + RX * math.cos(2 * math.pi * i / poly_n), C + RY * math.sin(2 * math.pi * i / poly_n))
               for i in range(poly_n + 1)]
        line = LineString(pts)
        if (a0, a1) != (0, 360):
            from shapely.geometry import box
            line = line.intersection(box(0, C + 1, 256, 256))  # lower half in ring frame = front
    else:
        pts = [(C + RX * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                C + RY * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
        line = LineString(pts)
    return affinity.rotate(line, TILT, origin=(C, C))


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def d_of(geom):
    geom = geom.simplify(0.1)
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom] if geom.geom_type == "Polygon" else \
        [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]
    out = []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append("M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in c) + "Z")
    return " ".join(out)


def svg(layers, title, w=256, extra=""):
    body = "".join(f'<path fill="{f}" stroke="{f}" stroke-width=".6" stroke-linejoin="round" fill-rule="evenodd" d="{d}"/>' for f, d in layers if d)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 256" width="{w}" height="256" role="img">'
            f"<title>{title}</title>{body}{extra}</svg>\n")


WORD = ('<text x="290" y="168" font-family="Avenir Next, Avenir, Helvetica Neue, sans-serif" font-weight="600" '
        'font-size="150" letter-spacing="-3" fill="#000">orbit</text>')


def build(kind):
    tris, hexp = facets()
    poly_n = 16 if kind == "c" else None
    full = ellipse(poly_n=poly_n)
    front = ellipse(10, 170, 160, poly_n=poly_n)
    join = 2 if poly_n else 1
    band = full.buffer(BAND, cap_style=1, join_style=join)
    front_band = front.buffer(BAND, cap_style=2, join_style=join).intersection(band)
    cut = front.buffer(BAND + GAP, cap_style=2, join_style=join)
    layers = []
    if kind == "a":  # one colour: facets separated by seams
        planet = unary_union([t.buffer(-SEAM, join_style=2) for t in tris]).difference(cut)
        layers.append(("#000", d_of(unary_union([planet, band]))))
    else:            # tonal facets, ring drawn round the planet
        layers.append(("#000", d_of(band)))
        for i, t in enumerate(tris):
            layers.append((TONES[FACET_TONE[i]], d_of(t.difference(cut))))
        layers.append(("#000", d_of(front_band)))
    return layers


def place(layers, s, dx, dy):
    """Re-emit layers scaled/translated via a group transform (concept lockups only)."""
    return f'<g transform="translate({dx} {dy}) scale({s})">' + "".join(
        f'<path fill="{f}" fill-rule="evenodd" d="{d}"/>' for f, d in layers if d) + "</g>"


os.makedirs(OUT, exist_ok=True)
for k, name in [("a", "Facet Seams"), ("b", "Shaded Facets"), ("c", "Low-poly System")]:
    L = build(k)
    open(f"{OUT}/hex-{k}-{V}.svg", "w").write(svg(L, f"Orbit — {name}"))
    lock = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 256" width="760" height="256" role="img">'
            f"<title>Orbit — {name} lockup</title>{place(L, 0.9, 6, 13)}{WORD}</svg>\n")
    open(f"{OUT}/hex-{k}-lockup-{V}.svg", "w").write(lock)
print("ok")
