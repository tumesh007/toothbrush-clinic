import { describe, it, expect } from 'vitest';
import { MOUTH_MANIFEST } from '../MouthManifest';
import { ALL_TEETH, POSTERIOR_TEETH_LL, POSTERIOR_TEETH_LR, POSTERIOR_TEETH_UL, POSTERIOR_TEETH_UR } from '../protocol/anatomy';

describe('Model Acceptance Tests', () => {
  it('All 28 tooth IDs resolve to outer and inner surfaces', () => {
    expect(ALL_TEETH.length).toBe(28);
    ALL_TEETH.forEach(t => {
      expect(MOUTH_MANIFEST[`${t}_outer`]).toBeDefined();
      expect(MOUTH_MANIFEST[`${t}_inner`]).toBeDefined();
    });
  });

  it('All 16 posterior chewing mappings resolve', () => {
    const posteriors = [...POSTERIOR_TEETH_LL, ...POSTERIOR_TEETH_LR, ...POSTERIOR_TEETH_UL, ...POSTERIOR_TEETH_UR];
    expect(posteriors.length).toBe(16);
    posteriors.forEach(t => {
      expect(MOUTH_MANIFEST[`${t}_chewing`]).toBeDefined();
    });
  });

  it('No unknown or duplicate mappings exist', () => {
    // 28 * 2 + 16 = 72
    const keys = Object.keys(MOUTH_MANIFEST);
    expect(keys.length).toBe(72);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(72);
  });
});
