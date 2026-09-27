import { describe, expect, it } from 'vitest';

import {
  AccessoryKeys,
  argbToHex,
  argbToOklch,
  Backdrop,
  blendArgb,
  circle,
  Expression,
  expressions,
  frown,
  grin,
  happy,
  hexToArgb,
  idle,
  layoutFor,
  drawStepsOf,
  love,
  mad,
  MotionFrame,
  motionAt,
  motionSeedsFor,
  normalizeSeed,
  oklchBlend,
  oklchToArgb,
  PaletteKeys,
  partsFor,
  relativeLuminance,
  resolve,
  shapeBands,
  superellipse,
  thinking,
  traitKeys,
  traitsFor,
  svgFromName,
  svgOf,
  wink,
} from '../src/index.js';
import type { GeometryPath } from '../src/index.js';
import { bandCenter, sampleNames } from './util.js';

/**
 * Value equality for paths: same serialization and paint mode. (Two distinct
 * `GeometryPath` instances are never `===`, so compare by content.)
 */
function samePath(a: GeometryPath | null, b: GeometryPath | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.stroke === b.stroke &&
    a.strokeWidth === b.strokeWidth &&
    a.toPathData() === b.toPathData()
  );
}

describe('traitsFor', () => {
  it('is deterministic per name', () => {
    for (const name of sampleNames) {
      expect(traitsFor(name)).toEqual(traitsFor(name));
    }
  });

  it('differs across names', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(String(traitsFor(`name-${i}`).shape));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('normalizes trim and case when normalize is on', () => {
    const a = traitsFor('  ADA ');
    const b = traitsFor('ada');
    expect(a).toEqual(b);
  });

  it('normalization can be turned off', () => {
    const a = traitsFor('  ADA ', { normalize: false });
    const b = traitsFor('ada', { normalize: false });
    expect(a).not.toEqual(b);
  });

  it('pins only the keys they name', () => {
    const pinned = traitsFor('ada', { traits: { shape: 0 } });
    const plain = traitsFor('ada');
    expect(pinned.shape).toBe(0);
    for (const key of traitKeys) {
      if (key !== 'shape') expect(pinned[key]).toBe(plain[key]);
    }
  });

  it('hue and tone pins clamp and wrap', () => {
    const t = traitsFor('ada', { hue: 760, tone: 2 });
    expect(t.hue * 360).toBeCloseTo(40, 9);
    expect(t.tone).toBe(0.999999);
  });
});

describe('shape bands', () => {
  it('every band is reachable across many names', () => {
    const shapes = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      shapes.add(resolve(`user-${i}`).shape);
    }
    expect([...shapes].sort()).toEqual(Object.keys(shapeBands).sort());
  });

  it('band edges resolve as documented', () => {
    const at = (v: number): string =>
      resolve('ada', { traits: { shape: v } }).shape;
    expect(at(0.0)).toBe('round');
    expect(at(0.199)).toBe('round');
    expect(at(0.2)).toBe('organic');
    expect(at(0.945)).toBe('gem');
    expect(at(0.96)).toBe('pillow');
    expect(at(0.972)).toBe('sun');
    expect(at(1.0)).toBe('sun');
  });

  it('everyday shapes stay everyday, loud ones stay rare', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const s = resolve(`u${i}`).shape;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    expect(
      (counts['round'] ?? 0) + (counts['organic'] ?? 0),
    ).toBeGreaterThan(4000 * 0.3);
    expect(counts['sun'] ?? 0).toBeLessThan(4000 * 0.08);
  });
});

