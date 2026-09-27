/**
 * Deterministic elapsed-time motion: breathe, bob, blink, and glances.
 *
 * Motion is a pure function of (seed, elapsed time, ramp) — no controllers,
 * no state, no clocks. The same name at the same moment is at the same point
 * in its motion, on every platform.
 */

import { Expression, idle } from './expressions.js';
import type { HiblobOptions } from './options.js';
import { normalizeSeed } from './normalize.js';
import { stream } from './hash.js';

const PI2 = Math.PI * 2;

/** The per-name random periods and phases motion reads. */
export class MotionSeeds {
  readonly bobPhase: number;
  readonly bobPeriod: number;
  readonly breathePhase: number;
  readonly breathePeriod: number;
  readonly blinkPeriod: number;
  readonly blinkOffset: number;
  readonly glancePeriod: number;
  readonly glanceSeed: number;

  /** Phase of the held `thinking` seesaw loop. */
  readonly seesawPhase: number;

  /** Random phase of the held `mad` tremor loop. */
  readonly tremorPhase: number;

  /** The expression the seeded figure carries; held loops read it. */
  readonly expression: Expression;

  constructor(
    bobPhase: number,
    bobPeriod: number,
    breathePhase: number,
    breathePeriod: number,
    blinkPeriod: number,
    blinkOffset: number,
    glancePeriod: number,
    glanceSeed: number,
    seesawPhase = 0,
    tremorPhase = 0,
    expression: Expression = idle,
  ) {
    this.bobPhase = bobPhase;
    this.bobPeriod = bobPeriod;
    this.breathePhase = breathePhase;
    this.breathePeriod = breathePeriod;
    this.blinkPeriod = blinkPeriod;
    this.blinkOffset = blinkOffset;
    this.glancePeriod = glancePeriod;
    this.glanceSeed = glanceSeed;
    this.seesawPhase = seesawPhase;
    this.tremorPhase = tremorPhase;
    this.expression = expression;
  }
}

/** One instant of motion, in view-box units. */
export class MotionFrame {
  /** Horizontal body offset (positive is right) — the `thinking` seesaw. */
  readonly bodyX: number;

  /** Vertical body offset (positive is down). */
  readonly bodyY: number;

  /** Vertical body scale around the body center (breathe). */
  readonly bodyScaleY: number;

  /** Eye closure in `[0, 1]`; 1 is fully closed. */
  readonly blink: number;

  /** Horizontal eye offset (glance), in `[-2, 2]` view-box units. */
  readonly gazeX: number;

  /** Vertical eye offset (glance), in `[-2, 2]` view-box units. */
  readonly gazeY: number;

  constructor(
    bodyX = 0,
    bodyY = 0,
    bodyScaleY = 1,
    blink = 0,
    gazeX = 0,
    gazeY = 0,
  ) {
    this.bodyX = bodyX;
    this.bodyY = bodyY;
    this.bodyScaleY = bodyScaleY;
    this.blink = blink;
    this.gazeX = gazeX;
    this.gazeY = gazeY;
  }

  equals(other: MotionFrame): boolean {
    return (
      other.bodyX === this.bodyX &&
      other.bodyY === this.bodyY &&
      other.bodyScaleY === this.bodyScaleY &&
      other.blink === this.blink &&
      other.gazeX === this.gazeX &&
      other.gazeY === this.gazeY
    );
  }

  toString(): string {
    return (
      `MotionFrame(bodyX: ${this.bodyX}, bodyY: ${this.bodyY}, ` +
      `scaleY: ${this.bodyScaleY}, blink: ${this.blink}, ` +
      `gaze: (${this.gazeX}, ${this.gazeY}))`
    );
  }
}

/** The motionless frame a static hiblob paints. */
export const motionFrameZero = new MotionFrame();

