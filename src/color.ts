/**
 * Color math for the hiblob palette.
 *
 * Colors are authored in HSL, carried as 32-bit ARGB ints, compared with the
 * WCAG relative-luminance formula when the contrast floor is on, and blended
 * for expression tints. The OKLCh helpers expose the same colors in a
 * perceptually uniform space: `argbToOklch` reads a color's lightness,
 * chroma, and hue, `oklchToArgb` converts back, and `oklchBlend` mixes two
 * colors the way the eye sees them instead of along sRGB byte ramps.
 */

import { clamp } from './traits.js';

/** A 32-bit ARGB color, `0xAARRGGBB` as an unsigned int. */
export type Argb = number;

/** Tints the head dark for light bodies and light for dark ones — the shade
 * the fringe (brow cap) is drawn with. */
export function darkenColor(argb: Argb): Argb {
  return relativeLuminance(argb) > 0.3
    ? oklchBlend(argb, 0xff20242e, 0.55)
    : oklchBlend(argb, 0xfff2f2f2, 0.35);
}

/** Converts HSL components to an opaque 32-bit ARGB value. */
export function hslToArgb(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  const toByte = (v: number) => clamp(Math.round((v + m) * 255), 0, 255);
  return ((0xff << 24) | (toByte(r) << 16) | (toByte(g) << 8) | toByte(b)) >>> 0;
}

/** The OKLCh coordinates of a color: `l` in `[0,1]`, `c` in `[0, ~0.4]`,
 * `h` in degrees `[0, 360)`. */
export type Oklch = { l: number; c: number; h: number };

function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Converts an ARGB color to OKLCh (sRGB → linear sRGB → OKLab → OKLCh). */
export function argbToOklch(argb: number): Oklch {
  const r = toLinear(((argb >> 16) & 0xff) / 255);
  const g = toLinear(((argb >> 8) & 0xff) / 255);
  const b = toLinear((argb & 0xff) / 255);

  const l = Math.pow(
    0.4122214705 * r + 0.5363325363 * g + 0.0514459929 * b,
    1 / 3,
  );
  const m = Math.pow(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    1 / 3,
  );
  const s = Math.pow(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
    1 / 3,
  );

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(a * a + bb * bb);
  const h =
    c === 0
      ? 0
      : (((Math.atan2(bb, a) * 180) / Math.PI) % 360 + 360) % 360;
  return { l: clamp(L, 0, 1), c, h };
}

/**
 * Converts OKLCh coordinates back to an opaque ARGB color (inverse route:
 * OKLCh → OKLab → LMS³ → linear sRGB → sRGB).
 */
export function oklchToArgb(l: number, c: number, h: number): number {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  // OKLab → LMS-cubed prelude. Cubing is plain `x * x * x` so negative
  // linear-sRGB values stay real.
  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;
  const lPrime = lp * lp * lp;
  const mPrime = mp * mp * mp;
  const sPrime = sp * sp * sp;

  const r_ = [4.0767416621, -3.3077115913, 0.2309699292];
  const g_ = [-1.2684380046, 2.6097574011, -0.3413193965];
  const b_ = [-0.0041960863, -0.7034186147, 1.707614701];
  const srgb = (mat: number[]): number => {
    const v = mat[0] * lPrime + mat[1] * mPrime + mat[2] * sPrime;
    const v1 =
      v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return clamp(Math.round(v1 * 255), 0, 255);
  };

  const rb = srgb(r_);
  const gb = srgb(g_);
  const bbChannel = srgb(b_);
  return ((0xff << 24) | (rb << 16) | (gb << 8) | bbChannel) >>> 0;
}

/**
 * Perceptually blends `from` toward `to` by `t` in `[0, 1]`: both colors are
 * converted to OKLCh, the lightness, chroma, and (shortest-arc) hue travel
 * together, and the result converts back to ARGB.
 */
export function oklchBlend(from: number, to: number, t: number): number {
  t = clamp(t, 0, 1);
  const a = argbToOklch(from);
  const b = argbToOklch(to);
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return oklchToArgb(
    a.l + (b.l - a.l) * t,
    a.c + (b.c - a.c) * t,
    a.h + dh * t,
  );
}

/** Linearly blends each ARGB channel from `from` toward `to` by `t` in
 * `[0, 1]`. */
export function blendArgb(from: number, to: number, t: number): number {
  t = clamp(t, 0, 1);
  const channel = (argb: number, shift: number) => (argb >> shift) & 0xff;
  const mix = (shift: number) =>
    Math.round(
      channel(from, shift) +
        (channel(to, shift) - channel(from, shift)) * t,
    );
  return ((mix(24) << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

/** The WCAG relative luminance of `argb`. */
export function relativeLuminance(argb: number): number {
  const linear = (channel: number) => toLinear(channel / 255);
  return (
    0.2126 * linear((argb >> 16) & 0xff) +
    0.7152 * linear((argb >> 8) & 0xff) +
    0.0722 * linear(argb & 0xff)
  );
}

/** Formats `argb` as `#RRGGBB`, or `#AARRGGBB` when translucent. */
export function argbToHex(argb: number): string {
  const two = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  const rgb =
    two((argb >> 16) & 0xff) + two((argb >> 8) & 0xff) + two(argb & 0xff);
  const a = (argb >>> 24) & 0xff;
  return a === 0xff ? `#${rgb}` : `#${two(a)}${rgb}`;
}

/**
 * Parses `#RGB`, `#RRGGBB`, `#AARRGGBB` (with or without `#`) into ARGB.
 * Throws when `hex` is not one of those shapes.
 */
export function hexToArgb(hex: string): number {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) h = 'FF' + h;
  if (h.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(h)) {
    throw new Error(`Not a hex color: ${hex}`);
  }
  return parseInt(h, 16) >>> 0;
}