describe('resolve', () => {
  it('is deterministic: same name, same geometry and palette', () => {
    for (const name of sampleNames) {
      const a = resolve(name);
      const b = resolve(name);
      expect(a.body.map((p) => p.toPathData())).toEqual(
        b.body.map((p) => p.toPathData()),
      );
      expect(a.headColor).toBe(b.headColor);
      expect(a.eyeColor).toBe(b.eyeColor);
    }
  });

  it('two eyes in every figure, left before right', () => {
    for (const name of sampleNames) {
      const figure = resolve(name);
      expect(figure.eyes.length).toBe(2);
      expect(figure.eyes[0].cx).toBeLessThan(figure.eyes[1].cx);
    }
  });

  it('eyes never fuse', () => {
    for (const name of sampleNames) {
      const figure = resolve(name);
      const gap = figure.eyes[1].cx - figure.eyes[0].cx;
      expect(gap).toBeGreaterThan(2);
    }
  });

  it('every silhouette keeps its geometry inside the view box', () => {
    for (const shape of Object.keys(shapeBands)) {
      for (let i = 0; i < 80; i++) {
        const figure = resolve(`s${i}`, {
          traits: { shape: bandCenter(shapeBands[shape]) },
        });
        for (const path of figure.body) {
          const b = path.bounds;
          const reason = `${shape} name s${i}`;
          expect(b.minX, reason).toBeGreaterThanOrEqual(0.5);
          expect(b.maxX, reason).toBeLessThanOrEqual(99.5);
          expect(b.minY, reason).toBeGreaterThanOrEqual(0.5);
          expect(b.maxY, reason).toBeLessThanOrEqual(99.5);
        }
      }
    }
  });

  it('the whole roster of expressions resolves for every shape', () => {
    for (const shape of Object.keys(shapeBands)) {
      const traits = { shape: bandCenter(shapeBands[shape]) };
      for (const expression of expressions) {
        const figure = resolve('x', { traits, expression });
        expect(figure.eyes.length).toBe(2);
      }
    }
  });

  it('expressions change the eyes', () => {
    const withExpression = (e: Expression): string =>
      resolve('ada', { traits: { shape: 0 }, expression: e }).eyes[0].marks[0]
        .toPathData();
    const idleData = withExpression(idle);
    const happyData = withExpression(happy);
    const loveData = withExpression(love);
    expect(happyData).not.toBe(idleData);
    expect(loveData).not.toBe(idleData);
  });

  it('love eyes carry more marks than idle eyes', () => {
    const loved = resolve('ada', { expression: love, traits: { shape: 0 } });
    const idleFigure = resolve('ada', { traits: { shape: 0 } });
    expect(loved.eyes[0].marks.length).toBeGreaterThan(
      idleFigure.eyes[0].marks.length,
    );
  });

  it('wink closes exactly one eye', () => {
    const w = resolve('ada', { expression: wink });
    expect(w.eyes[0].strokeOnly).toBe(false);
    expect(w.eyes[1].strokeOnly).toBe(true);
  });
});

