import { ALL_TEETH, Surface, POSTERIOR_TEETH_LL, POSTERIOR_TEETH_LR, POSTERIOR_TEETH_UL, POSTERIOR_TEETH_UR } from './protocol/anatomy';

export type ManifestMapping = Record<string, string>;

export const MOUTH_MANIFEST: ManifestMapping = {};

const POSTERIORS = new Set([...POSTERIOR_TEETH_LL, ...POSTERIOR_TEETH_LR, ...POSTERIOR_TEETH_UL, ...POSTERIOR_TEETH_UR]);

ALL_TEETH.forEach(toothId => {
  MOUTH_MANIFEST[`${toothId}_outer`] = `${toothId}_outer`;
  MOUTH_MANIFEST[`${toothId}_inner`] = `${toothId}_inner`;
  if (POSTERIORS.has(toothId)) {
    MOUTH_MANIFEST[`${toothId}_chewing`] = `${toothId}_chewing`;
  }
});

// A function to validate at runtime
export function validateManifest(availableNodeNames: Set<string>) {
  for (const [key, meshName] of Object.entries(MOUTH_MANIFEST)) {
    if (!availableNodeNames.has(meshName)) {
      throw new Error(`Manifest validation failed: Missing mesh/node '${meshName}' for mapping '${key}'`);
    }
  }
}
