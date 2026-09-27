/**
 * Structured geometry for hiblob figures.
 *
 * The core never touches the DOM or canvas. Shapes are built as
 * `GeometryPath`s — lists of plain commands with exact double coordinates —
 * which serialize to a stable string form (for tests and equality) and emit
 * directly as SVG path data.
 */

export type Pt = { x: number; y: number };

export type GeometryCommand =
  | MoveTo
  | LineTo
  | CubicTo
  | QuadraticTo
  | ClosePath;

/** Jumps the pen to (x, y) without drawing. */
export interface MoveTo {
  readonly kind: 'move';
  readonly x: number;
  readonly y: number;
}

/** Draws a straight line to (x, y). */
export interface LineTo {
  readonly kind: 'line';
  readonly x: number;
  readonly y: number;
}

/** Draws a cubic Bézier to (x, y) with controls (c1x, c1y) and (c2x, c2y). */
export interface CubicTo {
  readonly kind: 'cubic';
  readonly c1x: number;
  readonly c1y: number;
  readonly c2x: number;
  readonly c2y: number;
  readonly x: number;
  readonly y: number;
}

/** Draws a quadratic Bézier to (x, y) with control (cx, cy). */
export interface QuadraticTo {
  readonly kind: 'quad';
  readonly cx: number;
  readonly cy: number;
  readonly x: number;
  readonly y: number;
}

/** Closes the current sub-path with a straight line back to its start. */
export interface ClosePath {
  readonly kind: 'close';
}

export const moveTo = (x: number, y: number): MoveTo => ({ kind: 'move', x, y });
export const lineTo = (x: number, y: number): LineTo => ({ kind: 'line', x, y });
export const cubicTo = (
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x: number,
  y: number,
): CubicTo => ({ kind: 'cubic', c1x, c1y, c2x, c2y, x, y });
export const quadraticTo = (
  cx: number,
  cy: number,
  x: number,
  y: number,
): QuadraticTo => ({ kind: 'quad', cx, cy, x, y });
export const closePath = (): ClosePath => ({ kind: 'close' });

/**
 * One drawn primitive: an ordered command list, plus how it paints.
 *
 * A path is either filled (the default) or stroked with `strokeWidth`. Two
 * paths are equal when their serialized form and paint mode are equal.
 */
export class GeometryPath {
  readonly commands: readonly GeometryCommand[];

  /** Whether this path is stroked rather than filled. */
  readonly stroke: boolean;

  /** The stroke width in view-box units when `stroke` is set. */
  readonly strokeWidth: number;

  #data?: string;

  constructor(
    commands: readonly GeometryCommand[],
    stroke = false,
    strokeWidth = 1,
  ) {
    this.commands = commands;
    this.stroke = stroke;
    this.strokeWidth = strokeWidth;
  }

  /** A rounded, deterministic serialization of this path (2 decimals). */
  toPathData(): string {
    let d = this.#data;
    if (d === undefined) {
      const b: string[] = [];
      for (const c of this.commands) {
        switch (c.kind) {
          case 'move':
            b.push(`M${fmt(c.x)} ${fmt(c.y)}`);
            break;
          case 'line':
            b.push(`L${fmt(c.x)} ${fmt(c.y)}`);
            break;
          case 'cubic':
            b.push(
              `C${fmt(c.c1x)} ${fmt(c.c1y)} ${fmt(c.c2x)} ${fmt(c.c2y)} ` +
                `${fmt(c.x)} ${fmt(c.y)}`,
            );
            break;
          case 'quad':
            b.push(`Q${fmt(c.cx)} ${fmt(c.cy)} ${fmt(c.x)} ${fmt(c.y)}`);
            break;
          case 'close':
            b.push('Z');
            break;
        }
      }
      d = b.join('');
      this.#data = d;
    }
    return d;
  }

  /** Equality by serialized form and paint mode. */
  equals(other: GeometryPath): boolean {
    return (
      other.stroke === this.stroke &&
      other.strokeWidth === this.strokeWidth &&
      other.toPathData() === this.toPathData()
    );
  }

