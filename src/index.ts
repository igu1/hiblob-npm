/**
 * `hiblob` — the pure, dependency-free core of hiblob: deterministic
 * geometric blob avatars from any string.
 *
 * A hiblob always stands for somebody — a user, a bot, a team, a repo — so
 * the value it is generated from is that somebody's `name`: a username, a
 * display name, an email, a handle, an id. Any string works, and the same
 * string always renders the same hiblob.
 *
 * ```ts
 * import { resolve, svgFromName, motionAt, motionSeedsFor } from 'hiblob';
 *
 * const figure = resolve('ada@example.com');
 * const svg = svgFromName('ada@example.com', { background: 'squircle' });
 * const frame = motionAt(motionSeedsFor('ada@example.com'), 1200, 1);
 * ```
 */

// hash / normalize / traits
export { fnv1a32, stream } from './hash.js';
export { normalizeSeed } from './normalize.js';
export {
  bandFor,
  clamp,
  shapeBands,
  toneBands,
  traitKeys,
  traitsFor,
  wrapDegrees,
} from './traits.js';
export type { TraitKey } from './traits.js';

// color
export {
  argbToHex,
  argbToOklch,
  blendArgb,
  darkenColor,
  hexToArgb,
  hslToArgb,
  oklchBlend,
  oklchToArgb,
  relativeLuminance,
} from './color.js';
export type { Argb, Oklch } from './color.js';

// geometry
export {
  GeometryPath,
  RadialWave,
  circle,
  droplet,
  ellipse,
  halfDisc,
  polyline,
  quad,
  radialBlob,
  rotatePt,
  roundedPolygon,
  roundedRect,
  smoothClosed,
  star,
  superellipse,
} from './geometry.js';
export type {
  Bounds,
  ClosePath,
  CubicTo,
  GeometryCommand,
  LineTo,
  MoveTo,
  Pt,
  QuadraticTo,
} from './geometry.js';

// expressions
export {
  Expression,
  expressions,
  frown,
  grin,
  happy,
  idle,
  love,
  mad,
  sad,
  scared,
  shy,
  sick,
  sleepy,
  smug,
  surprised,
  thinking,
  tintFor,
  unsure,
  wink,
} from './expressions.js';

// options
export {
  AccessoryKeys,
  Backdrop,
  PaletteKeys,
  optionsEqual,
} from './options.js';
export type {
  AccessoryKey,
  AccessoryPins,
  HiblobOptions,
  PaletteKey,
  PalettePins,
  TraitPins,
} from './options.js';

// layout
export {
  Accessory,
  DrawStep,
  EyeGroup,
  ResolvedHiblob,
  drawStepsOf,
  layoutFor,
  partsFor,
  resolve,
  viewBoxSize,
} from './layout.js';

// motion
export {
  MotionFrame,
  MotionSeeds,
  motionAt,
  motionFrameZero,
  motionSeedsFor,
} from './motion.js';

// svg
export { svgFromName, svgOf } from './svg.js';
