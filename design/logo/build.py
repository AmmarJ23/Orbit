"""Orbit logo masters — Shaded Facets direction.

Run with a Python that has shapely:  python build.py <out-dir>
Writes symbol, small-size cut, mono, wordmark and lockup SVGs.
"""
import math, os, sys
from shapely.geometry import Polygon, Point, LineString, MultiPolygon, box
from shapely import affinity
from shapely.ops import unary_union

OUT = sys.argv[1] if len(sys.argv) > 1 else "masters"
C = 128.0

# ── palette ────────────────────────────────────────────────────────────────
# facet tones light → dark; ring colour. Dark tones lifted on the dark-bg set so the shadow side keeps its edge.
PAL = {
    "dark":  {"tones": ["#A2D3FF", "#79BFFF", "#5894C5", "#3A75B0", "#27456E"], "ring": "#79BFFF", "word": "#F2F6FF"},
    "light": {"tones": ["#8CC6FA", "#5FA6E6", "#3C7FC2", "#245BA8", "#17335A"], "ring": "#245BA8", "word": "#17233B"},
}
# per facet (order of facets()), light from upper left, neighbours never share a tone
FACET_TONE = [2, 1, 3, 4, 0, 1, 4, 3, 2, 0]
# small-size cut: three tone groups (light top, mid body, dark base)
SMALL_GROUPS = {0: [1, 4, 9], 2: [0, 5, 8, 2], 4: [3, 6, 7]}


def pt(r, deg, cx=C, cy=C):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))


# ── symbol geometry ────────────────────────────────────────────────────────
R, TILT, RX, RY = 80, -24, 114, 30


def facets():
    V = [pt(R, -90 + 60 * i) for i in range(6)]       # pointy-top hex: top, UR, LR, bottom, LL, UL
    P = [pt(R * 0.42, a) for a in (-120, 0, 120)]     # inner triangle aims at edge midpoints (no cube "Y")
    pts = {f"V{i}": v for i, v in enumerate(V)} | {f"P{i}": p for i, p in enumerate(P)}
    idx = [("P0", "P1", "P2"),
           ("P0", "V5", "V0"), ("P1", "V1", "V2"), ("P2", "V3", "V4"),
           ("P0", "V0", "V1"), ("P0", "V1", "P1"),
           ("P1", "V2", "V3"), ("P1", "V3", "P2"),
           ("P2", "V4", "V5"), ("P2", "V5", "P0")]
    return [Polygon([pts[a], pts[b], pts[c]]) for a, b, c in idx]