  get bounds(): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x: number, y: number): void => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    for (const c of this.commands) {
      switch (c.kind) {
        case 'move':
        case 'line':
          add(c.x, c.y);
          break;
        case 'cubic':
          add(c.c1x, c.c1y);
          add(c.c2x, c.c2y);
          add(c.x, c.y);
          break;
        case 'quad':
          add(c.cx, c.cy);
          add(c.x, c.y);
          break;
        case 'close':
          break;
      }
    }
    return { minX, minY, maxX, maxY };
  }
}

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function normDir(dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fmt(v: number): string {
  return v.toFixed(2);
}

/**
 * One radial perturbation of the organic silhouette: the radius wiggles by
 * `amplitude` (as a fraction of the base radius) over `harmonic` cycles,
 * shifted by `phase` radians.
 */
export class RadialWave {
  readonly harmonic: number;
  readonly amplitude: number;
  readonly phase: number;
  constructor(harmonic: number, amplitude: number, phase: number) {
    this.harmonic = harmonic;
    this.amplitude = amplitude;
    this.phase = phase;
  }
}

const K = 0.5522847498307936; // circle → cubic handle constant

/** Builds a circle centered at (cx, cy) with radius r. */
export function circle(cx: number, cy: number, r: number): GeometryPath {
  return ellipse(cx, cy, r, r);
}

/** Builds an ellipse centered at (cx, cy). */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): GeometryPath {
  return new GeometryPath([
    moveTo(cx + rx, cy),
    cubicTo(cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry),
    cubicTo(cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy),
    cubicTo(cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry),
    cubicTo(cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy),
    closePath(),
  ]);
}

/**
 * Smooths a closed loop of points with Catmull-Rom → cubic Bézier conversion.
 */
export function smoothClosed(pts: readonly Pt[]): GeometryPath {
  if (pts.length < 3) throw new Error('a closed loop needs at least 3 points');
  const n = pts.length;
  const cmds: GeometryCommand[] = [moveTo(pts[0].x, pts[0].y)];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    cmds.push(
      cubicTo(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y,
      ),
    );
  }
  cmds.push(closePath());
  return new GeometryPath(cmds);
}

/**
 * Builds a superellipse (Lamé curve) — the boxy family. `n` = 2 is an
 * ellipse; larger exponents square the shoulders off. Sampled at `samples`
 * angles and smoothed.
 */
export function superellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  samples = 48,
): GeometryPath {
  const e = 2 / n;
  const pts: Pt[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push({
      x: cx + rx * signedPow(ct, e),
      y: cy + ry * signedPow(st, e),
    });
  }
  return smoothClosed(pts);
}

function signedPow(v: number, e: number): number {
  const s = v < 0 ? -1 : 1;
  return s * Math.pow(Math.abs(v), e);
}

/**
 * Builds the organic silhouette: a circle whose radius wobbles by `waves`.
 */
export function radialBlob(
  cx: number,
  cy: number,
  baseR: number,
  waves: readonly RadialWave[],
  samples = 32,
): GeometryPath {
  const pts: Pt[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    let r = baseR;
    for (const w of waves) {
      r += w.amplitude * baseR * Math.cos(w.harmonic * t + w.phase);
    }
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  return smoothClosed(pts);
}

/**
 * Builds a regular `sides`-gon with corners softened by `rounding`
 * (`0` = sharp; `0.5` approaches a circle).
 */
export function roundedPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rounding: number,
  rotation = 0,
): GeometryPath {
  if (sides < 3) throw new Error('a polygon needs at least 3 sides');
  const verts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (2 * Math.PI * i) / sides;
    verts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  const starts: Pt[] = [];
  const ends: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const prev = verts[(i - 1 + sides) % sides];
    const cur = verts[i];
    const next = verts[(i + 1) % sides];
    const d1 = normDir(cur.x - prev.x, cur.y - prev.y);
    const d2 = normDir(next.x - cur.x, next.y - cur.y);
    const cut =
      Math.min(dist(prev, cur), dist(cur, next)) * clampRound(rounding);
    starts.push({ x: cur.x - d1.x * cut, y: cur.y - d1.y * cut });
    ends.push({ x: cur.x + d2.x * cut, y: cur.y + d2.y * cut });
  }
  const cmds: GeometryCommand[] = [moveTo(starts[0].x, starts[0].y)];
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    cmds.push(quadraticTo(verts[i].x, verts[i].y, ends[i].x, ends[i].y));
    cmds.push(lineTo(starts[next].x, starts[next].y));
  }
  cmds.push(closePath());
  return new GeometryPath(cmds);
}

