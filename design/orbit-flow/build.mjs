// Orbit task flow, drawn as a gravity-well orrery on a bench.
// Build: node design/orbit-flow/build.mjs [--light]
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(pathToFileURL(join(SKILL, "kit/iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(SKILL, "kit/lathe.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(SKILL, "scripts/inline-kit.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 430;
const AZIMUTH = 62;
const ELEVATION = 36;

// ---------- the model: a funnel z = f(r) whose slope sets each ring's orbital speed ----------
const Z_RIM = 70;
const R_RIM = 80;
const R_SHELF = 104;
const R_THROAT = 15;
const K_WELL = 713;
const PERIOD_1 = 8;
const BALL = 7;
const R_CUP = 93;
const CUPS = 12;
const CUP_DIP = 1.2;
const RINGS = { R: 36, C: 60 };
// pick gravity so ring 1 goes round in PERIOD_1 seconds; ring 2 then follows from the slope
const GRAV = ((2 * Math.PI / PERIOD_1) ** 2 * RINGS.R ** 3) / K_WELL;
const surface = (r) => Z_RIM - K_WELL * (1 / r - 1 / R_RIM);
const slopeAt = (r) => K_WELL / (r * r);
const omegaAt = (r) => Math.sqrt((GRAV * slopeAt(r)) / r);
const Z_THROAT = surface(R_THROAT);

// ---------- bench layout ----------
const PLATE = { x: -256, y: -122, w: 530, d: 226, r: 12 };
const PLATE_H = 12;
const FOOT_H = 5;
const COLLAR = [63, Z_RIM];
const PED = { r: 17, z0: 4, z1: 24 };
const FLANGE_R = 34;
const PIPE = { r: 8.6, z: 0, x0: 14, x1: 124 };
const RACK = { x: 126, x1: 214, y: -11, d: 22 };
const RAIL_TOP = 8;
const RACK_Z = RAIL_TOP + Math.sqrt(BALL * BALL - 4.5 * 4.5);
const SLOTS = Array.from({ length: 6 }, (_, i) => 204 - 15 * i);
PIPE.z = RACK_Z;
const ARCHIVE = { x: 214, y: -18, w: 32, d: 36, r: 2.5 };
const ARCHIVE_H = 26;
const RECEIVER = { x: -214, y: 30, w: 60, d: 36, r: 3 };
const RECEIVER_H = 16;
const DIAL = [-194, 48];
const DIAL_R = 10.5;
const DIAL_Z = RECEIVER_H + 1.5;
const POLL = 20;
const CONSOLE = { x: 104, y: -100, w: 70, d: 30, r: 3 };
const CONSOLE_H = 11;
const KNOB = [124, -84];
const TOGGLE = [156, -84];
const SPEEDS = [0.5, 1, 2, 3];
const DISHES = [
  { at: [-212, -58], mast: 66, R: 22, f: 11 },
  { at: [-172, -98], mast: 46, R: 16, f: 8 },
];

const FZ = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...Array.from({ length: 16 }, (_, i) => [R_SHELF * Math.cos((i / 16) * 2 * Math.PI), R_SHELF * Math.sin((i / 16) * 2 * Math.PI), Z_RIM + 12]),
    ...DISHES.map(({ at, mast, R }) => [at[0] - R, at[1] - R, mast + R * 1.6]),
  ],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZIMUTH, elevation: ELEVATION },
);
const SCALE = Math.hypot(...k.axisVector(P, [1, 0, 0]));
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (points) => [...points].sort((a, b) => depth2(a) - depth2(b));
const polar = (r, th, z) => [r * Math.cos(th), r * Math.sin(th), z];
const pathOf = (pts, closed) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("") + (closed ? "Z" : "");
const VIEW = (() => {
  const a = (AZIMUTH * Math.PI) / 180, e = (ELEVATION * Math.PI) / 180;
  return [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
})();
const NEAR = (AZIMUTH * Math.PI) / 180;

// ---------- static parts ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // ruler strip along the near long edge, graduated in rack pitches
  const strip = { x: 40, y: PLATE.y + PLATE.d - 18, w: 212, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 4, 0.6]), at([strip.x + strip.w - 2, strip.y + 4, 0.6])], { size: 0.45 }));
  // label plate on the near short edge
  const label = { x: -214, y: PLATE.y + PLATE.d - 26, w: 56, d: 14, r: 1.4 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "mid", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 6, label.y + 8.4], 0.8, P, "x"), "ORBIT · 01", { size: 3.6, tone: "mid" }));
  out.push(L(k.lineOnTop([label.x + 6, label.y + 11.2], [label.x + 34, label.y + 11.2], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + label.w - 4, label.y + 4, 0.8]), at([label.x + label.w - 4, label.y + label.d - 4, 0.8])], { size: 0.45 }));
  return out.join("");
}

