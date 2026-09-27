/**
 * The layout: traits → geometry, eyes, and palette for one hiblob.
 *
 * This file owns the frozen seed-to-look contract. The silhouette band
 * table, every numeric range read from a trait, the tone set, and the eye
 * placement rules move together — changing any of them changes which figure
 * a name resolves to.
 */

import {
  darkenColor,
  hslToArgb,
  oklchBlend,
  relativeLuminance,
  hexToArgb,
} from './color.js';
import type { Argb } from './color.js';
import {
  circle,
  cubicTo,
  closePath,
  droplet,
  ellipse,
  GeometryPath,
  halfDisc,
  lineTo,
  moveTo,
  polyline,
  quad,
  RadialWave,
  quadraticTo,
  radialBlob,
  rotatePt,
  roundedPolygon,
  roundedRect,
  star,
  superellipse,
} from './geometry.js';
import type { Pt } from './geometry.js';
import { Expression, idle, tintFor } from './expressions.js';
import { AccessoryKeys, Backdrop, PaletteKeys } from './options.js';
import type { AccessoryKey, HiblobOptions } from './options.js';
import { normalizeSeed } from './normalize.js';
import { bandFor, clamp, shapeBands, toneBands, traitsFor } from './traits.js';
import type { TraitKey } from './traits.js';
import { stream } from './hash.js';

/** The view box is square; every coordinate lives inside it. */
export const viewBoxSize = 100;

const PI2 = Math.PI * 2;

/** One eye: the marks that draw it (filled or stroked), and its center, used
 * to scale the eye around itself when it blinks. */
export class EyeGroup {
  readonly marks: readonly GeometryPath[];

  /** Whether every mark in `marks` is a stroked line. Closed-line eyes are
   * already "shut", so motion skips blinking them. */
  readonly strokeOnly: boolean;
  readonly cx: number;
  readonly cy: number;

  constructor(
    marks: readonly GeometryPath[],
    strokeOnly: boolean,
    cx: number,
    cy: number,
  ) {
    this.marks = marks;
    this.strokeOnly = strokeOnly;
    this.cx = cx;
    this.cy = cy;
  }
}

/** One accessory mark and the color it is painted with. */
export class Accessory {
  readonly path: GeometryPath;

  /** Optional clipping outline for fitted cap details. */
  readonly clip: GeometryPath | null;

  /** ARGB color. */
  readonly color: Argb;

  /** Whether the accessory is painted below the eyes (for example blush
   * discs) or above them (for example glasses frames). */
  readonly underEyes: boolean;

  constructor(
    path: GeometryPath,
    color: Argb,
    underEyes = false,
    clip: GeometryPath | null = null,
  ) {
    this.path = path;
    this.color = color;
    this.underEyes = underEyes;
    this.clip = clip;
  }
}

/** A fully resolved, ready-to-draw hiblob. */
export class ResolvedHiblob {
  readonly name: string;
  readonly seed: string;
  readonly options: HiblobOptions;
  readonly traits: Record<TraitKey, number>;

  /** Which silhouette the shape trait picked. */
  readonly shape: string;

  /** The resolved hue in degrees — pinned when `HiblobOptions.hue` is set. */
  readonly hue: number;

  /** Which tone band the tone trait picked. */
  readonly toneBand: string;

  /** The backdrop plate, or `null` for `background: 'none'`. */
  readonly backdrop: GeometryPath | null;
  readonly backdropColor: Argb;

  /** The body: the main silhouette first, then any extra volumes (nubs,
   * puffs), all painted `headColor`. */
  readonly body: readonly GeometryPath[];
  readonly headColor: Argb;

  /** Two eye groups — left, then right. */
  readonly eyes: readonly EyeGroup[];
  readonly eyeColor: Argb;

  /** The mouth path, or `null` when `HiblobOptions.mouth` is off. */
  readonly mouth: GeometryPath | null;

  /** Deterministic accessories, in paint order. */
  readonly accessories: readonly Accessory[];

