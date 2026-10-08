import { ZONES_8, ZONES_12, CHEWING_ZONES, ZoneDefinition } from './zones';

export const MIN_ZONE_SECONDS = 5;
export const MAX_ZONE_SECONDS = 120;
export const MAX_TOTAL_SECONDS = 900;
export const GET_READY_SECONDS = 3;
export const TRANSITION_SECONDS = 1;

export type ErrorCode = 
  | 'DURATION_NON_POSITIVE' 
  | 'DURATION_NON_INTEGER' 
  | 'DURATION_OUT_OF_RANGE' 
  | 'UNKNOWN_ZONE_ID' 
  | 'MISSING_REQUIRED_ZONE' 
  | 'DUPLICATE_ZONE' 
  | 'TOTAL_TOO_LARGE' 
  | 'IMPOSSIBLE_ALLOCATION';

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

export interface Slot {
  id: string;
  duration: number;
}

export interface Protocol {
  id: string;
  name: string;
  zoneMode: 8 | 12;
  slots: Slot[]; // order is implicit in array
  chewingSurfacePass: boolean;
  requestedBrushingDuration: number | null;
  computedTotalDuration: number;
}

export function allocateDuration(totalSeconds: number, slotsCount: number): Result<number[]> {
  if (totalSeconds <= 0) return { ok: false, code: 'DURATION_NON_POSITIVE' };
  if (!Number.isInteger(totalSeconds)) return { ok: false, code: 'DURATION_NON_INTEGER' };
  if (totalSeconds > MAX_TOTAL_SECONDS) return { ok: false, code: 'TOTAL_TOO_LARGE' };
  
  const base = Math.floor(totalSeconds / slotsCount);
  const r = totalSeconds % slotsCount;
  
  const durations: number[] = [];
  for (let i = 0; i < slotsCount; i++) {
    durations.push(i < r ? base + 1 : base);
  }
  
  for (const d of durations) {
    if (d < MIN_ZONE_SECONDS || d > MAX_ZONE_SECONDS) {
      return { ok: false, code: 'DURATION_OUT_OF_RANGE' };
    }
  }
  
  return { ok: true, value: durations };
}

export function createAutoProtocol(
  totalSeconds: number, 
  zoneMode: 8 | 12, 
  chewingEnabled: boolean
): Result<Protocol> {
  const primaryZones = zoneMode === 8 ? ZONES_8 : ZONES_12;
  const activeZones = [...primaryZones];
  if (chewingEnabled) {
    activeZones.push(...CHEWING_ZONES);
  }
  
  const allocation = allocateDuration(totalSeconds, activeZones.length);
  if (!allocation.ok) return allocation;
  
  const slots: Slot[] = activeZones.map((zone, i) => ({
    id: zone.id,
    duration: allocation.value[i]
  }));
  
  return validateProtocol({
    id: `auto_${totalSeconds}_${zoneMode}_${chewingEnabled}`,
    name: `Auto ${totalSeconds}s`,
    zoneMode,
    slots,
    chewingSurfacePass: chewingEnabled,
    requestedBrushingDuration: totalSeconds,
    computedTotalDuration: totalSeconds // validated in validateProtocol
  });
}

export function validateProtocol(protocol: Protocol): Result<Protocol> {
  // Validate total computed
  let computedTotal = 0;
  const seenIds = new Set<string>();
  
  for (const slot of protocol.slots) {
    if (!Number.isInteger(slot.duration)) return { ok: false, code: 'DURATION_NON_INTEGER' };
    if (slot.duration < MIN_ZONE_SECONDS || slot.duration > MAX_ZONE_SECONDS) return { ok: false, code: 'DURATION_OUT_OF_RANGE' };
    
    if (seenIds.has(slot.id)) return { ok: false, code: 'DUPLICATE_ZONE' };
    seenIds.add(slot.id);
    
    computedTotal += slot.duration;
  }
  
  if (protocol.requestedBrushingDuration !== null && computedTotal !== protocol.requestedBrushingDuration) {
    return { ok: false, code: 'IMPOSSIBLE_ALLOCATION' };
  }
  
  if (computedTotal > MAX_TOTAL_SECONDS) {
    return { ok: false, code: 'TOTAL_TOO_LARGE' };
  }
  
  // Validate zone IDs against mode
  const validPrimaryZones = protocol.zoneMode === 8 ? ZONES_8 : ZONES_12;
  const validIds = new Set([...validPrimaryZones.map(z => z.id)]);
  if (protocol.chewingSurfacePass) {
    CHEWING_ZONES.forEach(z => validIds.add(z.id));
  }
  
  for (const slot of protocol.slots) {
    if (!validIds.has(slot.id)) return { ok: false, code: 'UNKNOWN_ZONE_ID' };
  }
  
  for (const z of validPrimaryZones) {
    if (!seenIds.has(z.id)) return { ok: false, code: 'MISSING_REQUIRED_ZONE' };
  }
  if (protocol.chewingSurfacePass) {
    for (const z of CHEWING_ZONES) {
      if (!seenIds.has(z.id)) return { ok: false, code: 'MISSING_REQUIRED_ZONE' };
    }
  }
  
  return { ok: true, value: { ...protocol, computedTotalDuration: computedTotal } };
}