function dish({ at: [x, y], mast, R, f }) {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 12, y: y - 12, w: 24, d: 24, r: 12 }, 0, 0.1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.cylinder(x, y, 11, 0, 3, P, 40, 0.6), { tone: "mid" }));
  out.push(D(Array.from({ length: 4 }, (_, i) => at([x + 8 * Math.cos(i * Math.PI / 2 + 0.6), y + 8 * Math.sin(i * Math.PI / 2 + 0.6), 3])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 4.6, 3, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.6, 7, mast - 7, P, 24), { tone: "mid", crease: "none", inner: L(k.sideArc(x, y, 2.6, mast * 0.55, P, 16), { tone: "faint" }) }));
  out.push(S(k.slabOf({ x: x - 4, y: y - 4, w: 8, d: 8, r: 1.2 }, mast - 2, 7, P, 3, 0.4), { tone: "mid" }));
  // dish looks up and away; its convex back faces the bench
  const axis = (() => { const a = (AZIMUTH * Math.PI) / 180; const v = [-Math.sin(a) * 0.7 - Math.cos(a) * 0.35, Math.cos(a) * 0.7 - Math.sin(a) * 0.35, 0.62]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
  const hub = [x, y, mast + 7];
  const F = G.frameAlong(hub, axis);
  const sR = (R * R) / (4 * f);
  const feedTip = G.pointOf(F, 2 + f, 0, 0);
  const strutRoots = [0, 1, 2].map((i) => G.pointOf(F, 2 + sR * 0.7, R * 0.82, (i * 2 * Math.PI) / 3 + 0.4));
  out.push(L(strutRoots.map((p) => k.segment(p, feedTip, P)).join(""), { tone: "lo" }));
  out.push(S(G.disc(2 + f - 3, 2 + f + 1.5, 2.4, F, P), { tone: "mid" }));
  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const r = Math.max(0.01, (R * i) / 10);
    profile.push([2 + (r * r) / (4 * f), r, 1]);
  }
  profile.push([2 + sR + 1, R]);
  out.push(S(G.solidOf(profile, F, P), { tone: "hi", crease: "lo", inner: L(G.arcOf(F, 2 + sR * 0.36, R * 0.6, P, { slope: (2 * f) / (R * 0.6) }), { tone: "faint" }) }));
  out.push(S(G.disc(-1, 2.4, 4.4, F, P), { tone: "mid" }));
  out.push(D([at(G.pointOf(F, 2.4, 0, 0))], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function receiver() {
  const out = [`<path class="iso-halo" d="${k.haloOf(RECEIVER, 0, RECEIVER_H, P)}"/>`];
  out.push(S(k.slabOf(RECEIVER, 0, RECEIVER_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(RECEIVER, 4, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(RECEIVER, 3), RECEIVER_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(RECEIVER, 5.5).map(([x, y]) => at([x, y, RECEIVER_H])), { size: 0.45 }));
  // vent slots on the top, closed outlines
  for (let i = 0; i < 5; i++) out.push(L(k.planOutline({ x: RECEIVER.x + 34 + i * 4, y: RECEIVER.y + 8, w: 1.6, d: 12, r: 0.8 }, RECEIVER_H, P, 3), { tone: "lo" }));
  // two input jacks on the back face, one output jack on the +x face
  out.push(S(k.slabOf({ x: RECEIVER.x + RECEIVER.w, y: RECEIVER.y + 11.5, w: 3, d: 5, r: 1 }, 1, 5, P, 2), { tone: "mid", crease: "none" }));
  // poll dial: one tick per second of the 20 s sync interval
  const [dx, dy] = DIAL;
  out.push(S(k.cylinder(dx, dy, DIAL_R, RECEIVER_H, 1.5, P, 56, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(dx, dy, DIAL_R - 1.6, DIAL_Z, P, 56), { tone: "lo" }));
  const t = k.radialTicks(dx, dy, DIAL_R - 2.2, POLL, 5, DIAL_Z, [1, 2.2], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.ring(dx, dy, 1.3, DIAL_Z, P, 16), { tone: "mid" }));
  // a lamp that blinks when a sync lands
  const lamp = [RECEIVER.x + 48, RECEIVER.y + 28];
  out.push(S(k.cylinder(lamp[0], lamp[1], 2.6, RECEIVER_H, 1.6, P, 20), { tone: "mid" }));
  return out.join("");
}

const needleAt = (share) => {
  const a = share * Math.PI * 2;
  const [x, y] = DIAL;
  return k.lineOnTop([x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4], [x + Math.sin(a) * (DIAL_R - 3), y - Math.cos(a) * (DIAL_R - 3)], DIAL_Z + 0.2, P);
};

function cables() {
  // floor cables: each dish to a receiver input, the receiver output to the well's base flange
  const z = 0.4;
  const jackA = [RECEIVER.x + 14, RECEIVER.y];
  const jackB = [RECEIVER.x + 34, RECEIVER.y];
  const outJack = [RECEIVER.x + RECEIVER.w, RECEIVER.y + 14];
  const port = polar(FLANGE_R, Math.atan2(RECEIVER.y + 14, RECEIVER.x + RECEIVER.w), 0);
  const csPort = polar(FLANGE_R, Math.atan2(-60, 70), 0);
  const routes = {
    a: [[DISHES[0].at[0] + 6, DISHES[0].at[1] + 10], [DISHES[0].at[0] + 4, DISHES[0].at[1] + 40], [jackA[0], jackA[1] - 22], jackA],
    b: [[DISHES[1].at[0] - 4, DISHES[1].at[1] + 10], [DISHES[1].at[0] - 14, DISHES[1].at[1] + 50], [jackB[0], jackB[1] - 26], jackB],
    o: [outJack, [outJack[0] + 24, outJack[1]], [port[0] - 30, port[1] + 6], [port[0], port[1]]],
    c: [[CONSOLE.x + 10, CONSOLE.y + CONSOLE.d], [CONSOLE.x + 4, CONSOLE.y + CONSOLE.d + 28], [csPort[0] + 18, csPort[1] - 18], [csPort[0], csPort[1]]],
  };
  const out = [];
  const paths = {};
  for (const [name, pts] of Object.entries(routes)) {
    const screen = smoothRoute(pts).map(([x, y]) => at([x, y, z]));
    paths[name] = pathOf(screen);
    out.push(`<path class="iso-line" data-tone="mid" d="${paths[name]}" style="stroke-width:1.6"/>`);
    out.push(`<path class="iso-line" data-tone="faint" d="${paths[name]}" style="stroke-width:.5"/>`);
    if (name !== "c") out.push(`<path data-pulse="${name}" class="iso-line" data-tone="lit" d="${paths[name]}" pathLength="100" style="stroke-width:1.6;stroke-dasharray:0 100;opacity:0"/>`);
    const ends = [screen[0], screen[screen.length - 1]];
    out.push(ends.map(([x, y]) => `<circle class="iso-wire-end" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4"/>`).join(""));
  }
  return out.join("");
}

function smoothRoute(points, per = 8) {
  // Catmull-Rom through the waypoints, so floor cables bend instead of kinking
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function controls() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CONSOLE, 0, CONSOLE_H, P)}"/>`];
  out.push(S(k.slabOf(CONSOLE, 0, CONSOLE_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(CONSOLE, 3.5, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(CONSOLE, 3), CONSOLE_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(CONSOLE, 5.5).map(([x, y]) => at([x, y, CONSOLE_H])), { size: 0.45 }));
  // speed scale round the knob: 0.5×, 1×, 2×, 3×
  const [kx, ky] = KNOB;
  const ticks = k.radialTicks(kx, ky, 10.6, 12, 3, CONSOLE_H, [1, 2.2], P, -Math.PI * 0.75, Math.PI * 1.5);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(kx, ky, 8, CONSOLE_H, 1.2, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(kx, ky, 6.4, CONSOLE_H + 1.2, 4.6, P, 40, 0.5), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(kx, ky, 6.4, CONSOLE_H + 1.2, CONSOLE_H + 5.8, 40, P), { tone: "lo" }));
  // pause toggle: a boss and a slot the lever swings along
  const [tx, ty] = TOGGLE;
  out.push(L(k.planOutline({ x: tx - 1.4, y: ty - 8, w: 2.8, d: 16, r: 1.4 }, CONSOLE_H, P, 3), { tone: "lo" }));
  out.push(S(k.cylinder(tx, ty, 3.6, CONSOLE_H, 1.6, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(tx + 10, ty - 6, 1.8, CONSOLE_H, 1.2, P, 16), { tone: "mid" }));
  return out.join("");
}
const knobPointer = (speed) => {
  const i = SPEEDS.indexOf(speed);
  const a = -Math.PI * 0.75 + (Math.PI * 1.5 * i * 4) / 12;
  const [x, y] = KNOB;
  return k.lineOnTop([x, y], [x + Math.sin(a) * 5.6, y - Math.cos(a) * 5.6], CONSOLE_H + 5.8, P);
};
const leverOf = (paused) => {
  const [x, y] = TOGGLE;
  const tip = [x, y + (paused ? -6.5 : 6.5), CONSOLE_H + 8];
  return { d: k.segment([x, y, CONSOLE_H + 1.6], tip, P), tip: k.iso(tip, P) };
};

function pedestal() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: -FLANGE_R, y: -FLANGE_R, w: FLANGE_R * 2, d: FLANGE_R * 2, r: FLANGE_R }, 0, 1, P)}"/>`];
  out.push(S(G.disc(0, PED.z0, FLANGE_R, FZ, P, { bevel: 0.8 }), { tone: "mid" }));
  out.push(D(G.dotsOf(FZ, PED.z0, FLANGE_R - 4.5, 8, P, { all: true, phase: 0.2 }), { size: 0.5 }));
  out.push(S(G.disc(PED.z0, PED.z1, PED.r, FZ, P), { tone: "mid", crease: "none", inner: L(G.arcOf(FZ, PED.z0 + 6, PED.r, P), { tone: "faint" }) }));
  return out.join("");
}

function pipe() {
  const F = G.frameOf([0, 0, PIPE.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const out = [];
  // two saddle stands under the run
  for (const x of [62, 100]) {
    out.push(S(k.slabOf({ x: x - 4, y: -6, w: 8, d: 12, r: 1 }, 0, PIPE.z - PIPE.r + 0.6, P, 3, 0.4), { tone: "mid" }));
    out.push(D([at([x, -3.5, PIPE.z - PIPE.r + 0.6]), at([x, 3.5, PIPE.z - PIPE.r + 0.6])], { size: 0.4 }));
  }
  out.push(S(G.ringBand(PED.r - 1, PED.r + 3, PIPE.r - 0.2, PIPE.r + 3, F, P), { tone: "mid" }));
  out.push(S(G.disc(PED.r + 3, PIPE.x1 - 3, PIPE.r, F, P, { rims: "none" }), { tone: "mid", crease: "none", inner: L([46, 82].map((x) => G.arcOf(F, x, PIPE.r, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.ringBand(PIPE.x1 - 3, PIPE.x1, PIPE.r - 1.2, PIPE.r + 3, F, P, { hole: [PIPE.x1, PIPE.r - 1.2] }), { tone: "mid" }));
  out.push(D(G.dotsOf(F, PIPE.x1, PIPE.r + 1.7, 6, P, { all: true, phase: 0.5 }), { size: 0.45 }));
  // the open mouth: a dark bore
  const mouth = G.circleOf(F, PIPE.x1, PIPE.r - 1.2, P, 40);
  out.push(`<path class="orb-bore" d="${mouth}"/>`);
  return { svg: out.join(""), mouth: Array.from({ length: 40 }, (_, i) => at(G.pointOf(F, PIPE.x1, PIPE.r - 1.2, (i / 40) * 2 * Math.PI))) };
}

function bowl() {
  const out = [];
  // the turned body under the shelf: r = 17 + 87·u³ from the pedestal to the collar
  const s0 = PED.z1, s1 = COLLAR[0];
  const radius = (s) => 17 + 87 * Math.pow(Math.max(0, (s - s0) / (s1 - s0)), 3);
  const slope = (s) => (3 * 87 * Math.pow(Math.max(0, (s - s0) / (s1 - s0)), 2)) / (s1 - s0);
  const profile = Array.from({ length: 25 }, (_, i) => { const s = s0 + ((s1 - s0) * i) / 24; return [s, radius(s), 1]; });
  out.push(S(G.solidOf(profile, FZ, P, { smooth: { slope, radius } }), { tone: "mid", crease: "none", inner: L([34, 46, 54].map((s) => G.arcOf(FZ, s, radius(s), P, { slope: slope(s) })).join(""), { tone: "faint" }) }));
  // the waiting shelf: a flat collar with twelve cups
  out.push(S(G.ringBand(COLLAR[0], COLLAR[1], R_RIM, R_SHELF, FZ, P, { bevel: 0.8 }), { tone: "mid", inner: L(G.arcOf(FZ, COLLAR[0] + 2.4, R_SHELF, P), { tone: "faint" }) }));
  out.push(D(G.dotsOf(FZ, COLLAR[0] + 4.6, R_SHELF, 36, P, { fade: [0.04, 0.42] }), { size: 0.45 }));
  const ticks = k.radialTicks(0, 0, R_SHELF - 1.2, 72, 6, Z_RIM, [1.4, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(0, 0, R_RIM + 1.6, Z_RIM, P, 160), { tone: "lo" }));
  for (let i = 0; i < CUPS; i++) {
    const [x, y] = polar(R_CUP, cupAngle(i), 0);
    out.push(L(k.ring(x, y, 4.6, Z_RIM, P, 28), { tone: "lo" }), L(k.ring(x, y, 2.6, Z_RIM, P, 20), { tone: "faint" }));
  }
  return out.join("");
}
const cupAngle = (i) => (i / CUPS) * 2 * Math.PI + Math.PI / CUPS;

function well() {
  // the funnel seen from above: a filled opening, a spacetime grid, two orbit grooves and the throat
  const out = [];
  const rimPts = Array.from({ length: 160 }, (_, i) => at(polar(R_RIM, (i / 160) * 2 * Math.PI, Z_RIM)));
  const [tx, ty] = at([0, 0, Z_THROAT]);
  const [rx] = at([R_RIM, 0, Z_RIM]);
  const rw = Math.abs(at(polar(R_RIM, NEAR + Math.PI / 2, 0))[0] - tx);
  const squash = Math.sin((ELEVATION * Math.PI) / 180);
  out.push(`<defs><radialGradient id="orb-well" gradientUnits="userSpaceOnUse" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${rw.toFixed(1)}" gradientTransform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(1 ${squash.toFixed(3)}) translate(${(-tx).toFixed(1)} ${(-ty).toFixed(1)})"><stop offset="0" stop-color="var(--orb-core)"/><stop offset=".22" stop-color="var(--anatomy-shade-0)"/><stop offset=".62" stop-color="var(--anatomy-shade-2)"/><stop offset="1" stop-color="var(--anatomy-top)"/></radialGradient></defs>`);
  out.push(`<path d="${pathOf(rimPts, true)}" fill="url(#orb-well)"/>`);
  const visible = (r, th) => {
    const s = slopeAt(r);
    const n = [-s * Math.cos(th), -s * Math.sin(th), 1];
    return n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] > 0.02;
  };
  const runs = (samples) => {
    const parts = [];
    let cur = [];
    for (const [r, th] of samples) {
      if (visible(r, th)) cur.push(at(polar(r, th, surface(r))));
      else if (cur.length) { parts.push(cur); cur = []; }
    }
    if (cur.length) parts.push(cur);
    return parts.filter((p) => p.length > 1);
  };
  const grid = [];
  // latitude rings at equal steps of depth, like a rubber-sheet gravity well
  for (let i = 1; i <= 9; i++) {
    const z = Z_RIM - i * 5;
    const r = 1 / ((Z_RIM - z) / K_WELL + 1 / R_RIM);
    if (r < R_THROAT + 1) break;
    if (Math.abs(r - RINGS.R) < 3 || Math.abs(r - RINGS.C) < 3) continue;
    const loop = Array.from({ length: 145 }, (_, j) => [r, NEAR + Math.PI + (j / 144) * 2 * Math.PI]);
    grid.push(...runs(loop));
  }
  const meridians = [];
  for (let j = 0; j < 24; j++) {
    const th = (j / 24) * 2 * Math.PI + Math.PI / 24;
    const line = Array.from({ length: 40 }, (_, i) => [R_RIM - ((R_RIM - R_THROAT) * i) / 39, th]);
    meridians.push(...runs(line));
  }
  out.push(`<g clip-path="url(#orb-clip-well)">`);
  out.push(L(grid.map((p) => pathOf(p)).join(""), { tone: "faint" }));
  out.push(L(meridians.map((p) => pathOf(p)).join(""), { tone: "faint" }));
  for (const r of [RINGS.R, RINGS.C]) {
    for (const dr of [-1.4, 1.4]) {
      const rr = r + dr;
      const loop = Array.from({ length: 181 }, (_, j) => [rr, NEAR + Math.PI + (j / 180) * 2 * Math.PI]);
      out.push(L(runs(loop).map((p) => pathOf(p)).join(""), { tone: "mid" }));
    }
  }
  out.push(`</g>`);
  // the throat: a dark core with a thin lip
  const throat = Array.from({ length: 64 }, (_, i) => at(polar(R_THROAT, (i / 64) * 2 * Math.PI, Z_THROAT)));
  out.push(`<path class="orb-core" d="${pathOf(throat, true)}"/>`);
  out.push(L(pathOf(throat, true), { tone: "mid" }));
  // the rim lip: a thin rolled edge
  out.push(L(pathOf(rimPts, true), { tone: "mid" }));
  return { svg: out.join(""), rimPts, throat };
}

// clip regions: everything on screen above the near half of an opening's rim
const aboveNearArc = (r, z) => {
  const arc = Array.from({ length: 73 }, (_, i) => at(polar(r, NEAR - Math.PI / 2 + (i / 72) * Math.PI, z)));
  return pathOf([...arc, [arc[arc.length - 1][0], -999], [arc[0][0], -999]], true);
};

function rack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: RACK.x, y: RACK.y, w: RACK.x1 - RACK.x, d: RACK.d, r: 2 }, 0, 5, P)}"/>`];
  const base = { x: RACK.x, y: RACK.y, w: RACK.x1 - RACK.x, d: RACK.d, r: 2 };
  out.push(S(k.slabOf(base, 0, 5, P, 3, 0.6), { tone: "mid" }));
  out.push(D([RACK.x + 4, RACK.x1 - 4].flatMap((x) => [at([x, RACK.y + 3, 5]), at([x, RACK.y + RACK.d - 3, 5])]), { size: 0.45 }));
  // slot marks on the base between the rails, one per completed task
  out.push(L(SLOTS.map((x) => k.lineOnTop([x, -3], [x, 3], 5, P)).join(""), { tone: "faint" }));
  const rail = (y) => S(k.slabOf({ x: RACK.x, y, w: RACK.x1 - RACK.x, d: 3, r: 0.8 }, 5, RAIL_TOP - 5, P, 2, 0.3), { tone: "mid" });
  return { back: out.join("") + rail(-7.5), front: rail(4.5) };
}

function archive() {
  const out = [`<path class="iso-halo" d="${k.haloOf(ARCHIVE, 0, ARCHIVE_H, P)}"/>`];
  out.push(S(k.slabOf(ARCHIVE, 0, ARCHIVE_H, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(ARCHIVE, ARCHIVE_H - 5, P, 3), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(ARCHIVE, 3), ARCHIVE_H, P, 3), { tone: "faint" }));
  out.push(D(k.corners(ARCHIVE, 5).map(([x, y]) => at([x, y, ARCHIVE_H])), { size: 0.45 }));
  // counter window on the +x face, showing how many tasks are done
  const face = ARCHIVE.x + ARCHIVE.w;
  const win = { y0: -9, y1: 9, z0: 8, z1: 16 };
  const corners = [[face, win.y0, win.z0], [face, win.y1, win.z0], [face, win.y1, win.z1], [face, win.y0, win.z1]].map(at);
  out.push(`<path class="orb-window" d="${pathOf(corners, true)}"/>`);
  out.push(L(pathOf(corners, true), { tone: "lo" }));
  out.push(`<text data-counter class="orb-counter" transform="${k.sideMatrix([face, 0, win.z0 + 2], 0, P, "right")}" text-anchor="middle">000</text>`);
  out.push(D([at([face, -12.5, 12]), at([face, 12.5, 12])], { size: 0.45 }));
  return out.join("");
}

// ---------- ball templates, built once at the origin and moved by translate ----------
function ballSvg(src, lit) {
  const sphere = G.sphereOf([0, 0, 0], BALL, P);
  let inner = "";
  if (src === "C") {
    // a ClickUp ball carries a cloud band round its equator
    const F = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    inner = L([-1.2, 1.4].map((s) => G.arcOf(F, s, Math.sqrt(BALL * BALL - s * s), P, { slope: -s / Math.sqrt(BALL * BALL - s * s) })).join(""), { tone: lit ? "lit" : "lo" });
  }
  return `<g class="orb-ball"${lit ? " data-lit" : ""}>${S(sphere, { tone: "hi", lit, inner })}</g>`;
}

const PIPE_PARTS = pipe();
const WELL = well();
const RACK_PARTS = rack();
const clips = `<defs>
<clipPath id="orb-clip-well"><path d="${aboveNearArc(R_RIM, Z_RIM)}"/></clipPath>
<clipPath id="orb-clip-throat"><path d="${aboveNearArc(R_THROAT, Z_THROAT)}"/></clipPath>
<clipPath id="orb-clip-mouth"><path d="${(() => {
  const dir = k.axisVector(P, [1, 0, 0]);
  const pts = [...PIPE_PARTS.mouth, ...PIPE_PARTS.mouth.map(([x, y]) => [x + dir[0] * 120, y + dir[1] * 120])];
  return pathOf(hull(pts), true);
})()}"/></clipPath>
</defs>`;

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function stars() {
  // a fixed, seeded star field behind the bench
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < 150; i++) {
    const x = rand() * WIDTH, y = rand() * HEIGHT, r = 0.25 + rand() * rand() * 0.9, o = 0.15 + rand() * 0.6;
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${o.toFixed(2)}"${i % 9 === 0 ? ` class="orb-twinkle" style="animation-delay:${(-rand() * 6).toFixed(1)}s"` : ""}/>`);
  }
  return `<g class="orb-stars" aria-hidden="true">${out.join("")}</g>`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Orbit's task flow as a gravity-well orrery on a bench. Two dish antennas feed a receiver whose dial counts down the 20-second sync. Each new task forms as a ball in a cup on the waiting shelf around the well. A ball that starts rolls into the funnel and orbits a groove: Redmine tasks on the inner ring, ClickUp tasks on the outer ring, each at the speed the funnel's slope gives that radius. A completed task spirals down the throat, runs through the pipe under the well and rolls out onto the completed rack; the oldest ball is pushed into the archive box.",
  body: [
    stars(),
    clips,
    plate(),
    ...DISHES.map(dish),
    cables(),
    receiver(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(0)}" style="stroke-width:1"/>`,
    `<path data-part="lamp" class="orb-lamp" d="${k.ring(RECEIVER.x + 48, RECEIVER.y + 28, 1.8, RECEIVER_H + 1.6, P, 20)}Z"/>`,
    controls(),
    `<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" d="${knobPointer(1)}" style="stroke-width:.9"/>`,
    `<path data-part="lever" class="iso-line" data-tone="hi" d="${leverOf(false).d}" style="stroke-width:1.4"/>`,
    `<circle data-part="lever-tip" class="orb-knob" cx="${leverOf(false).tip[0].toFixed(1)}" cy="${leverOf(false).tip[1].toFixed(1)}" r="1.5"/>`,
    pedestal(),
    PIPE_PARTS.svg,
    bowl(),
    WELL.svg,
    RACK_PARTS.back,
    `<g data-part="balls"></g>`,
    RACK_PARTS.front,
    archive(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const SPEEDS = ${JSON.stringify(SPEEDS)};
const KNOBS = ${JSON.stringify(Object.fromEntries(SPEEDS.map((v) => [v, knobPointer(v)])))};
const LEVERS = ${JSON.stringify([false, true].map(leverOf))};
const M = ${JSON.stringify({ Z_RIM, R_RIM, R_THROAT, K_WELL, GRAV, BALL, R_CUP, CUPS, CUP_DIP, RINGS, PIPE, RACK_Z, SLOTS, POLL, ARCHIVE_X: ARCHIVE.x + 10, DIAL, DIAL_R, DIAL_Z, NEAR })};
const TPL = ${JSON.stringify({ R: ballSvg("R", false), C: ballSvg("C", false), RL: ballSvg("R", true), CL: ballSvg("C", true) })};
${LIVE_SOURCE()}
`;

function LIVE_SOURCE() {
  return String.raw`
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const layer = svg.querySelector('[data-part="balls"]');
const needle = svg.querySelector('[data-part="needle"]');
const lamp = svg.querySelector('[data-part="lamp"]');
const counter = svg.querySelector("[data-counter]");
const pulses = { a: svg.querySelector('[data-pulse="a"]'), b: svg.querySelector('[data-pulse="b"]'), o: svg.querySelector('[data-pulse="o"]') };
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const surface = (r) => r >= M.R_RIM ? M.Z_RIM : M.Z_RIM - M.K_WELL * (1 / r - 1 / M.R_RIM);
const slopeAt = (r) => r >= M.R_RIM ? 0 : M.K_WELL / (r * r);
const omegaAt = (r) => Math.sqrt((M.GRAV * slopeAt(r)) / r);
const cupAngle = (i) => (i / M.CUPS) * TAU + Math.PI / M.CUPS;
const smooth = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const smoother = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (6 * u - 15) + 10);
// integral of smoothstep over [0, u], normalised so it reaches 1 at u = 1
const rampIn = (u) => { u = Math.min(1, Math.max(0, u)); return 2 * (u * u * u - u * u * u * u / 2); };
const rampOut = (u) => { u = Math.min(1, Math.max(0, u)); return 2 * (u - (u * u * u - u * u * u * u / 2)); };
const origin = P.origin;

// centre of a ball resting on the well at radius r
function seat(r, th, dip = 0) {
  const s = slopeAt(r), n = Math.sqrt(1 + s * s);
  const rc = r - (M.BALL * s) / n;
  return [rc * Math.cos(th), rc * Math.sin(th), surface(r) + M.BALL / n - dip];
}

let nextId = 1;
const balls = [];
function makeBall(src, state, extra) {
  const b = { id: nextId++, src, state, t: 0, scale: 1, ...extra };
  const g = document.createElementNS(NS, "g");
  g.setAttribute("data-ball", b.id);
  g.style.cursor = "pointer";
  b.el = g;
  b.clip = g;
  b.clip2 = document.createElementNS(NS, "g");
  b.move = document.createElementNS(NS, "g");
  b.body = document.createElementNS(NS, "g");
  b.dust = document.createElementNS(NS, "g");
  b.dust.setAttribute("class", "orb-dust");
  g.appendChild(b.clip2);
  b.clip2.appendChild(b.move);
  b.move.appendChild(b.dust);
  b.move.appendChild(b.body);
  b.lit = null;
  balls.push(b);
  return b;
}
const cupsUsed = () => new Set(balls.filter((b) => b.cup != null && ["waiting", "forming", "leaving"].includes(b.state)).map((b) => b.cup));
function freeCupAhead(th, least) {
  const used = cupsUsed();
  let best = null;
  for (let i = 0; i < M.CUPS; i++) {
    if (used.has(i)) continue;
    let d = ((cupAngle(i) - th) % TAU + TAU) % TAU;
    if (d < least) d += TAU;
    if (!best || d < best.sweep) best = { cup: i, sweep: d };
  }
  return best;
}

// ---------- state ----------
const sources = { R: 0, C: 0 };
let done = 0;
const rackQueue = [];
function placeInitial() {
  [[0, "R"], [3, "C"], [7, "C"]].forEach(([cup, src]) => makeBall(src, "waiting", { cup }));
  [["R", 0.4], ["R", 3.6], ["C", 1.6], ["C", 4.4]].forEach(([src, th]) => makeBall(src, "orbit", { r: M.RINGS[src], th }));
  for (let i = 0; i < 3; i++) { const b = makeBall(i % 2 ? "C" : "R", "rack", { x: M.SLOTS[i], vx: 0 }); rackQueue.push(b); b.slot = i; }
  done = 3;
}

// ---------- actions ----------
let syncAt = 0, syncPulse = -1, lampLevel = 0, lastAction = "";
function arrive(src) {
  const used = cupsUsed();
  const free = [...Array(M.CUPS).keys()].filter((i) => !used.has(i));
  if (!free.length) return false;
  const cup = free[(free.length * 0.37 + sources[src]++ * 5) % free.length | 0];
  const b = makeBall(src, "forming", { cup, scale: 0 });
  b.dustSeed = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU + Math.random() * 0.4, r: 10 + Math.random() * 9, z: (Math.random() - 0.5) * 8 }));
  lastAction = (src === "R" ? "Redmine" : "ClickUp") + " task arrives";
  return true;
}
function enter(b) {
  if (!b || b.state !== "waiting") return false;
  const ring = M.RINGS[b.src];
  const T = 4.6;
  b.state = "entering"; b.t = 0; b.T = T; b.th0 = cupAngle(b.cup); b.r0 = M.R_CUP; b.r1 = ring;
  b.sweep = (omegaAt(ring) * T) / 2;
  b.cup = null;
  lastAction = "enters ring " + (b.src === "R" ? "1" : "2");
  return true;
}
function deorbit(b) {
  if (!b || b.state !== "orbit") return false;
  const w = omegaAt(b.r);
  const target = freeCupAhead(b.th, 1.4);
  if (!target) return false;
  // leave tangentially at orbital speed and come to rest exactly in the cup
  b.state = "leaving"; b.t = 0; b.th0 = b.th; b.r0 = b.r; b.r1 = M.R_CUP; b.cup = target.cup;
  b.sweep = target.sweep;
  b.T = (2 * b.sweep) / w;
  lastAction = "de-orbits to the shelf";
  return true;
}
function complete(b) {
  if (!b || b.state !== "orbit") return false;
  b.state = "spiral"; b.t = 0;
  lastAction = "completes";
  return true;
}
const pick = (state, src) => balls.filter((b) => b.state === state && (!src || b.src === src));
const oldestWaiting = () => pick("waiting").sort((a, b) => a.id - b.id)[0];
function sync() {
  syncAt = clock;
  syncPulse = 0;
}