  constructor(
    name: string,
    seed: string,
    options: HiblobOptions,
    traits: Record<TraitKey, number>,
    shape: string,
    hue: number,
    toneBand: string,
    backdrop: GeometryPath | null,
    backdropColor: Argb,
    body: readonly GeometryPath[],
    headColor: Argb,
    eyes: readonly EyeGroup[],
    eyeColor: Argb,
    mouth: GeometryPath | null = null,
    accessories: readonly Accessory[] = [],
  ) {
    this.name = name;
    this.seed = seed;
    this.options = options;
    this.traits = traits;
    this.shape = shape;
    this.hue = hue;
    this.toneBand = toneBand;
    this.backdrop = backdrop;
    this.backdropColor = backdropColor;
    this.body = body;
    this.headColor = headColor;
    this.eyes = eyes;
    this.eyeColor = eyeColor;
    this.mouth = mouth;
    this.accessories = accessories;
  }
}

/** One drawing step: a path and the ARGB color it is painted with. */
export class DrawStep {
  readonly path: GeometryPath;

  /** Optional clipping outline applied before drawing this step. */
  readonly clip: GeometryPath | null;

  /** ARGB color. For stroked paths this is the stroke color. */
  readonly color: Argb;

  constructor(path: GeometryPath, color: Argb, clip: GeometryPath | null = null) {
    this.path = path;
    this.color = color;
    this.clip = clip;
  }
}

/** The completed draw list for `name`: every path in paint order (backdrop,
 * body, mouth, accessories, eyes), each with its color. */
export function layoutFor(
  name: string,
  options?: HiblobOptions,
): DrawStep[] {
  const resolved = resolve(name, options);
  return drawStepsOf(resolved);
}

/** The body silhouette and any extra volumes (`ResolvedHiblob.body`) for
 * `name`, without palette information. */
export function partsFor(
  name: string,
  options?: HiblobOptions,
): GeometryPath[] {
  return resolve(name, options).body.slice() as GeometryPath[];
}

/** Flattens `resolved` into a paint-order draw list — what `layoutFor`
 * returns for a name, here applied to an already resolved figure. */
export function drawStepsOf(resolved: ResolvedHiblob): DrawStep[] {
  const steps: DrawStep[] = [];
  const backdrop = resolved.backdrop;
  if (backdrop != null) {
    steps.push(new DrawStep(backdrop, resolved.backdropColor));
  }
  for (const part of resolved.body) {
    steps.push(new DrawStep(part, resolved.headColor));
  }
  const mouth = resolved.mouth;
  if (mouth != null) {
    steps.push(new DrawStep(mouth, resolved.eyeColor));
  }
  for (const accessory of resolved.accessories) {
    if (accessory.underEyes) {
      steps.push(new DrawStep(accessory.path, accessory.color, accessory.clip));
    }
  }
  for (const eye of resolved.eyes) {
    for (const mark of eye.marks) {
      steps.push(new DrawStep(mark, resolved.eyeColor));
    }
  }
  for (const accessory of resolved.accessories) {
    if (!accessory.underEyes) {
      steps.push(new DrawStep(accessory.path, accessory.color, accessory.clip));
    }
  }
  return steps;
}

