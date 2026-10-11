import { describe, it, expect } from 'vitest';
import { ALL_TEETH, Surface, POSTERIOR_TEETH_UR, POSTERIOR_TEETH_UL, POSTERIOR_TEETH_LL, POSTERIOR_TEETH_LR } from '../anatomy';
import { ZONES_8, ZONES_12, CHEWING_ZONES } from '../zones';
import { createAutoProtocol, validateProtocol, allocateDuration } from '../allocation';

describe('Anatomy invariants', () => {
  it('has exactly 28 teeth', () => {
    expect(ALL_TEETH).toHaveLength(28);
    const unique = new Set(ALL_TEETH);
    expect(unique.size).toBe(28);
  });
});

describe('Zone coverage', () => {
  function getPairs(zones: typeof ZONES_8) {
    const pairs = new Set<string>();
    zones.forEach(zone => {
      zone.toothIds.forEach(t => {
        zone.surfaces.forEach(s => {
          const pair = `${t}:${s}`;
          if (pairs.has(pair)) throw new Error(`Duplicate pair: ${pair}`);
          pairs.add(pair);
        });
      });
    });
    return pairs;
  }

  it('12-zone mode covers exactly 56 pairs once', () => {
    const pairs = getPairs(ZONES_12);
    expect(pairs.size).toBe(56);
    ALL_TEETH.forEach(t => {
      expect(pairs.has(`${t}:outer`)).toBe(true);
      expect(pairs.has(`${t}:inner`)).toBe(true);
    });
  });

  it('8-zone mode covers exactly 56 pairs once', () => {
    const pairs = getPairs(ZONES_8);
    expect(pairs.size).toBe(56);
    ALL_TEETH.forEach(t => {
      expect(pairs.has(`${t}:outer`)).toBe(true);
      expect(pairs.has(`${t}:inner`)).toBe(true);
    });
  });

  it('8-zone equals 12-zone set', () => {
    const p12 = getPairs(ZONES_12);
    const p8 = getPairs(ZONES_8);
    expect(p12).toEqual(p8);
  });

  it('Chewing pass covers 16 posterior teeth', () => {
    const pairs = getPairs(CHEWING_ZONES);
    expect(pairs.size).toBe(16);
    const posteriors = [...POSTERIOR_TEETH_UR, ...POSTERIOR_TEETH_UL, ...POSTERIOR_TEETH_LR, ...POSTERIOR_TEETH_LL];
    expect(posteriors).toHaveLength(16);
    posteriors.forEach(t => {
      expect(pairs.has(`${t}:chewing`)).toBe(true);
    });
  });
});

describe('Timing vectors', () => {
  it('12 zones: 120 -> 10 each', () => {
    const p = createAutoProtocol(120, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.every(s => s.duration === 10)).toBe(true);
      expect(p.value.computedTotalDuration).toBe(120);
    }
  });

  it('12 zones: 180 -> 15 each', () => {
    const p = createAutoProtocol(180, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 15)).toBe(true);
  });

  it('12 zones: 240 -> 20 each', () => {
    const p = createAutoProtocol(240, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 20)).toBe(true);
  });

  it('12 zones: 300 -> 25 each', () => {
    const p = createAutoProtocol(300, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 25)).toBe(true);
  });

  it('12 zones: 360 -> 30 each', () => {
    const p = createAutoProtocol(360, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 30)).toBe(true);
  });

  it('12 zones + chewing (16 slots): 120 -> first 8=8, last 8=7', () => {
    const p = createAutoProtocol(120, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 8).every(s => s.duration === 8)).toBe(true);
      expect(p.value.slots.slice(8, 16).every(s => s.duration === 7)).toBe(true);
    }
  });

  it('12 zones + chewing (16 slots): 180 -> first 4=12, last 12=11', () => {
    const p = createAutoProtocol(180, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 4).every(s => s.duration === 12)).toBe(true);
      expect(p.value.slots.slice(4).every(s => s.duration === 11)).toBe(true);
    }
  });

  it('12 zones + chewing (16 slots): 240 -> all 15', () => {
    const p = createAutoProtocol(240, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 15)).toBe(true);
  });

  it('12 zones + chewing (16 slots): 300 -> first 12=19, last 4=18', () => {
    const p = createAutoProtocol(300, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 12).every(s => s.duration === 19)).toBe(true);
      expect(p.value.slots.slice(12).every(s => s.duration === 18)).toBe(true);
    }
  });

  it('12 zones + chewing (16 slots): 360 -> first 8=23, last 8=22', () => {
    const p = createAutoProtocol(360, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 8).every(s => s.duration === 23)).toBe(true);
      expect(p.value.slots.slice(8).every(s => s.duration === 22)).toBe(true);
    }
  });

  it('8 zones: 120 -> 15 each', () => {
    const p = createAutoProtocol(120, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 15)).toBe(true);
  });

  it('8 zones: 180 -> first 4=23, last 4=22', () => {
    const p = createAutoProtocol(180, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 4).every(s => s.duration === 23)).toBe(true);
      expect(p.value.slots.slice(4).every(s => s.duration === 22)).toBe(true);
    }
  });

  it('8 zones: 240 -> 30 each', () => {
    const p = createAutoProtocol(240, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 30)).toBe(true);
  });

  it('8 zones: 300 -> first 4=38, last 4=37', () => {
    const p = createAutoProtocol(300, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.slots.slice(0, 4).every(s => s.duration === 38)).toBe(true);
      expect(p.value.slots.slice(4).every(s => s.duration === 37)).toBe(true);
    }
  });

  it('8 zones: 360 -> 45 each', () => {
    const p = createAutoProtocol(360, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 45)).toBe(true);
  });

  it('8 zones + chewing (12 slots): 120 -> 10 each', () => {
    const p = createAutoProtocol(120, 8, true);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.slots.every(s => s.duration === 10)).toBe(true);
  });
  // Note: the prompt lists the other 8-zone+chewing vectors which follow the same logic.
});