// ---------- per-frame physics ----------
function step(b, dt) {
  b.t += dt;
  if (b.state === "forming") {
    b.scale = smoother(b.t / 2.6);
    if (b.t >= 3.2) { b.state = "waiting"; b.scale = 1; }
  } else if (b.state === "orbit") {
    b.th += omegaAt(b.r) * dt;
  } else if (b.state === "entering" || b.state === "leaving") {
    const u = b.t / b.T;
    const e = smoother(u);
    b.r = b.r0 + (b.r1 - b.r0) * e;
    b.th = b.th0 + b.sweep * (b.state === "entering" ? rampIn(u) : rampOut(u));
    if (u >= 1) {
      if (b.state === "entering") { b.state = "orbit"; b.r = b.r1; }
      else { b.state = "waiting"; b.th = cupAngle(b.cup); }
    }
  } else if (b.state === "spiral") {
    // energy bleeds away: the radius shrinks steadily, the angular speed climbs as r^-1.5
    b.r = Math.max(M.R_THROAT, b.r - 5.2 * dt);
    b.th += omegaAt(b.r) * dt;
    if (b.r <= M.R_THROAT) { b.state = "drop"; b.t = 0; b.dropTh = b.th; }
  } else if (b.state === "drop") {
    b.th += omegaAt(M.R_THROAT) * dt * Math.max(0, 1 - b.t * 2);
    if (b.t > 0.7) { b.state = "pipe"; b.t = 0; }
  } else if (b.state === "pipe") {
    if (b.t > 1.6) { b.state = "rack"; b.x = M.PIPE.x1 - M.BALL - 2; b.vx = 70; enqueue(b); }
  } else if (b.state === "rack" || b.state === "archiving") {
    const target = b.state === "archiving" ? M.ARCHIVE_X + 14 : M.SLOTS[b.slot];
    // rolling with rolling friction, then a soft stop against the ball ahead
    const k = 9, c = 2 * Math.sqrt(k) * 0.9;
    b.vx += ((target - b.x) * k - b.vx * c) * dt;
    if (b.state === "archiving") b.vx = Math.max(b.vx, 22);
    b.x += b.vx * dt;
    if (b.state === "archiving" && b.x > M.ARCHIVE_X + 12) { b.state = "gone"; }
  }
}
function enqueue(b) {
  if (rackQueue.length >= M.SLOTS.length) {
    const old = rackQueue.shift();
    old.state = "archiving";
    rackQueue.forEach((q, i) => (q.slot = i));
  }
  b.slot = rackQueue.length;
  rackQueue.push(b);
  done++;
}