/** Resolves `name` with `options` into drawable geometry and palette. */
export function resolve(
  name: string,
  options?: HiblobOptions,
): ResolvedHiblob {
  const o = options ?? {};
  const traits = traitsFor(name, o);
  const seed = o.normalize === false ? name : normalizeSeed(name);
  const shape = bandFor(traits.shape, shapeBands);
  const toneBand = bandFor(traits.tone, toneBands);
  const hue = traits.hue * 360;

  const [backdrop, backdropColor] = backdropFor(o, hue, toneBand);
  const body = bodyFor(shape, traits);
  const [eyes, eyeColor, headColor] = faceFor(shape, traits, o, hue, toneBand);
  const mouth = (o.mouth ?? true)
    ? mouthFor(shape, traits, o.expression ?? idle, eyes)
    : null;
  const accessories = accessoriesFor(
    shape,
    name,
    o,
    traits,
    eyes,
    headColor,
    eyeColor,
  );

  return new ResolvedHiblob(
    name,
    seed,
    o,
    traits,
    shape,
    hue,
    toneBand,
    backdrop,
    backdropColor,
    body,
    headColor,
    eyes,
    eyeColor,
    mouth,
    accessories,
  );
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

function toneBase(toneBand: string): { s: number; l: number } {
  switch (toneBand) {
    case 'pale':
      return { s: 0.42, l: 0.88 };
    case 'soft':
      return { s: 0.55, l: 0.78 };
    case 'mid':
      return { s: 0.6, l: 0.66 };
    case 'deep':
      return { s: 0.55, l: 0.5 };
    default: // ink
      return { s: 0.3, l: 0.24 };
  }
}

function backdropFor(
  options: HiblobOptions,
  hue: number,
  toneBand: string,
): [GeometryPath | null, Argb] {
  const kind = options.background ?? 'none';
  if (kind === Backdrop.none) return [null, 0];
  const pin = options.palette?.[PaletteKeys.bg];
  const color: Argb = pin != null
    ? hexToArgb(pin)
    : hslToArgb(hue, 0.55, toneBand === 'pale' ? 0.95 : 0.93);
  const path =
    kind === Backdrop.squircle
      ? superellipse(50, 50, 48, 48, 4)
      : kind === Backdrop.circle
        ? circle(50, 50, 48)
        : kind === Backdrop.square
          ? roundedRect(50, 50, 96, 96, 6)
          : null;
  return [path, color];
}

// ---------------------------------------------------------------------------
// Body silhouettes
// ---------------------------------------------------------------------------

function bodyR(t: Record<TraitKey, number>): number {
  return 26 + t['body.r'] * 8;
}

function bodyFor(
  shape: string,
  t: Record<TraitKey, number>,
): GeometryPath[] {
  const cx = 50;
  const cy = 52;
  const r = bodyR(t);
  switch (shape) {
    case 'round':
      return [circle(cx, cy, r)];
    case 'organic': {
      const a = t['detail.a'];
      const b = t['detail.b'];
      const c = t['detail.c'];
      const p = t['detail.phase'] * PI2;
      const waves = [
        new RadialWave(3, 0.02 + 0.05 * a, p),
        new RadialWave(5, 0.012 + 0.045 * b, p * 2.7 + 1.3),
        new RadialWave(7, 0.008 + 0.028 * c, p * 4.1 + 2.9),
      ];
      return [radialBlob(cx, cy, r * 1.02, waves)];
    }
    case 'boxy':
      return [superellipse(cx, cy, r * 1.06, r * 1.06, 3.4)];
    case 'nub': {
      const angle = -Math.PI / 2 + (t['nub.angle'] - 0.5) * 2.4;
      const d = r * 0.82;
      const nubR = r * 0.34;
      return [
        circle(cx, cy, r * 0.94),
        circle(cx + d * Math.cos(angle), cy + d * Math.sin(angle), nubR),
      ];
    }
    case 'capsule': {
      const vertical = t['body.aspect'] < 0.5;
      const w = vertical ? r * 1.6 : r * 2.24;
      const h = vertical ? r * 2.24 : r * 1.6;
      return [roundedRect(cx, cy, w, h, Math.min(w, h) / 2)];
    }
    case 'hexagon':
      return [roundedPolygon(cx, cy, r * 1.06, 6, 0.18, Math.PI / 6)];
    case 'triangle':
      return [roundedPolygon(cx, cy, r * 1.18, 3, 0.2, -Math.PI / 2)];
    case 'droplet': {
      const bulbR = r * 0.86;
      return [droplet(cx, cy + r * 0.16, bulbR, bulbR * 0.72)];
    }
    case 'cloud':
      return [
        circle(cx, cy + r * 0.18, r * 0.82),
        circle(cx - r * 0.62, cy + r * 0.05, r * 0.42),
        circle(cx + r * 0.62, cy + r * 0.08, r * 0.4),
        circle(cx, cy - r * 0.32, r * 0.48),
      ];
    case 'sun':
      return [star(cx, cy, r * 1.16, r * 0.74, 8, Math.PI / 8)];
    case 'gem':
      return [roundedPolygon(cx, cy, r * 1.1, 5, 0.12, -Math.PI / 2)];
    case 'pillow':
      return [superellipse(cx, cy, r * 1.1, r * 0.92, 2.2)];
    default:
      throw new Error(`unknown shape ${shape}`);
  }
}

/** Conservative horizontal half-extent of the body at the eye line, used to
 * keep eyes inside the silhouette. */
function halfWidthAtFace(
  shape: string,
  t: Record<TraitKey, number>,
): number {
  const r = bodyR(t);
  switch (shape) {
    case 'round':
      return r;
    case 'organic':
      return r * 1.02 * 1.1; // widest radial wobble
    case 'boxy':
      return r * 1.06;
    case 'nub':
      return r * 0.94;
    case 'capsule':
      return t['body.aspect'] < 0.5 ? r * 0.8 : r * 1.12;
    case 'hexagon':
      return r * 0.98;
    case 'triangle':
      return r * 0.9;
    case 'droplet':
      return r * 0.86 * 0.95;
    case 'cloud':
      return r * 0.82;
    case 'sun':
      return r * 0.74;
    case 'gem':
      return r * 0.95;
    case 'pillow':
      return r * 1.1;
    default:
      throw new Error(`unknown shape ${shape}`);
  }
}

function faceDy(shape: string, t: Record<TraitKey, number>): number {
  const r = bodyR(t);
  switch (shape) {
    case 'round':
    case 'organic':
      return 0;
    case 'boxy':
      return -1.5;
    case 'nub':
      return 0.5;
    case 'capsule':
      return 0;
    case 'hexagon':
      return -1;
    case 'triangle':
      return 2.5;
    case 'droplet':
      return r * 0.16 + 1.5; // inside the bulb
    case 'cloud':
      return 0.5;
    case 'sun':
      return 0;
    case 'gem':
      return 1;
    case 'pillow':
      return -1;
    default:
      throw new Error(`unknown shape ${shape}`);
  }
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

function faceFor(
  shape: string,
  t: Record<TraitKey, number>,
  options: HiblobOptions,
  hue: number,
  toneBand: string,
): [EyeGroup[], Argb, Argb] {
  const cx = 50;
  const cy = 52;
  const r = bodyR(t);

  // Palette first: eyes need the head color for the contrast floor.
  const [headColor, eyeColor] = paletteFor(t, options, hue, toneBand);

  const expression = options.expression ?? idle;
  const rx = 3.1 - 1 * t['eye.ratio'];
  const ry = Math.min(rx * (1 + 2.4 * t['eye.ratio']), 9.5);
  const fy = cy + t['face.offset'] * 2 + faceDy(shape, t);
  const eyeY = clamp(
    fy + t['eye.offset'] * 2.2 + expression.eyeOffsetDy,
    cy - r * 0.42,
    cy + r * 0.38,
  );
  let spread = 5.2 + 4.6 * t['eye.spacing'];
  spread = Math.max(
    spread,
    rx * 2.6, // eyes never fuse
  );
  // Keep the whole eye, plus a margin, inside the silhouette's half width.
  spread = Math.min(spread, (halfWidthAtFace(shape, t) - rx - 1.5) * 0.9);

  const buildEye = (left: boolean): EyeGroup => {
    const sign = left ? -1 : 1;
    const x = cx + sign * spread + expression.eyeOffsetDx;
    const y = eyeY;
    const marks = eyeMarks(expression, left, x, y, rx, ry);
    const strokeOnly = marks.stroke;
    return new EyeGroup(marks.paths, strokeOnly, x, y);
  };

  return [[buildEye(true), buildEye(false)], eyeColor, headColor];
}

function eyeMarks(
  expression: Expression,
  left: boolean,
  x: number,
  y: number,
  rx: number,
  ry: number,
): { paths: GeometryPath[]; stroke: boolean } {
  switch (expression.id) {
    case 'happy':
      return { paths: [halfDisc(x, y + ry * 0.15, rx * 1.15, true)], stroke: false };
    case 'sad':
      return { paths: [halfDisc(x, y + ry * 0.2, rx * 1.05, false)], stroke: false };
    case 'mad': {
      const hw = rx * 1.15;
      const hh = ry * 0.55;
      const angle = (left ? 1 : -1) * 0.24;
      const rot = (dx: number, dy: number): Pt =>
        rotatePt(x + dx, y + dy, x, y, angle);
      return {
        paths: [
          quad(rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)),
        ],
        stroke: false,
      };
    }
    case 'surprised':
      return { paths: [ellipse(x, y, rx * 1.2, rx * 1.3)], stroke: false };
    case 'wink':
      return left
        ? { paths: [ellipse(x, y, rx, ry)], stroke: false }
        : {
            paths: [
              polyline([
                { x: x - rx * 0.9, y: y },
                { x: x + rx * 0.9, y: y },
              ]),
            ],
            stroke: true,
          };
    case 'sleepy':
      return { paths: [halfDisc(x, y, rx * 1.1, true)], stroke: false };
    case 'smug':
      return left
        ? { paths: [ellipse(x, y, rx * 0.95, ry)], stroke: false }
        : {
            paths: [
              polyline([
                { x: x - rx * 0.8, y: y + 0.7 },
                { x: x + rx * 0.9, y: y - 1 },
              ]),
            ],
            stroke: true,
          };
    case 'unsure':
      return {
        paths: [
          left
            ? ellipse(x, y, rx, ry)
            : ellipse(x, y + 0.8, rx * 0.65, ry * 0.65),
        ],
        stroke: false,
      };
    case 'scared':
      return { paths: [ellipse(x, y, rx * 1.3, ry * 1.15)], stroke: false };
    case 'love': {
      const r = rx * 0.62;
      return {
        paths: [
          circle(x - rx * 0.55, y - ry * 0.18, r),
          circle(x + rx * 0.55, y - ry * 0.18, r),
          quad(
            { x, y: y + ry * 0.8 },
            { x: x - rx * 1.02, y: y - ry * 0.32 },
            { x: x + rx * 1.02, y: y - ry * 0.32 },
            { x, y: y + ry * 0.8 },
          ),
        ],
        stroke: false,
      };
    }
    case 'shy':
      return { paths: [halfDisc(x, y, rx * 0.95, true)], stroke: false };
    case 'sick': {
      const dx = rx * 0.85;
      const dy = (left ? 1 : -1) * 0.7;
      return {
        paths: [
          polyline([
            { x: x - dx, y: y + dy },
            { x: x + dx, y: y - dy * 0.7 },
          ]),
        ],
        stroke: true,
      };
    }
    case 'thinking': {
      // Seesaw loop: a slow horizontal sway, driven below.
      return left
        ? { paths: [ellipse(x, y, rx * 0.95, ry * 0.95)], stroke: false }
        : {
            paths: [
              polyline([
                { x: x - rx * 0.85, y: y },
                { x: x + rx * 0.85, y: y },
              ]),
            ],
            stroke: true,
          };
    }
    case 'grin':
      return { paths: [ellipse(x, y, rx * 1.05, ry)], stroke: false };
    case 'frown':
      return { paths: [ellipse(x, y, rx, ry * 0.9)], stroke: false };
    default: // idle
      return { paths: [ellipse(x, y, rx, ry)], stroke: false };
  }
}

/** The mouth for `expression`, centered under the eye line. `null` when the
 * expression draws no mouth (all currently do when enabled). */
function mouthFor(
  shape: string,
  t: Record<TraitKey, number>,
  expression: Expression,
  eyes: readonly EyeGroup[],
): GeometryPath | null {
  const cx = 50;
  const mouthTrait = t.mouth;
  const eyeCy = (eyes[0].cy + eyes[1].cy) / 2;
  const y = clamp(
    Math.min(eyeCy + 4.6 + 1.8 * mouthTrait, 50 + bodyR(t) * 0.55),
    0,
    100,
  );
  const x = cx + expression.eyeOffsetDx * 0.25;
  // Width grows with the mouth trait but stays well inside the silhouette.
  const half = Math.min(
    2.5 + 3.6 * mouthTrait,
    halfWidthAtFace(shape, t) * 0.72,
  );
  const depth = 2.2 + 3 * mouthTrait;

  switch (expression.id) {
    case 'happy':
      return smile(x, y, half, depth * 0.9);
    case 'grin':
      return smile(x, y, half * 1.15, depth * 1.25);
    case 'sad':
      return smile(x, y, half * 0.9, -depth * 0.7);
    case 'frown':
      return smile(x, y, half, -depth);
    case 'surprised':
      return ellipse(x, y + 0.5, half * 0.55, half * 0.62);
    case 'scared':
      return ellipse(x, y + 0.5, half * 0.62, half * 0.75);
    case 'sleepy':
      return ellipse(x, y + 0.6, half * 0.45, half * 0.5);
    case 'love':
      return smile(x, y, half * 1.05, depth * 0.8);
    case 'shy':
      return polyline(
        [
          { x: x - half * 0.6, y: y + 0.9 },
          { x: x + half * 0.6, y: y - 0.2 },
        ],
        1.5,
      );
    case 'unsure':
      return polyline(
        [
          { x: x - half * 0.62, y: y + 0.5 },
          { x: x + half * 0.62, y: y + 0.9 },
        ],
        1.6,
      );
    case 'sick':
      return polyline(
        [
          { x: x - half, y },
          { x: x - half * 0.5, y: y - 1.2 },
          { x, y: y + 0.6 },
          { x: x + half * 0.5, y: y - 1.2 },
          { x: x + half, y },
        ],
        1.5,
      );
    case 'smug':
      return polyline(
        [
          { x: x - half * 0.7, y: y - 0.5 },
          { x: x + half * 0.75, y: y + 1.2 },
        ],
        1.6,
      );
    case 'mad':
      return polyline(
        [
          { x: x - half * 0.7, y: y + 1.1 },
          { x: x + half * 0.7, y: y - 0.9 },
        ],
        1.6,
      );
    case 'thinking':
      return polyline(
        [
          {
            x: x - half * 0.55 + expression.eyeOffsetDx * 0.2,
            y: y - 0.6,
          },
          {
            x: x + half * 0.55 + expression.eyeOffsetDx * 0.2,
            y: y - 1,
          },
        ],
        1.5,
      );
    default: // idle — a gentle, small smile
      return smile(x, y, half * 0.85, depth * 0.5);
  }
}

/** A filled lens-shaped mouth that opens downward for positive `depth` and
 * upward (a frown) for negative depth. */
function smile(x: number, y: number, half: number, depth: number): GeometryPath {
  return new GeometryPath([
    moveTo(x - half, y),
    cubicTo(
      x - half * 0.35,
      y + depth,
      x + half * 0.35,
      y + depth,
      x + half,
      y,
    ),
    closePath(),
  ]);
}

/** The accessory layout: pin/read presence per key, then build marks. */
function accessoriesFor(
  shape: string,
  name: string,
  options: HiblobOptions,
  t: Record<TraitKey, number>,
  eyes: readonly EyeGroup[],
  headColor: Argb,
  eyeColor: Argb,
): Accessory[] {
  const seed = options.normalize === false ? name : normalizeSeed(name);
  const present: Record<string, boolean> = {};
  for (const key of AccessoryKeys.all) {
    present[key] =
      pinOrHash(options, key, stream(seed, `accessory.${key}`));
  }
  const r = bodyR(t);
  const cx = 50;
  const cy = 52;
  const accent = eyeColor;
  const fringe = darkenColor(headColor);
  const blush = oklchBlend(headColor, 0xfff4a9be, 0.65);
  const result: Accessory[] = [];

  if (present.glasses && eyes.length === 2) {
    const lensWidth = Math.min(10.8, eyes[1].cx - eyes[0].cx - 2.4);
    const rr = lensWidth / 2;
    const ey = (eyes[0].cy + eyes[1].cy) / 2;
    const lensHeight = Math.max(
      11,
      2 * (3.1 - t['eye.ratio']) * (1 + 2.4 * t['eye.ratio']) + 3,
    );
    // Round, slightly taller-than-wide lenses with a full-radius top.
    for (const eye of eyes) {
      const lens = roundedRect(eye.cx, ey, lensWidth, lensHeight, lensHeight / 2 + 0.6);
      result.push(
        new Accessory(new GeometryPath(lens.commands, true, 1.8), accent),
      );
    }
    // Curved bridge.
    result.push(
      new Accessory(
        new GeometryPath(
          [
            moveTo(eyes[0].cx + rr, ey - 1.4),
            quadraticTo(
              (eyes[0].cx + eyes[1].cx) / 2,
              ey - 4.4,
              eyes[1].cx - rr,
              ey - 1.4,
            ),
          ],
          true,
          1.8,
        ),
        accent,
      ),
    );
    // Temple arms run from the lens edge to the silhouette, clipped to the
    // body so they always finish on the outline whatever the shape.
    const bodies = bodyFor(shape, t);
    for (const side of [-1, 1]) {
      const eye = side < 0 ? eyes[0] : eyes[1];
      const armX = eye.cx + side * (rr + 2);
      result.push(
        new Accessory(
          new GeometryPath(
            [
              moveTo(eye.cx + side * (rr - 0.4), ey - 1),
              quadraticTo(armX, ey - 2.6, eye.cx + side * (rr + 5), ey - 2.6),
            ],
            true,
            1.5,
          ),
          accent,
          false,
          bodies[0],
        ),
      );
    }
  }

  const fringeOn = present.fringe;
  if (fringeOn) {
    // Cover the upper portion of every body volume, including nubs and
    // cloud puffs. A generic circular dome cannot fit these silhouettes.
    const edgeY = cy - r * 0.38;
    const crownClip = roundedRect(50, edgeY / 2, 100, edgeY, 0);
    const bandClip = roundedRect(50, edgeY - 1.8, 100, 3.6, 0);
    const bodies = bodyFor(shape, t);
    for (const part of bodies) {
      result.push(new Accessory(part, fringe, false, crownClip));
    }
    for (const part of bodies) {
      result.push(
        new Accessory(part, oklchBlend(fringe, accent, 0.3), false, bandClip),
      );
    }
    // Subtle panel stitching stays inside the silhouette.
    for (const part of bodies) {
      for (const side of [-1, 1]) {
        result.push(
          new Accessory(
            new GeometryPath(
              [
                moveTo(cx + side * 3, cy - r * 0.78),
                quadraticTo(
                  cx + side * 6,
                  cy - r * 0.65,
                  cx + side * 7,
                  edgeY - 4.5,
                ),
              ],
              true,
              0.7,
            ),
            oklchBlend(fringe, headColor, 0.28),
            false,
            part,
          ),
        );
      }
    }
  }

  if (present.blush && eyes.length === 2) {
    const ey = eyes[0].cy;
    const eyeSpread = Math.abs(eyes[1].cx - eyes[0].cx);
    const dx = Math.max(eyeSpread, 8) / 2 + 2.2;
    for (const side of [-1, 1]) {
      result.push(
        new Accessory(
          circle(cx + side * dx, ey + 3.2, Math.max(eyeSpread * 0.3, 2.6)),
          blush,
          true,
        ),
      );
    }
  }

  if (present.antennae) {
    const tipY = cy - r - 4.5;
    for (const side of [-1, 1]) {
      const tipX = cx + side * 3.4 + (side > 0 ? 2 : -2);
      result.push(
        new Accessory(
          polyline(
            [
              { x: cx + side * 2.2, y: cy - r * 0.95 },
              { x: tipX, y: tipY },
            ],
            1.3,
          ),
          accent,
        ),
      );
      result.push(new Accessory(circle(tipX, tipY, 1.6), accent));
    }
  }
  return result;
}

function pinOrHash(
  options: HiblobOptions,
  key: string,
  hash: number,
): boolean {
  const pin = options.accessories?.[key as AccessoryKey];
  if (pin != null) return pin >= 0.5;
  const prob = AccessoryKeys.defaultProbabilities[key as AccessoryKey] ?? 0;
  return hash < prob;
}

function paletteFor(
  t: Record<TraitKey, number>,
  options: HiblobOptions,
  hue: number,
  toneBand: string,
): [Argb, Argb] {
  const toneBaseForBand = toneBase(toneBand);
  const s = toneBaseForBand.s;
  const l = toneBaseForBand.l;
  const sJ = clamp(s + (t['detail.b'] - 0.5) * 0.1, 0.05, 0.95);
  const lJ = clamp(l + (t['detail.c'] - 0.5) * 0.08, 0.05, 0.95);
  let head = hslToArgb(hue, sJ, lJ);
  let eye =
    relativeLuminance(head) > 0.3
      ? hslToArgb(hue, 0.45, 0.13)
      : hslToArgb(hue, 0.3, 0.96);

  if (options.contrast !== false) {
    const lh = relativeLuminance(head);
    let le = relativeLuminance(eye);
    if (Math.abs(lh - le) < 0.32) {
      eye = lh > 0.3 ? hslToArgb(hue, 0.45, 0.06) : hslToArgb(hue, 0.3, 0.99);
      le = relativeLuminance(eye);
      if (Math.abs(lh - le) < 0.32) {
        head =
          lh > 0.3
            ? hslToArgb(hue, sJ, Math.min(lJ + 0.1, 0.95))
            : hslToArgb(hue, sJ, Math.max(lJ - 0.1, 0.05));
      }
    }
  }

  const expression = options.expression ?? idle;
  const tint = tintFor(expression);
  if (tint !== 0x00000000 && expression.tintAlpha > 0) {
    head = oklchBlend(head, tint, expression.tintAlpha);
  }

  const headPin = options.palette?.[PaletteKeys.head];
  if (headPin != null) head = hexToArgb(headPin);
  const eyePin = options.palette?.[PaletteKeys.eye];
  if (eyePin != null) eye = hexToArgb(eyePin);
  return [head, eye];
}
