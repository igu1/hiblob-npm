/**
 * The deterministic trait reader: names in, `[0, 1)` positions out.
 *
 * Traits are addressed by string key. A name always produces the same value
 * for a given key, pins replace exactly the keys they name, and adding new
 * keys later never moves existing ones.
 */

import type { HiblobOptions } from './options.js';
import { normalizeSeed } from './normalize.js';
import { stream } from './hash.js';

/** Clamps `v` into `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wraps `h` (degrees) into `[0, 360)`. */
export function wrapDegrees(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Every trait the layout reads, in roster order. */
export const traitKeys = [
  'shape',
  'hue',
  'tone',
  'body.r',
  'body.aspect',
  'eye.ratio',
  'eye.spacing',
  'eye.offset',
  'face.offset',
  'mouth',
  'detail.a',
  'detail.b',
  'detail.c',
  'detail.phase',
  'nub.angle',
] as const;

export type TraitKey = (typeof traitKeys)[number];

/**
 * Reads the trait table for `name`, with `options` pins applied.
 *
 * When {@linkcode HiblobOptions.normalize} is on, the name is composed to
 * Unicode NFC, trimmed, and lowercased before hashing, so `'  ADA '`,
 * `'  Ada '`, and decomposed `'e'` + U+0301 all hash identically to `'ada'`.
 */
export function traitsFor(
  name: string,
  options?: HiblobOptions,
): Record<TraitKey, number> {
  const o = options ?? {};
  const seed = o.normalize === false ? name : normalizeSeed(name);
  const traits = {} as Record<TraitKey, number>;
  for (const k of traitKeys) traits[k] = stream(seed, k);
  for (const k of Object.keys(o.traits ?? {})) {
    const v = (o.traits as Record<string, number>)[k];
    if (k in traits && v != null) traits[k as TraitKey] = clamp(v, 0, 1);
  }
  if (o.hue != null) traits.hue = wrapDegrees(o.hue) / 360;
  if (o.tone != null) traits.tone = clamp(o.tone, 0, 0.999999);
  return traits;
}

/**
 * Maps a value in `[0, 1]` onto the band table `bands` (each entry is
 * `[start, end)`, end-inclusive only for the final band). Falls through to
 * the last key, so `1.0` is valid.
 */
export function bandFor(
  value: number,
  bands: Record<string, [number, number]>,
): string {
  for (const key of Object.keys(bands)) {
    const [start, end] = bands[key];
    if (value >= start && value < end) return key;
  }
  const keys = Object.keys(bands);
  return keys[keys.length - 1];
}

/**
 * The silhouette bands. Everyday shapes get wide bands; loud shapes are a
 * find. These tables are part of the frozen visual contract: changing a band
 * moves existing names to different silhouettes.
 */
export const shapeBands: Record<string, [number, number]> = {
  round: [0.0, 0.2],
  organic: [0.2, 0.42],
  boxy: [0.42, 0.55],
  nub: [0.55, 0.65],
  capsule: [0.65, 0.74],
  hexagon: [0.74, 0.8],
  triangle: [0.8, 0.86],
  droplet: [0.86, 0.905],
  cloud: [0.905, 0.945],
  gem: [0.945, 0.96],
  pillow: [0.96, 0.972],
  sun: [0.972, 1.01],
};

/** The tone bands, pale to ink, partitioned like the silhouette bands. */
export const toneBands: Record<string, [number, number]> = {
  pale: [0.0, 0.2],
  soft: [0.2, 0.4],
  mid: [0.4, 0.6],
  deep: [0.6, 0.8],
  ink: [0.8, 1.01],
};