function clampRound(v: number): number {
  return v < 0 ? 0 : v > 0.5 ? 0.5 : v;
}

/**
 * Builds a rounded rectangle — a capsule when `r` is half the short side.
 */
export function roundedRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
): GeometryPath {
  r = Math.min(r, Math.min(w, h) / 2);
  const k = r * K;
  const l = cx - w / 2;
  const t = cy - h / 2;
  const rt = cx + w / 2;
  const b = cy + h / 2;
  return new GeometryPath([
    moveTo(l + r, t),
    lineTo(rt - r, t),
    cubicTo(rt - r + k, t, rt, t + r - k, rt, t + r),
    lineTo(rt, b - r),
    cubicTo(rt, b - r + k, rt - r + k, b, rt - r, b),
    lineTo(l + r, b),
    cubicTo(l + r - k, b, l, b - r + k, l, b - r),
    lineTo(l, t + r),
    cubicTo(l, t + r - k, l + r - k, t, l + r, t),
    closePath(),
  ]);
}

/**
 * Builds a soft `points`-point star — the sun silhouette. Catmull-Rom
 * smoothing rounds the spikes; the result reads as a chubby sun.
 */
export function star(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  rotation = 0,
): GeometryPath {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rotation + (Math.PI * i) / points;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return smoothClosed(pts);
}

/**
 * Builds the droplet silhouette: a round bulb with a soft point rising
 * `dropLen` above it.
 */
export function droplet(
  cx: number,
  cy: number,
  bulbR: number,
  dropLen: number,
): GeometryPath {
  const tip = { x: cx, y: cy - bulbR - dropLen };
  const bend = bulbR * 0.62;
  return new GeometryPath([
    moveTo(tip.x, tip.y),
    cubicTo(
      tip.x - bend,
      tip.y + bend,
      cx - bulbR,
      cy - bulbR * 0.95,
      cx - bulbR,
      cy,
    ),
    cubicTo(cx - bulbR, cy + bulbR * K, cx - bulbR * K, cy + bulbR, cx, cy + bulbR),
    cubicTo(cx + bulbR * K, cy + bulbR, cx + bulbR, cy + bulbR * K, cx + bulbR, cy),
    cubicTo(
      cx + bulbR,
      cy - bulbR * 0.95,
      tip.x + bend,
      tip.y + bend,
      tip.x,
      tip.y,
    ),
    closePath(),
  ]);
}

/**
 * Builds a half disc — a filled semicircle with its flat side horizontal.
 * `down` bulges the arc downward (a smile-like shape); otherwise upward.
 */
export function halfDisc(x: number, y: number, r: number, down = true): GeometryPath {
  const dir = down ? 1 : -1;
  return new GeometryPath([
    moveTo(x - r, y),
    cubicTo(x - r, y + dir * r * K, x - r * K, y + dir * r, x, y + dir * r),
    cubicTo(x + r * K, y + dir * r, x + r, y + dir * r * K, x + r, y),
    closePath(),
  ]);
}

/**
 * Builds an open polyline stroked with `width` and round caps — the closed
 * and squinting eye shapes.
 */
export function polyline(pts: readonly Pt[], width = 1.7): GeometryPath {
  if (pts.length < 2) throw new Error('a polyline needs at least 2 points');
  const cmds: GeometryCommand[] = [moveTo(pts[0].x, pts[0].y)];
  for (let i = 1; i < pts.length; i++) {
    cmds.push(lineTo(pts[i].x, pts[i].y));
  }
  return new GeometryPath(cmds, true, width);
}

/** Builds a filled quadrilateral — the slanted mad-eye shape. */
export function quad(a: Pt, b: Pt, c: Pt, d: Pt): GeometryPath {
  return new GeometryPath([
    moveTo(a.x, a.y),
    lineTo(b.x, b.y),
    lineTo(c.x, c.y),
    lineTo(d.x, d.y),
    closePath(),
  ]);
}

/** Rotates (x, y) around (cx, cy) by `angle` radians. */
export function rotatePt(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number,
): Pt {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