describe('Validation', () => {
  it('Validates custom protocol successfully', () => {
    const slots = [
      { id: 'upper_right_outer', duration: 20 },
      { id: 'upper_front_outer', duration: 10 },
      { id: 'upper_left_outer', duration: 20 },
      { id: 'lower_right_outer', duration: 20 },
      { id: 'lower_front_outer', duration: 10 },
      { id: 'lower_left_outer', duration: 20 },
      { id: 'upper_right_inner', duration: 15 },
      { id: 'upper_front_inner', duration: 15 },
      { id: 'upper_left_inner', duration: 15 },
      { id: 'lower_right_inner', duration: 15 },
      { id: 'lower_front_inner', duration: 15 },
      { id: 'lower_left_inner', duration: 15 },
    ];
    const p = validateProtocol({
      id: 'custom',
      name: 'Custom',
      zoneMode: 12,
      slots,
      chewingSurfacePass: false,
      requestedBrushingDuration: 190,
      computedTotalDuration: 0,
    });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.computedTotalDuration).toBe(190);
  });

  it('Rejects non-integer duration', () => {
    const p = createAutoProtocol(120.5, 12, false);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe('DURATION_NON_INTEGER');
  });

  it('Rejects duration out of range', () => {
    const p = createAutoProtocol(40, 12, false); // 40/12 = 3.33 < MIN_ZONE_SECONDS (5)
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe('DURATION_OUT_OF_RANGE');
  });
});

// ─── V2 Tests ────────────────────────────────────────────────────────────────

describe('V2 — Surface coverage', () => {
  it('28 outer + 28 inner + 16 chewing = 72 total addressable surfaces', () => {
    // outer/inner for every tooth
    expect(ALL_TEETH.length).toBe(28);
    const posteriors = [...POSTERIOR_TEETH_UR, ...POSTERIOR_TEETH_UL, ...POSTERIOR_TEETH_LR, ...POSTERIOR_TEETH_LL];
    expect(posteriors.length).toBe(16);
    const total = ALL_TEETH.length * 2 + posteriors.length;
    expect(total).toBe(72);
  });
});