/** Reads the motion seeds for `name`. */
export function motionSeedsFor(
  name: string,
  options?: HiblobOptions,
): MotionSeeds {
  const o = options ?? {};
  const seed = o.normalize === false ? name : normalizeSeed(name);
  return new MotionSeeds(
    stream(seed, 'motion.bob.phase') * PI2,
    2.4 + stream(seed, 'motion.bob.period') * 1.2,
    stream(seed, 'motion.breathe.phase') * PI2,
    3 + stream(seed, 'motion.breathe.period') * 1.5,
    2.8 + stream(seed, 'motion.blink.period') * 2.7,
    stream(seed, 'motion.blink.offset') * 0.35,
    1.8 + stream(seed, 'motion.glance.period') * 2,
    stream(seed, 'motion.glance.seed'),
    stream(seed, 'motion.seesaw.phase') * PI2,
    stream(seed, 'motion.tremor.phase') * PI2,
    o.expression ?? idle,
  );
}

function glanceComponent(
  glanceSeed: number,
  index: number,
  axis: string,
): number {
  const v = stream(`glance/${glanceSeed}/${index}`, axis);
  return v * 2 - 1; // -1..1
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Dart-style modulo: always non-negative for a positive divisor. */
function dartMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * The motion frame at `elapsedMs` for `seeds`.
 *
 * `ramp` in `[0, 1]` scales the ambient motion up from a quiet idle (0) to
 * full liveliness (1) — the hover mode ramps it with the pointer. The frame
 * at elapsed 0 is always blink-free, so a paused hiblob never shows half a
 * blink.
 *
 * Two expressions carry *held* loops that survive the ramp: `thinking`
 * slowly seesaws its body from side to side, and `mad` adds a fast
 * high-frequency tremor. Both scale with `ramp` so they still quiet down.
 */
export function motionAt(
  seeds: MotionSeeds,
  elapsedMs: number,
  ramp = 0,
): MotionFrame {
  const t = elapsedMs / 1000;
  const ambient = 0.35 + 0.65 * clamp01(ramp);

  const bob =
    Math.sin((PI2 * t) / seeds.bobPeriod + seeds.bobPhase) * 1.5 * ambient;
  const bodyY = bob - 2 * ramp;
  let bodyX = 0;
  let tremor = 0;
  switch (seeds.expression.id) {
    case 'thinking':
      // Seesaw: one slow traverse roughly every 6 seconds.
      bodyX =
        Math.sin((PI2 * t) / 6 + seeds.seesawPhase) * 1.1 * ambient;
      break;
    case 'mad':
      // Tremor: a fast, tiny shake layered over the bob.
      tremor =
        (Math.sin((PI2 * t) / 0.32 + seeds.tremorPhase) * 0.8 +
          Math.sin((PI2 * t) / 0.21 + seeds.tremorPhase * 1.7) * 0.4) *
        ambient;
      bodyX =
        Math.sin((PI2 * t) / 0.53 + seeds.tremorPhase) * 0.35 * ambient;
      break;
  }
  const bodyScaleY =
    1 +
    Math.sin(
      (PI2 * t) / seeds.breathePeriod + seeds.breathePhase,
    ) *
      0.012 *
      ambient;

  // Blink: one short window inside each blink period, shaped like a half
  // sine so it closes and opens smoothly.
  const bt =
    dartMod(t + seeds.blinkOffset * seeds.blinkPeriod, seeds.blinkPeriod) /
    seeds.blinkPeriod;
  const windowStart = 0.55;
  const windowLength = 0.055;
  let blink = 0;
  if (bt >= windowStart && bt <= windowStart + windowLength) {
    blink = Math.sin(((bt - windowStart) / windowLength) * Math.PI);
  }

  // Glances: a new target each glance period, approached with an ease-out in
  // the first 12% of the period, so saccades snap and then hold.
  const index = Math.floor(t / seeds.glancePeriod);
  const prevIndex = index - 1;
  const frac = t / seeds.glancePeriod - index;
  const ease = frac < 0.12 ? easeOutCubic(frac / 0.12) : 1;
  const glance = (axis: string): number => {
    const cur = glanceComponent(seeds.glanceSeed, index, axis);
    const prev = glanceComponent(seeds.glanceSeed, prevIndex, axis);
    return (prev + (cur - prev) * ease) * 1.8 * ambient;
  };

  return new MotionFrame(
    bodyX,
    bodyY + tremor,
    bodyScaleY,
    blink,
    glance('x'),
    glance('y'),
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
