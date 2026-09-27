/**
 * Options for the hiblob generator: backdrop, color pins, trait pins, and
 * the facial expression.
 */

import { Expression, idle } from './expressions.js';

/** The backdrop plates a hiblob can sit on. Literally one of
 * `'none' | 'squircle' | 'circle' | 'square'`. */
export type Backdrop = 'none' | 'squircle' | 'circle' | 'square';

/** The backdrop kinds as a const object (matches the string literal values). */
export const Backdrop = {
  none: 'none',
  squircle: 'squircle',
  circle: 'circle',
  square: 'square',
} as const;

/** Keys `HiblobOptions.palette` accepts. Each value is a hex color string. */
export type PaletteKey = 'bg' | 'head' | 'eye';

export const PaletteKeys = { bg: 'bg', head: 'head', eye: 'eye' } as const;

/** Keys `HiblobOptions.accessories` accepts. */
export type AccessoryKey = 'glasses' | 'fringe' | 'blush' | 'antennae';

export const AccessoryKeys = {
  glasses: 'glasses',
  fringe: 'fringe',
  blush: 'blush',
  antennae: 'antennae',
  all: ['glasses', 'fringe', 'blush', 'antennae'],
  /** The per-name draw probability of each accessory when unpinned. */
  defaultProbabilities: { glasses: 0.3, fringe: 0.4, blush: 0.3, antennae: 0.12 },
} as const;

/** A subset of palette color pins; unlisted keys and unknown keys are
 * ignored. */
export type PalettePins = Partial<Record<PaletteKey, string>>;

/** Accessory pins: `>= 0.5` forces on, `< 0.5` forces off; omitted keys stay
 * name-driven. */
export type AccessoryPins = Partial<Record<AccessoryKey, number>>;

/** Trait pins keyed by trait name, clamped to `[0, 1]`; unknown keys are
 * ignored. */
export type TraitPins = Partial<Record<string, number>>;

/**
 * Immutable options for one hiblob. Everything is optional: with no options,
 * the name alone decides the whole figure. Pins (`hue`, `tone`, `traits`,
 * `palette`) override the name for exactly the axes they name — every other
 * axis stays name-driven.
 */
export interface HiblobOptions {
  /** The backdrop plate drawn behind the figure. Default `'none'`. */
  background?: Backdrop;

  /** Pins the color hue in degrees (any real number; it wraps). */
  hue?: number;

  /** Pins the authored lightness band position in `[0, 1)`. */
  tone?: number;

  /** Overrides selected colors by hex string — e.g. `'#1E293B'`. */
  palette?: PalettePins;

  /** Accessory pins keyed by `AccessoryKeys`. */
  accessories?: AccessoryPins;

  /** Whether a mouth is drawn. Default true. */
  mouth?: boolean;

  /** Pins individual traits; unknown keys are ignored. */
  traits?: TraitPins;

  /** Whether the name is normalized before hashing: trim, lowercase, NFC.
   * Default true. */
  normalize?: boolean;

  /** Whether the contrast floor between body and eyes is enforced.
   * Default true. */
  contrast?: boolean;

  /** The facial expression applied on top of the pose. Default `idle`. */
  expression?: Expression;
}

/** Structural equality across every field, including the pin maps
 * (order-insensitive). */
export function optionsEqual(
  a: HiblobOptions | null | undefined,
  b: HiblobOptions | null | undefined,
): boolean {
  const oa = a ?? {};
  const ob = b ?? {};
  return (
    (oa.background ?? 'none') === (ob.background ?? 'none') &&
    (oa.hue ?? null) === (ob.hue ?? null) &&
    (oa.tone ?? null) === (ob.tone ?? null) &&
    (oa.mouth ?? true) === (ob.mouth ?? true) &&
    (oa.normalize ?? true) === (ob.normalize ?? true) &&
    (oa.contrast ?? true) === (ob.contrast ?? true) &&
    (oa.expression ?? idle).equals(ob.expression ?? idle) &&
    mapsEqual(oa.palette, ob.palette) &&
    mapsEqual(oa.accessories, ob.accessories) &&
    mapsEqual(oa.traits, ob.traits)
  );
}

function mapsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const ka = Object.keys(a ?? {});
  const kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if ((a ?? {})[key] !== (b ?? {})[key]) return false;
  }
  return true;
}
