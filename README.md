# hiblob

Deterministic geometric blob avatars from any string — the npm port of the
Dart package [`hiblob`](https://pub.dev/packages/hiblob) (MIT).

<p align="center">
  <img src="https://raw.githubusercontent.com/igu1/hiblob-npm/main/assets/hero.png" alt="A hiblob avatar for the name ada@example.com — an organic pale blob wearing glasses on a squircle" width="280" />
</p>

Give it a username, an email, a display name, an id — any string — and it
computes a complete blob figure: silhouette, palette (HSL + OKLCh), eyes,
mouth, accessories, motion seeds, and a standalone SVG. The same string
renders the same hiblob on every platform and every engine, byte for byte.

- **Zero runtime dependencies** — the figure is *computed*, no assets, no network
- **Deterministic** — 32-bit integer hashing (`Math.imul`), no `Math.random`, no clocks
- **Runs anywhere** — Node ≥ 18, browsers, Cloudflare Workers, Deno
- **ESM + CJS + `.d.ts`** — dual build via [tsup](https://tsup.egoist.dev)
- **Dart parity goldens** — `test/goldens.json` is generated from the Dart
  implementation; CI fails if the two ever drift apart

## Install

```sh
npm i hiblob
```

## Usage

```ts
import { resolve, svgFromName, motionAt, motionSeedsFor } from 'hiblob';

// SVG document, ready for the browser / mail templates / README
const svg = svgFromName('ada@example.com', { background: 'squircle' });

// Fully resolved figure — geometry + palette, paint order included
const figure = resolve('ada@example.com');
for (const step of figure.body) console.log(step.toPathData());

// Motion is a pure function of elapsed time — drive it from rAF or a ticker
const frame = motionAt(motionSeedsFor('ada@example.com'), 1200, 1);
// → { bodyX, bodyY, bodyScaleY, blink, gazeX, gazeY }
```

## API

| export | what it is |
| --- | --- |
| `traitsFor(name, options?)` | the `[0,1)` trait positions for a name, pins applied |
| `resolve(name, options?)` | full figure: backdrop, body, eyes, mouth, accessories, colors |
| `layoutFor(name, options?)` | `resolve` flattened into paint-order `DrawStep[]` |
| `partsFor(name, options?)` | just the body silhouette paths |
| `drawStepsOf(resolved)` | the same draw list from an already resolved figure |
| `svgOf(resolved)` / `svgFromName(name, options?)` | standalone 100×100 SVG string |
| `motionSeedsFor(name, options?)` / `motionAt(seeds, elapsedMs, ramp?)` | deterministic motion frames |
| `normalizeSeed(name)` | trim → lowercase → NFC |
| `traitKeys`, `shapeBands`, `toneBands` | the frozen visual contract tables |
| `expressions` + `idle…frown`, `tintFor` | the 16 expression roster |
| `Backdrop`, `PaletteKeys`, `AccessoryKeys` | option key/reference constants |
| `hslToArgb`, `argbToHex`, `hexToArgb`, `blendArgb`, `relativeLuminance` | color math (32-bit ARGB) |
| `argbToOklch`, `oklchToArgb`, `oklchBlend` | perceptual OKLCh math and blending |
| `circle, ellipse, superellipse, roundedPolygon, roundedRect, radialBlob, star, droplet, halfDisc, polyline, quad, smoothClosed, rotatePt` | geometry builders |
| `GeometryPath`, `MoveTo, LineTo, CubicTo, QuadraticTo, ClosePath, Pt, RadialWave` | geometry types |

### Options

```ts
interface HiblobOptions {
  background?: 'none' | 'squircle' | 'circle' | 'square';
  hue?: number;              // degrees, wraps; pins the hue trait
  tone?: number;             // [0, 1); pins the tone band
  palette?: { bg?: string; head?: string; eye?: string };// hex pins
  accessories?: { glasses?: number; fringe?: number; blush?: number; antennae?: number };
  mouth?: boolean;           // default true
  traits?: Record<string, number>; // pins, clamped to [0,1]; unknown keys ignored
  normalize?: boolean;       // default true (trim, lowercase, NFC)
  contrast?: boolean;        // default true (eye/body luminance floor)
  expression?: Expression;   // default idle
}
```

Pins override exactly the axes they name; everything else stays name-driven.
`console.log(svgFromName('ada', { hue: 210, tone: 0.5 }))` is the fastest way
to play with them.

A Flutter widget layer (static + animated, hover ramping) ships in the Dart
package; the browser/canvas binding here is planned for a follow-up release
(`motionAt` already gives you everything a renderer needs — see the port
spec in the Dart repo for the render parity notes).

## Samples

Every name draws a different creature — 48 usernames, freshly generated with
the published package:

<p align="center">
  <img src="https://raw.githubusercontent.com/igu1/hiblob-npm/main/assets/mosaic.png" alt="A wall of 48 hiblob avatars, each a distinct silhouette, palette, face, and accessory mix" width="720" />
</p>

All 16 expressions on one name:

<p align="center">
  <img src="https://raw.githubusercontent.com/igu1/hiblob-npm/main/assets/expressions.png" alt="The 16 hiblob expressions — idle, happy, sad, mad, surprised, wink, sleepy, smug, unsure, scared, love, shy, sick, thinking, grin, frown" width="720" />
</p>

And the 12-silhouette roster with every accessory pinned on, showing the
fitted brow cap hugging each shape:

<p align="center">
  <img src="https://raw.githubusercontent.com/igu1/hiblob-npm/main/assets/silhouettes.png" alt="The 12 hiblob silhouettes — round, organic, boxy, nub, capsule, hexagon, triangle, droplet, cloud, gem, pillow, sun — each with the fitted brow cap, glasses, blush and antennae" width="480" />
</p>

## Dart parity

`test/goldens.json` holds 65 exact SVG outputs that were generated by running
the Dart `hiblob` package itself (snapshot, every silhouette × body size, all
16 expressions, accessories on for every silhouette, backdrops, palette/hue/
tone pins, raw un-normalized seeds). `test/goldens.test.ts` asserts this
package reproduces each one byte for byte — so a `hiblob` SVG and the
Dart `svgOf` produce identical strings.

The goldens are a checked-in fixture, not generated at build time. The
generating script lives with the Dart implementation
([github.com/igu1/hiblob](https://github.com/igu1/hiblob), `pub/hiblob-flutter`),
alongside the `NPM_PORT_SPEC.md` handoff document this port was built from.
If the Dart core ever changes, regenerate the goldens there, review the
diff of `goldens.json` here, and port the change so both stay in lockstep.

## Development

```sh
npm install
npm run check   # tsc --noEmit
npm test        # vitest — port of the Dart test suite + parity goldens
npm run build   # tsup → dist (ESM + CJS + types)
npx publint     # keep clean before publishing
```

MIT — see [LICENSE](./LICENSE). The deterministic design is a port of the
Dart/Flutter package: [github.com/igu1/hiblob](https://github.com/igu1/hiblob).