function centreOf(b) {
  switch (b.state) {
    case "forming": case "waiting": return seat(M.R_CUP, cupAngle(b.cup), M.CUP_DIP);
    case "orbit": case "spiral": return seat(b.r, b.th);
    case "entering": case "leaving": {
      const u = b.t / b.T;
      const dip = M.CUP_DIP * (1 - smooth((b.state === "entering" ? u : 1 - u) / 0.12));
      return seat(b.r, b.th, dip);
    }
    case "drop": {
      const [x, y, z] = seat(M.R_THROAT, b.th);
      const f = Math.min(1, b.t / 0.5);
      return [x * (1 - f), y * (1 - f), z - 2 * M.BALL * f * f - 30 * Math.max(0, b.t - 0.5)];
    }
    case "rack": case "archiving": return [b.x, 0, M.RACK_Z];
    default: return null;
  }
}
const depthOfPt = (p) => depthOf(p, P);

function render() {
  const order = [];
  for (const b of balls) {
    const c = centreOf(b);
    const show = c && b.state !== "gone" && b.state !== "pipe";
    b.el.style.display = show ? "" : "none";
    if (!show) continue;
    const [sx, sy] = iso(c, P);
    const dx = sx - origin[0], dy = sy - origin[1];
    const s = b.scale;
    b.move.setAttribute("transform", "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ")");
    b.body.setAttribute("transform", s === 1 ? "" : "translate(" + origin[0] + " " + origin[1] + ") scale(" + Math.max(0.001, s).toFixed(3) + ") translate(" + -origin[0] + " " + -origin[1] + ")");
    const lit = ["forming", "entering", "leaving", "spiral", "drop"].includes(b.state) || (b.state === "rack" && Math.abs(b.vx) > 2);
    if (b.lit !== lit) { b.lit = lit; b.body.innerHTML = TPL[b.src + (lit ? "L" : "")]; }
    // occlusion by the well's near lip, the throat and the pipe mouth
    const r = Math.hypot(c[0], c[1]);
    const inWell = ["orbit", "spiral", "drop", "entering", "leaving"].includes(b.state) && r < M.R_RIM - 0.5;
    const clipA = inWell ? "url(#orb-clip-well)" : b.state === "rack" && b.x < M.PIPE.x1 + M.BALL * 2 ? "url(#orb-clip-mouth)" : "";
    const clipB = b.state === "drop" ? "url(#orb-clip-throat)" : "";
    if (b.clipA !== clipA) { b.clipA = clipA; clipA ? b.clip.setAttribute("clip-path", clipA) : b.clip.removeAttribute("clip-path"); }
    if (b.clipB !== clipB) { b.clipB = clipB; clipB ? b.clip2.setAttribute("clip-path", clipB) : b.clip2.removeAttribute("clip-path"); }
    // accretion dust: grains fall in from a loose cloud as the ball grows
    if (b.state === "forming") {
      const u = Math.min(1, b.t / 2.6);
      const fade = smooth(b.t / 0.6) * (1 - smooth((b.t - 2.4) / 0.8));
      let h = "";
      for (const d of b.dustSeed) {
        const k = 1 - smoother(u);
        const a = d.a + u * 2.2;
        const p = iso([Math.cos(a) * (M.BALL * 0.6 + d.r * k), Math.sin(a) * (M.BALL * 0.6 + d.r * k), d.z * k], P);
        h += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r=".7"/>';
      }
      b.dust.innerHTML = h;
      b.dust.setAttribute("opacity", fade.toFixed(3));
    } else if (b.dust.firstChild) b.dust.innerHTML = "";
    order.push([depthOfPt(c), b]);
  }
  order.sort((a, b) => a[0] - b[0]);
  let prev = null;
  for (const [, b] of order) {
    const want = prev ? prev.el.nextSibling : layer.firstChild;
    if (want !== b.el) layer.insertBefore(b.el, want);
    prev = b;
  }
  for (const b of balls) if (b.state !== "gone" && !b.el.parentNode) layer.appendChild(b.el);
}