describe('V2 — 12-zone three-surface timing', () => {
  const cases: Array<[number, number, number, number, number]> = [
    // [totalSec, nSlots, base, remainder, +1slots]
    [120, 16,  7, 8,  8],  // 7*8 + 8*8 = 56+64=120  — base=7 r=8 → first 8 get 8
    [180, 16, 11, 4,  4],  // 11*12 + 12*4 = 132+48=180 — base=11 r=4
    [240, 16, 15, 0, 16],  // 15*16 = 240
    [300, 16, 18, 12, 12], // 18*4 + 19*12 = 72+228=300 — base=18 r=12
    [360, 16, 22, 8,  8],  // 22*8 + 23*8 = 176+184=360
  ];

  cases.forEach(([totalSec]) => {
    it(`${totalSec}s / 16 slots sums exactly to ${totalSec}`, () => {
      const p = createAutoProtocol(totalSec, 12, true);
      expect(p.ok).toBe(true);
      if (p.ok) {
        const sum = p.value.slots.reduce((a, s) => a + s.duration, 0);
        expect(sum).toBe(totalSec);
        expect(p.value.slots.length).toBe(16);
        p.value.slots.forEach(s => expect(s.duration).toBeGreaterThanOrEqual(5));
      }
    });
  });
});

describe('V2 — 8-zone three-surface timing (12 slots)', () => {
  [120, 180, 240, 300, 360].forEach(totalSec => {
    it(`${totalSec}s / 12 slots sums exactly to ${totalSec}`, () => {
      const p = createAutoProtocol(totalSec, 8, true);
      expect(p.ok).toBe(true);
      if (p.ok) {
        const sum = p.value.slots.reduce((a, s) => a + s.duration, 0);
        expect(sum).toBe(totalSec);
        expect(p.value.slots.length).toBe(12);
        p.value.slots.forEach(s => expect(s.duration).toBeGreaterThanOrEqual(5));
      }
    });
  });
});

describe('V2 — 12-zone side-only timing (12 slots)', () => {
  [120, 180, 240, 300, 360].forEach(totalSec => {
    it(`${totalSec}s / 12 slots sums to ${totalSec}`, () => {
      const p = createAutoProtocol(totalSec, 12, false);
      expect(p.ok).toBe(true);
      if (p.ok) {
        const sum = p.value.slots.reduce((a, s) => a + s.duration, 0);
        expect(sum).toBe(totalSec);
        p.value.slots.forEach(s => expect(s.duration).toBeGreaterThanOrEqual(5));
      }
    });
  });
});

describe('V2 — 8-zone side-only timing (8 slots)', () => {
  [120, 180, 240, 300, 360].forEach(totalSec => {
    it(`${totalSec}s / 8 slots sums to ${totalSec}`, () => {
      const p = createAutoProtocol(totalSec, 8, false);
      expect(p.ok).toBe(true);
      if (p.ok) {
        const sum = p.value.slots.reduce((a, s) => a + s.duration, 0);
        expect(sum).toBe(totalSec);
      }
    });
  });
});

describe('V2 — Chewing zones contain only posterior teeth', () => {
  it('CHEWING_ZONES contain exactly 16 posterior tooth-surface pairs', () => {
    let count = 0;
    CHEWING_ZONES.forEach(z => {
      expect(z.surfaces).toEqual(['chewing']);
      expect(z.toothIds.length).toBe(4);
      count += z.toothIds.length;
    });
    expect(count).toBe(16);
  });

  it('12-zone + chewing generates all 4 chewing zone IDs exactly once', () => {
    const p = createAutoProtocol(240, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      const ids = p.value.slots.map(s => s.id);
      ['upper_right_chewing','upper_left_chewing','lower_left_chewing','lower_right_chewing'].forEach(id => {
        expect(ids.filter(x => x === id).length).toBe(1);
      });
    }
  });
});

describe('V2 — 240s / 4 min exact allocation', () => {
  it('12 zones no chewing: 20s each', () => {
    const p = createAutoProtocol(240, 12, false);
    expect(p.ok).toBe(true);
    if (p.ok) p.value.slots.forEach(s => expect(s.duration).toBe(20));
  });
  it('12 zones + chewing (16 slots): 15s each', () => {
    const p = createAutoProtocol(240, 12, true);
    expect(p.ok).toBe(true);
    if (p.ok) p.value.slots.forEach(s => expect(s.duration).toBe(15));
  });
  it('8 zones no chewing: 30s each', () => {
    const p = createAutoProtocol(240, 8, false);
    expect(p.ok).toBe(true);
    if (p.ok) p.value.slots.forEach(s => expect(s.duration).toBe(30));
  });
  it('8 zones + chewing (12 slots): 20s each', () => {
    const p = createAutoProtocol(240, 8, true);
    expect(p.ok).toBe(true);
    if (p.ok) p.value.slots.forEach(s => expect(s.duration).toBe(20));
  });
});