def ellipse(a0=0, a1=360, n=720):
    pts = [(C + RX * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
            C + RY * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return affinity.rotate(LineString(pts), TILT, origin=(C, C))


def symbol_parts(band=7, gap=8):
    """Returns (back ring, [facet polys], front ring) on the 256 canvas."""
    full, front = ellipse(), ellipse(8, 172)
    ring = full.buffer(band, cap_style=1, resolution=32)
    cut = front.buffer(band + gap, cap_style=2, resolution=32)
    front_band = front.buffer(band + 0.01, cap_style=2, resolution=32).intersection(ring)
    fs = []
    for f in facets():
        g = f.difference(cut)
        # drop slivers the cut leaves behind (they vanish small and read as dirt large)
        if isinstance(g, MultiPolygon):
            g = unary_union([p for p in g.geoms if p.area > 12])
        fs.append(g if not g.is_empty and g.area > 12 else None)
    return ring, fs, front_band, cut


# ── wordmark: geometric lowercase built from rings and bars, hex tittle ────
XH, SW, BASE = 100, 18, 190      # x-height, stem weight, baseline (in a 256-tall box)
TOP, ASC = BASE - XH, 40          # x-height line, ascender line
RO, RI = XH / 2 + 1.5, XH / 2 + 1.5 - SW - 1   # overshoot on rounds; rounds a touch thinner than stems


def bowl(cx):
    cy = BASE - XH / 2
    return Point(cx, cy).buffer(RO, 128).difference(Point(cx, cy).buffer(RI, 128))


def wedge(cx, cy, a0, a1, r=200):
    pts = [(cx, cy)] + [pt(r, a0 + (a1 - a0) * i / 64, cx, cy) for i in range(65)]
    return Polygon(pts)


def wordmark():
    x, gap, glyphs = 0.0, 15.0, []
    # o
    glyphs.append(bowl(x + RO)); x += 2 * RO + gap
    # r: stem + shoulder (upper-left quarter of a bowl, running to 300°)
    stem = box(x, TOP, x + SW, BASE)
    shoulder = bowl(x + RO).intersection(wedge(x + RO, BASE - XH / 2, 180, 292))
    r = unary_union([stem, shoulder]).intersection(box(x, TOP - 2, x + 200, BASE))
    glyphs.append(r); x = r.bounds[2] + gap * 0.6
    # b: ascender stem + bowl
    b = unary_union([box(x, ASC, x + SW, BASE), bowl(x + RO)])
    glyphs.append(b); x = b.bounds[2] + gap
    # i: stem + hexagon tittle (the planet, small)
    hx = x + SW / 2
    tittle = Polygon([pt(13, -90 + 60 * k, hx, TOP - 28) for k in range(6)])
    glyphs.append(unary_union([box(x, TOP, x + SW, BASE), tittle])); x += SW + gap
    # t: stem + crossbar, top cut at 45° so it reads as a t, not a cross
    stem = box(x, ASC + 14, x + SW, BASE)
    stem = stem.difference(Polygon([(x - 1, ASC + 14 - 1), (x - 1, ASC + 14 + SW), (x + SW + 1, ASC + 14 - 1)]))
    bar = box(x - 12, TOP, x + SW + 20, TOP + SW - 2)
    glyphs.append(unary_union([stem, bar]))
    return unary_union(glyphs)


# ── SVG output ─────────────────────────────────────────────────────────────
def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def d_of(geom, tol=0.2):
    if geom is None or geom.is_empty:
        return ""
    geom = geom.simplify(tol)
    polys = list(geom.geoms) if hasattr(geom, "geoms") else [geom]
    out = []
    for p in polys:
        if p.geom_type != "Polygon":
            continue
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append("M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in c) + "Z")
    return " ".join(out)


def path(fill, geom):
    d = d_of(geom)
    return f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>' if d else ""


def doc(body, title, w=256, h=256, vb=None):
    vb = vb or f"0 0 {w} {h}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n')


def symbol_body(theme, small=False):
    p = PAL[theme]
    ring, fs, front, _ = symbol_parts(band=9 if small else 7, gap=10 if small else 8)
    parts = [path(p["ring"], ring)]
    if small:
        for tone, ids in SMALL_GROUPS.items():
            g = unary_union([fs[i].buffer(0.5, join_style=2) for i in ids if fs[i] is not None])
            parts.append(path(p["tones"][tone], g))
    else:
        # facets grow 0.4 so neighbours overlap; no anti-alias hairlines, no strokes needed
        for i, f in enumerate(fs):
            if f is not None:
                parts.append(path(p["tones"][FACET_TONE[i]], f.buffer(0.4, join_style=2)))
    parts.append(path(p["ring"], front))
    return "".join(parts)


def mono_geom(seams=True, small=False):
    band, gap = (9, 10) if small else (7, 8)
    ring, fs, front, cut = symbol_parts(band, gap)
    if seams:
        planet = unary_union([f.buffer(-2.4, join_style=2) for f in facets()]).difference(cut)
    else:
        planet = unary_union(facets()).difference(cut)
    return unary_union([planet, ring])


def write(name, svg):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(svg)


def main():
    os.makedirs(OUT, exist_ok=True)
    for theme in ("light", "dark"):
        write(f"orbit-symbol-{theme}.svg", doc(symbol_body(theme), "Orbit"))
        write(f"orbit-symbol-small-{theme}.svg", doc(symbol_body(theme, small=True), "Orbit"))
    write("orbit-symbol-mono.svg", doc(path("#000", mono_geom(True)), "Orbit"))
    write("orbit-symbol-mono-solid.svg", doc(path("#000", mono_geom(False, small=True)), "Orbit"))

    wm = wordmark()
    minx, miny, maxx, maxy = wm.bounds
    wm = affinity.translate(wm, -minx, 0)
    ww = maxx - minx
    for theme in ("light", "dark"):
        write(f"orbit-wordmark-{theme}.svg",
              doc(path(PAL[theme]["word"], wm), "Orbit", w=round(ww), h=256, vb=f"0 0 {fmt(ww)} 256"))

    # horizontal lockup: symbol at 256, wordmark x-height = planet hex flat-to-flat-ish, gap = one stem x3
    s_scale = 1.0
    sym_w = 256
    gap = 22
    wx = sym_w + gap - 18          # symbol canvas has ~16 u side padding; pull the word in optically
    wordshift = 128 - (BASE - XH / 2)  # centre x-height on the planet centre
    total = wx + ww + 8
    for theme in ("light", "dark"):
        body = (f'<g id="symbol">{symbol_body(theme)}</g>'
                f'<g id="wordmark" transform="translate({fmt(wx)} {fmt(wordshift)})">{path(PAL[theme]["word"], wm)}</g>')
        write(f"orbit-lockup-horizontal-{theme}.svg", doc(body, "Orbit", w=round(total), h=256, vb=f"0 0 {fmt(total)} 256"))
        mono = (f'<g id="symbol">{path("#000", mono_geom(True))}</g>'
                f'<g id="wordmark" transform="translate({fmt(wx)} {fmt(wordshift)})">{path("#000", wm)}</g>')
    write("orbit-lockup-horizontal-mono.svg", doc(mono, "Orbit", w=round(total), h=256, vb=f"0 0 {fmt(total)} 256"))

    # stacked lockup: symbol above, word below, centred
    sw = max(256, ww)
    k = 0.62   # wordmark scale in the stack
    stack_h = 256 + 24 + (BASE - ASC + 30) * k
    for theme in ("light", "dark"):
        body = (f'<g id="symbol" transform="translate({fmt((sw - 256) / 2)} 0)">{symbol_body(theme)}</g>'
                f'<g id="wordmark" transform="translate({fmt((sw - ww * k) / 2)} {fmt(232 - (ASC - 30) * k)}) scale({k})">'
                f'{path(PAL[theme]["word"], wm)}</g>')
        write(f"orbit-lockup-stacked-{theme}.svg",
              doc(body, "Orbit", w=round(sw), h=round(stack_h), vb=f"0 0 {fmt(sw)} {fmt(stack_h)}"))
    # app icon: symbol on the midnight tile (macOS-style 1024 canvas, 824 tile, 185 radius)
    for small, suffix in ((False, ""), (True, "-small")):
        body = (f'<rect x="100" y="100" width="824" height="824" rx="185" fill="#0C1222"/>'
                f'<g transform="translate(512 512) scale(2.6) translate(-128 -126)">{symbol_body("dark", small)}</g>')
        write(f"orbit-app-icon{suffix}.svg", doc(body, "Orbit", w=1024, h=1024))
    print("wordmark width", round(ww))


if __name__ == "__main__":
    main()