// ---------- the tour: one 40 s cycle, two syncs ----------
const TOUR = [
  [0, () => sync("R")], [2.2, () => arrive("R")],
  [6, () => enter(oldestWaiting())],
  [11, () => complete(pick("orbit", "R").sort((a, b) => a.id - b.id)[0])],
  [16, () => deorbit(pick("orbit", "C").sort((a, b) => a.id - b.id)[0])],
  [20, () => sync("C")], [22.2, () => arrive("C")],
  [26, () => enter(oldestWaiting())],
  [30, () => enter(oldestWaiting())],
  [34, () => complete(pick("orbit", "C").sort((a, b) => a.id - b.id)[0])],
];
const CYCLE = 40;
let clock = 0, tourClock = 0, touring = true, frame = 0, last = 0, visible = false, idleTimer = 0, nextSource = "R";

function syncTick(dt) {
  const since = clock - syncAt;
  if (since >= M.POLL) { syncAt = clock; syncPulse = 0; }
  if (syncPulse >= 0) {
    syncPulse += dt;
    const a = Math.min(1, syncPulse / 1.4), o = Math.min(1, Math.max(0, (syncPulse - 1.2) / 0.9));
    for (const [key, u] of [["a", a], ["b", a], ["o", o]]) {
      const el = pulses[key];
      const head = u * 100, len = 10;
      el.style.strokeDasharray = len + " 200";
      el.style.strokeDashoffset = String(len - head);
      el.style.opacity = String(Math.sin(Math.PI * Math.min(1, u * 1.02)) ** 0.5 * (u > 0 && u < 1 ? 1 : 0));
    }
    lampLevel = Math.max(lampLevel, syncPulse > 1.1 && syncPulse < 1.5 ? 1 : 0);
    if (syncPulse > 2.4) syncPulse = -1;
  }
  lampLevel *= Math.exp(-dt / 0.5);
  lamp.style.opacity = (0.15 + 0.85 * lampLevel).toFixed(3);
  needle.setAttribute("d", needleAt(((clock - syncAt) % M.POLL) / M.POLL));
}
function needleAt(share) {
  const a = share * TAU;
  const [x, y] = M.DIAL;
  return lineOnTop([x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4], [x + Math.sin(a) * (M.DIAL_R - 3), y - Math.cos(a) * (M.DIAL_R - 3)], M.DIAL_Z + 0.2, P);
}

