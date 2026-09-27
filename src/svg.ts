/**
 * SVG export: serialized blobs that render outside Flutter — in browsers,
 * servers, design tools, mail templates.
 */

import { argbToHex } from './color.js';
import { drawStepsOf, ResolvedHiblob, resolve } from './layout.js';
import type { HiblobOptions } from './options.js';

/**
 * Formats a stroke width like the Dart exporter: integral values print
 * without decimals, everything else keeps its shortest round-trip digits.
 * (Both branches collapse to plain `String()` in JS, which matches the Dart
 * exporter's output for the stroke widths in use.)
 */
function num(value: number): string {
  return String(value);
}

/**
 * Renders `resolved` as an SVG document string.
 *
 * The view box is the same 100×100 the Flutter renderer maps from. Fill
 * layers (backdrop, body, mouth, accessories) emit filled paths; stroked
 * marks (line eyes and mouth) emit stroked paths with round caps and joins
 * so the output matches the default Flutter painter exactly — at any scale.
 */
export function svgOf(resolved: ResolvedHiblob): string {
  let out =
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'viewBox="0 0 100 100" width="100" height="100">';
  let clipIndex = 0;
  for (const step of drawStepsOf(resolved)) {
    const clip = step.clip;
    if (clip != null) {
      const id = `cap-clip-${clipIndex++}`;
      out +=
        `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse">` +
        `<path d="${clip.toPathData()}"/></clipPath></defs>` +
        `<g clip-path="url(#${id})">`;
    }
    const color = argbToHex(step.color);
    out += `<path d="${step.path.toPathData()}"`;
    if (step.path.stroke) {
      out +=
        ` fill="none" stroke="${color}"` +
        ` stroke-width="${num(step.path.strokeWidth)}"` +
        ' stroke-linecap="round" stroke-linejoin="round"';
    } else {
      out += ` fill="${color}"`;
    }
    out += '/>';
    if (clip != null) out += '</g>';
  }
  return out + '</svg>';
}

/** Convenience for `svgOf`: resolves `name` with `options` first. */
export function svgFromName(
  name: string,
  options?: HiblobOptions,
): string {
  return svgOf(resolve(name, options));
}