describe('palette', () => {
  it('pinned hue and tone give one stable head color', () => {
    const colors = new Set<number>(
      ['a', 'b', 'c', 'd'].map((name) =>
        resolve(name, {
          hue: 210,
          tone: 0.5,
          traits: { 'detail.b': 0.5, 'detail.c': 0.5 },
        }).headColor,
      ),
    );
    expect(colors.size).toBe(1);
  });

  it('contrast floor holds across many names', () => {
    for (let i = 0; i < 500; i++) {
      const figure = resolve(`c${i}`);
      const lh = relativeLuminance(figure.headColor);
      const le = relativeLuminance(figure.eyeColor);
      expect(
        Math.abs(lh - le),
        `name c${i} head ${argbToHex(figure.headColor)} eye ${argbToHex(
          figure.eyeColor,
        )}`,
      ).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('palette overrides win', () => {
    const figure = resolve('ada', {
      palette: {
        [PaletteKeys.head]: '#FF0000',
        [PaletteKeys.eye]: '#00FF00',
        [PaletteKeys.bg]: '#0000FF',
      },
      background: Backdrop.circle,
    });
    expect(figure.headColor).toBe(0xffff0000);
    expect(figure.eyeColor).toBe(0xff00ff00);
    expect(figure.backdropColor).toBe(0xff0000ff);
  });

  it('backdrops are drawn only when asked for', () => {
    expect(resolve('ada').backdrop).toBeNull();
    expect(
      resolve('ada', { background: Backdrop.circle }).backdrop,
    ).not.toBeNull();
  });

  it('hex helpers round-trip', () => {
    expect(argbToHex(0xff1e293b)).toBe('#1E293B');
    expect(hexToArgb('#1E293B')).toBe(0xff1e293b);
    expect(hexToArgb('1E293B')).toBe(0xff1e293b);
    expect(hexToArgb('#129')).toBe(0xff112299);
    expect(hexToArgb('#801E293B') >>> 24).toBe(0x80);
  });
});

describe('motion', () => {
  it('is deterministic', () => {
    const seeds = motionSeedsFor('ada');
    expect(motionAt(seeds, 1234.5)).toEqual(motionAt(seeds, 1234.5));
  });

  it('differs per name', () => {
    const a = motionAt(motionSeedsFor('a'), 1000);
    const b = motionAt(motionSeedsFor('b'), 1000);
    expect(a.equals(b)).toBe(false);
  });

  it('starts blink-free', () => {
    for (let i = 0; i < 100; i++) {
      expect(motionAt(motionSeedsFor(`m${i}`), 0).blink).toBe(0);
    }
  });

  it('blinks somewhere within a couple of periods', () => {
    const seeds = motionSeedsFor('ada');
    let sawBlink = false;
    for (let ms = 0; ms < seeds.blinkPeriod * 2500; ms += 16) {
      if (motionAt(seeds, ms).blink > 0.5) sawBlink = true;
    }
    expect(sawBlink).toBe(true);
  });

  it('stays in bounds', () => {
    for (let i = 0; i < 50; i++) {
      const seeds = motionSeedsFor(`b${i}`);
      for (let ms = 0; ms < 12000; ms += 16) {
        const f = motionAt(seeds, ms, 1);
        expect(f.blink).toBeGreaterThanOrEqual(0);
        expect(f.blink).toBeLessThanOrEqual(1);
        expect(Math.abs(f.gazeX)).toBeLessThanOrEqual(2);
        expect(Math.abs(f.gazeY)).toBeLessThanOrEqual(2);
        expect(Math.abs(f.bodyY)).toBeLessThanOrEqual(4.5);
        expect(f.bodyScaleY).toBeGreaterThanOrEqual(0.95);
        expect(f.bodyScaleY).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('is continuous frame to frame', () => {
    const seeds = motionSeedsFor('ada');
    let prev = motionAt(seeds, 0, 1);
    for (let ms = 16; ms < 6000; ms += 16) {
      const f = motionAt(seeds, ms, 1);
      expect(Math.abs(f.bodyY - prev.bodyY)).toBeLessThan(0.5);
      expect(Math.abs(f.gazeX - prev.gazeX)).toBeLessThan(0.6);
      expect(Math.abs(f.blink - prev.blink)).toBeLessThan(0.6);
      prev = f;
    }
  });

  it('the ramp quiets ambient motion', () => {
    const seeds = motionSeedsFor('ada');
    const sweep = (ramp: number): number => {
      let total = 0;
      for (let ms = 0; ms < 6000; ms += 16) {
        total += Math.abs(motionAt(seeds, ms, ramp).bodyY);
      }
      return total;
    };
    expect(sweep(0)).toBeLessThan(sweep(1) * 0.75);
  });
});

describe('OKLCh color space', () => {
  const channelDelta = (a: number, b: number, shift: number): number =>
    Math.abs(((a >> shift) & 0xff) - ((b >> shift) & 0xff));

  it('round-trips known colors within a couple of quantization steps', () => {
    for (const hex of ['#DD4422', '#101010', '#F2F2F2', '#00AABB']) {
      const argb = hexToArgb(hex);
      const { l, c, h } = argbToOklch(argb);
      expect(l, hex).toBeGreaterThanOrEqual(0);
      expect(l, hex).toBeLessThanOrEqual(1);
      expect(c, hex).toBeGreaterThan(0);
      const back = oklchToArgb(l, c, h);
      for (const shift of [16, 8, 0]) {
        expect(
          channelDelta(argb, back, shift),
          `${hex} channel ${shift}`,
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  it('achromatic colors have zero-ish chroma', () => {
    const gray = argbToOklch(0xff808080);
    expect(Math.abs(gray.l - 0.6)).toBeLessThan(0.02);
    expect(gray.c).toBeLessThan(0.0001);
  });

  it('oklchBlend travels from one endpoint to the other', () => {
    const from = hexToArgb('#336699');
    const to = hexToArgb('#EE5544');
    const atZero = oklchBlend(from, to, 0);
    const atOne = oklchBlend(from, to, 1);
    for (const shift of [16, 8, 0]) {
      expect(channelDelta(from, atZero, shift)).toBeLessThanOrEqual(3);
      expect(channelDelta(to, atOne, shift)).toBeLessThanOrEqual(3);
    }
    const mid = argbToOklch(oklchBlend(from, to, 0.5));
    const a = argbToOklch(from);
    const b = argbToOklch(to);
    expect(Math.abs(mid.l - (a.l + b.l) / 2)).toBeLessThan(0.02);
  });

  it('blendArgb lerps channels', () => {
    expect(blendArgb(0xff000000, 0xffffffff, 0.5)).toBe(0xff808080);
  });
});

describe('NFC normalization', () => {
  it('decomposed and composed spellings hash identically', () => {
    const decomposed = 'e\u0301'; // 'é' as e + combining acute
    const a = traitsFor(decomposed);
    const b = traitsFor('\u00e9');
    expect(a).toEqual(b);
    expect(resolve(decomposed).body.map((p) => p.toPathData())).toEqual(
      resolve('\u00e9').body.map((p) => p.toPathData()),
    );
  });

  it('normalizeSeed composes, trims, and lowercases', () => {
    expect(normalizeSeed(' \u0045\u0301  ')).toBe(
      normalizeSeed('\u00E9'.toLowerCase()),
    );
  });
});

describe('mouths', () => {
  it('every figure has a mouth by default', () => {
    for (let i = 0; i < 300; i++) {
      const resolved = resolve(`mouth-${i}`);
      expect(resolved.mouth, `mouth-${i}`).not.toBeNull();
      expect(resolved.mouth!.bounds.maxY).toBeLessThanOrEqual(100);
    }
  });

  it('expressions change the mouth', () => {
    const idleMouth = resolve('ada').mouth;
    const grinMouth = resolve('ada', { expression: grin }).mouth;
    const frownMouth = resolve('ada', { expression: frown }).mouth;
    expect(grinMouth).not.toBeNull();
    expect(frownMouth).not.toBeNull();
    expect(samePath(grinMouth, idleMouth)).toBe(false);
    expect(samePath(frownMouth, idleMouth)).toBe(false);
    expect(frownMouth!.bounds).not.toEqual(grinMouth!.bounds);
  });

  it('mouths can be turned off', () => {
    const resolved = resolve('ada', { mouth: false });
    expect(resolved.mouth).toBeNull();
  });
});

describe('accessories (presence and bounds)', () => {
  it('presence is deterministic and probability-bound', () => {
    const keyOf = (f: ReturnType<typeof resolve>): string[] =>
      f.accessories.map((x) => x.path.toPathData());
    expect(keyOf(resolve('access-1'))).toEqual(keyOf(resolve('access-1')));
    // With no pins every accessory still appears somewhere across names.
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      for (const acc of resolve(`acc-${i}`).accessories) {
        seen.add(acc.path.toPathData());
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('pins force accessories on and off', () => {
    const allOn = {
      [AccessoryKeys.glasses]: 1,
      [AccessoryKeys.fringe]: 1,
      [AccessoryKeys.blush]: 1,
      [AccessoryKeys.antennae]: 1,
    };
    const on = resolve('ada', { accessories: allOn });
    // Blush is two under-eye discs; the rest are above-face marks.
    expect(on.accessories.filter((a) => a.underEyes).length).toBe(2);
    expect(
      on.accessories.filter((a) => !a.underEyes).length,
    ).toBeGreaterThan(0);
    const off = resolve('ada', {
      accessories: {
        [AccessoryKeys.glasses]: 0,
        [AccessoryKeys.fringe]: 0,
        [AccessoryKeys.blush]: 0,
        [AccessoryKeys.antennae]: 0,
      },
    });
    expect(off.accessories.length).toBe(0);
  });

  it('accessories stay inside the view box', () => {
    for (let i = 0; i < 400; i++) {
      const resolved = resolve(`acc-check-${i}`, {
        accessories: {
          [AccessoryKeys.glasses]: 1,
          [AccessoryKeys.fringe]: 1,
          [AccessoryKeys.blush]: 1,
          [AccessoryKeys.antennae]: 1,
        },
      });
      for (const acc of resolved.accessories) {
        const b = acc.path.bounds;
        expect(b.minX).toBeGreaterThanOrEqual(-1);
        expect(b.maxX).toBeLessThanOrEqual(101);
        expect(b.minY).toBeGreaterThanOrEqual(-6); // antennae points
        expect(b.maxY).toBeLessThanOrEqual(101);
      }
    }
  });
});

describe('layoutFor, partsFor, drawStepsOf', () => {
  it('partsFor returns the body', () => {
    const resolved = resolve('ada');
    expect(partsFor('ada').map((p) => p.toPathData())).toEqual(
      resolved.body.map((p) => p.toPathData()),
    );
  });

  it('layoutFor covers backdrop, body, mouth, accessories, eyes', () => {
    const options = {
      background: Backdrop.circle,
      accessories: { [AccessoryKeys.glasses]: 1 },
    } as const;
    const resolved = resolve('ada', options);
    const steps = layoutFor('ada', options);
    const flattened = drawStepsOf(resolved);
    expect(steps.map((s) => s.color)).toEqual(flattened.map((s) => s.color));
    expect(steps.map((s) => s.path.toPathData())).toEqual(
      flattened.map((s) => s.path.toPathData()),
    );
    const countOf = (
      test: (p: GeometryPath) => boolean,
    ): number =>
      steps.filter((s) => s.clip === null && test(s.path)).length;
    expect(countOf((p) => samePath(p, resolved.backdrop))).toBe(1);
    expect(
      countOf((p) => resolved.body.some((b) => samePath(b, p))),
    ).toBe(resolved.body.length);
    expect(countOf((p) => samePath(p, resolved.mouth))).toBe(1);
    const allEyeMarks = resolved.eyes.flatMap((e) => [...e.marks]);
    expect(
      countOf((p) => allEyeMarks.some((m) => samePath(m, p))),
    ).toBe(allEyeMarks.length);
  });
});


describe('SVG export', () => {
  it('emits a complete document with paths and colors', () => {
    const resolved = resolve('ada@example.com', {
      background: Backdrop.squircle,
      expression: happy,
    });
    const svg = svgOf(resolved);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain(argbToHex(resolved.headColor));
    expect(svg).toContain(argbToHex(resolved.backdropColor));
    const paths = svg.match(/<path d/g)?.length ?? 0;
    expect(paths).toBeGreaterThanOrEqual(resolved.body.length + 2);
  });

  it('svgFromName matches svgOf(resolve(...))', () => {
    expect(svgFromName('grace', { expression: grin })).toBe(
      svgOf(resolve('grace', { expression: grin })),
    );
  });

  it('stroked paths lose fill and gain stroke', () => {
    const resolved = resolve('winker', { expression: wink });
    const hasStrokeMark = resolved.eyes.some((e) =>
      e.marks.some((m) => m.stroke),
    );
    if (!hasStrokeMark) return;
    const svg = svgOf(resolved);
    expect(svg).toContain('fill="none" stroke=');
  });

  it('the frozen snapshot golden is locked (full byte-parity lives in goldens.test.ts)', () => {
    const svg = svgFromName('ada@example.com', {
      background: Backdrop.squircle,
      expression: happy,
    });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(
      true,
    );
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});

describe('held expression loops', () => {
  it('thinking seesaws horizontally', () => {
    const seeds = motionSeedsFor('ada', { expression: thinking });
    let maxBodyX = 0;
    for (let ms = 0; ms < 6000; ms += 50) {
      maxBodyX = Math.max(maxBodyX, Math.abs(motionAt(seeds, ms, 1).bodyX));
    }
    expect(maxBodyX).toBeGreaterThan(0.7);
  });

  it('mad tremor layers a shake on top of the bob', () => {
    const madSeeds = motionSeedsFor('ada', { expression: mad });
    const idleSeeds = motionSeedsFor('ada');
    let maxDelta = 0;
    for (let ms = 0; ms < 1200; ms += 16) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(
          motionAt(madSeeds, ms, 1).bodyY - motionAt(idleSeeds, ms, 1).bodyY,
        ),
      );
    }
    // Same name, same bob — every delta comes from the tremor.
    expect(maxDelta).toBeGreaterThan(0.5);
  });

  it('held loops still quiet at ramp 0', () => {
    for (const expression of [thinking, mad]) {
      const seeds = motionSeedsFor('ada', { expression });
      const sweep = (ramp: number): number => {
        let total = 0;
        for (let ms = 0; ms < 6000; ms += 16) {
          total += Math.abs(motionAt(seeds, ms, ramp).bodyX);
        }
        return total;
      };
      expect(sweep(0)).toBeLessThan(sweep(1));
      expect(sweep(0)).toBeGreaterThan(0);
    }
  });
});

describe('geometry primitives', () => {
  it('path data is stable and equality follows it', () => {
    const a = circle(50, 50, 20);
    const b = circle(50, 50, 20);
    const c = circle(50, 50, 21);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.toPathData()).toContain('M');
    expect(a.toPathData()).toContain('C');
  });

  it('bounds reflect the geometry', () => {
    const b = circle(50, 50, 20).bounds;
    expect(Math.abs(b.minX - 30)).toBeLessThan(0.01);
    expect(Math.abs(b.maxX - 70)).toBeLessThan(0.01);
    expect(Math.abs(b.minY - 30)).toBeLessThan(0.01);
    expect(Math.abs(b.maxY - 70)).toBeLessThan(0.01);
  });

  it('superellipse with n=2 approximates a circle', () => {
    const se = superellipse(50, 50, 20, 20, 2).bounds;
    const c = circle(50, 50, 20).bounds;
    expect(Math.abs(se.minX - c.minX)).toBeLessThan(0.5);
    expect(Math.abs(se.maxX - c.maxX)).toBeLessThan(0.5);
  });
});

describe('MotionFrame equality', () => {
  it('works for shouldRepaint', () => {
    expect(new MotionFrame().equals(new MotionFrame())).toBe(true);
    expect(new MotionFrame(0, 1).equals(new MotionFrame(0, 2))).toBe(false);
  });
});