function say() {
  const w = balls.filter((b) => ["waiting", "forming"].includes(b.state)).length;
  const r1 = balls.filter((b) => b.state === "orbit" && b.src === "R").length;
  const r2 = balls.filter((b) => b.state === "orbit" && b.src === "C").length;
  const next = Math.max(0, Math.ceil(M.POLL - (clock - syncAt)));
  const text = "shelf " + w + " · ring 1·2 " + r1 + "/" + r2 + " · done " + done + " · sync " + String(next).padStart(2, "0") + "s";
  if (readout.textContent !== text) readout.textContent = text;
  const c = String(done % 1000).padStart(3, "0");
  if (counter.textContent !== c) counter.textContent = c;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  advance(dt);
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
let speed = 1, paused = false;
const knobEl = svg.querySelector('[data-part="knob"]');
const leverEl = svg.querySelector('[data-part="lever"]');
const leverTip = svg.querySelector('[data-part="lever-tip"]');
let leverAt = 0;
function controlsTick(dt) {
  leverAt += ((paused ? 1 : 0) - leverAt) * (1 - Math.exp(-dt / 0.08));
  const a = LEVERS[0], b = LEVERS[1];
  const pick = leverAt > 0.5 ? b : a;
  if (leverEl.getAttribute("d") !== pick.d) { leverEl.setAttribute("d", pick.d); leverTip.setAttribute("cx", pick.tip[0].toFixed(1)); leverTip.setAttribute("cy", pick.tip[1].toFixed(1)); }
  const want = KNOBS[speed];
  if (knobEl.getAttribute("d") !== want) knobEl.setAttribute("d", want);
}
function advance(real) {
  controlsTick(real);
  const dt = paused ? 0 : real * speed;
  clock += dt;
  if (touring) {
    const before = tourClock % CYCLE;
    tourClock += dt;
    const after = tourClock % CYCLE;
    for (const [at, fn] of TOUR) if ((before < at && after >= at) || (after < before && (at >= before || at < after))) fn();
  }
  syncTick(dt);
  for (const b of balls) step(b, dt);
  for (let i = balls.length - 1; i >= 0; i--) if (balls[i].state === "gone") { balls[i].el.remove(); balls.splice(i, 1); }
  render();
  say();
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
function settleInstantly() { for (let i = 0; i < 600; i++) advance(1 / 30); }
function hold() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { touring = true; run(); }, 9000);
  if (still.matches) settleInstantly();
  run();
}

svg.addEventListener("click", (event) => {
  const g = event.target.closest("[data-ball]");
  if (!g) return;
  const b = balls.find((x) => String(x.id) === g.getAttribute("data-ball"));
  if (!b) return;
  if (b.state === "waiting") enter(b);
  else if (b.state === "orbit") (event.shiftKey || event.altKey ? deorbit : complete)(b);
  hold();
});
stage.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  let ok = false;
  if (key === " " || key === "p") { paused = !paused; ok = true; }
  else if (key === "-" || key === "=" || key === "+") { const i = SPEEDS.indexOf(speed) + (key === "-" ? -1 : 1); speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))]; ok = true; }
  else if (key === "n") { nextSource = nextSource === "R" ? "C" : "R"; sync(); ok = arrive(nextSource); }
  else if (key === "e") ok = enter(oldestWaiting());
  else if (key === "c") ok = complete(pick("orbit").sort((a, b) => a.id - b.id)[0]);
  else if (key === "d") ok = deorbit(pick("orbit").sort((a, b) => a.id - b.id)[0]);
  else return;
  event.preventDefault();
  if (!["p", " ", "-", "=", "+"].includes(key)) hold(); else run();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
placeInitial();
if (still.matches) { touring = false; }
advance(0);
window.__orbit = { balls, advance };
`;
}

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Orbit · task flow",
  hint: "Click a planet · N E C D · space · ±",
  readout: "shelf 3 · ring 1·2 2/2 · done 3 · sync 20s",
  keys: [
    { mark: "lit", label: "The task moving now" },
    { mark: "raised", label: "Plain ball: Redmine task, inner ring · banded ball: ClickUp task, outer ring" },
    { mark: "dashed", label: "Sync pulse: dishes to receiver to well, every 20 s" },
  ],
  caption:
    "Orbit as a bench instrument. Each sync brings new tasks in through the dishes, and each one forms as a ball in a cup on the waiting shelf: not started. Starting a task rolls it into the well, where it orbits a groove whose slope sets its speed (ring 1 every 8.0 s, ring 2 every 17.2 s, since the period grows as r^1.5). De-orbiting rolls it back out to a cup. Completing it lets it lose energy: it spirals faster and faster down the throat, runs through the pipe and rolls onto the completed rack, pushing the oldest done task into the archive.",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Orbit task flow orrery: press N for a new task, E to enter orbit, C to complete, D to de-orbit">${svg}</div>`,
});

const SPACE_CSS = `
.iso[data-theme="dark"]{
  --anatomy-page:#04060d;--anatomy-card:#070b17;--anatomy-text:#93a6c8;--anatomy-strong:#e3eeff;--anatomy-muted:#5b6c8f;
  --anatomy-paper:#070b17;--anatomy-face:#0e1630;--anatomy-top:#121c3a;
  --anatomy-shade-0:#080d1c;--anatomy-shade-1:#0a1124;--anatomy-shade-2:#0d152c;--anatomy-shade-3:#101a35;
  --anatomy-lit-top:#1d3566;--anatomy-lit-shade:#16284f;
  --anatomy-hi:#cfe3ff;--anatomy-mid:#5d77a8;--anatomy-lo:#34466f;--anatomy-faint:#1d2a4a;--anatomy-lit:#a2d3ff;
  --anatomy-halo:#000;--anatomy-halo-opacity:.95;--anatomy-dot:#cfe3ff;--anatomy-blue:#79bfff;
  --orb-core:#000;--orb-star:#cfe3ff;--orb-window:#02040a;--orb-digit:#a2d3ff;--orb-lamp:#79bfff;
}
.iso[data-theme="light"]{--orb-core:#0b1020;--orb-star:#5d77a8;--orb-window:#0b1020;--orb-digit:#a2d3ff;--orb-lamp:#3e63dd}
.iso[data-theme="light"] .orb-stars{opacity:.35}
.iso-plate{overflow:hidden}
.orb-stars circle{fill:var(--orb-star)}
.orb-twinkle{animation:orb-twinkle 6s ease-in-out infinite}
@keyframes orb-twinkle{0%,100%{opacity:.15}50%{opacity:.9}}
@media (prefers-reduced-motion:reduce){.orb-twinkle{animation:none}}
.orb-core{fill:var(--orb-core)}
.orb-bore{fill:var(--orb-core);stroke:var(--anatomy-mid);stroke-width:var(--anatomy-weight)}
.orb-window{fill:var(--orb-window)}
.orb-counter{fill:var(--orb-digit);font-family:var(--anatomy-mono);font-size:6.4px;letter-spacing:.12em}
.orb-lamp{fill:var(--orb-lamp);opacity:.15}
.orb-dust circle{fill:var(--anatomy-lit)}
.orb-knob{fill:var(--anatomy-hi)}
.orb-ball{--b0:#17305c;--b1:#24477f;--b2:#3d68a8;--b3:#6e9fdc;--be:#8fbcf0}
.orb-ball[data-lit]{--b0:#24467e;--b1:#3b6db4;--b2:#5d95dd;--b3:#a2d3ff;--be:#d8ecff}
.iso[data-theme="light"] .orb-ball{--b0:#5f86bf;--b1:#7fa3d6;--b2:#a6c3ea;--b3:#d7e6f8;--be:#2e4f86}
.iso[data-theme="light"] .orb-ball[data-lit]{--b0:#2d63c4;--b1:#4f86e0;--b2:#79bfff;--b3:#c9e6ff;--be:#0b2a66}
.orb-ball .iso-shade[data-shade="0"]{fill:var(--b0);stroke:var(--b0)}
.orb-ball .iso-shade[data-shade="1"]{fill:var(--b1);stroke:var(--b1)}
.orb-ball .iso-shade[data-shade="2"]{fill:var(--b2);stroke:var(--b2)}
.orb-ball .iso-shade[data-shade="3"]{fill:var(--b3);stroke:var(--b3)}
.orb-ball .iso-edge{stroke:var(--be)}
.orb-ball .iso-line{stroke:var(--b0)}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-mid);outline-offset:4px}
`;

const name = theme === "light" ? "orbit-flow-light.html" : "orbit-flow.html";
const page = k.pageHtml({ title: "Orbit task flow", theme, body, script: kitScript() + live, width: 720 }).replace("</style>", SPACE_CSS + "</style>");
writeFileSync(join(HERE, name), page);
console.log("wrote", name, (page.length / 1024).toFixed(0) + " KB");
