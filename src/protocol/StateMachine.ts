import { Protocol, GET_READY_SECONDS, TRANSITION_SECONDS } from './allocation';

export type SessionState = 'IDLE' | 'COUNTDOWN' | 'BRUSHING' | 'ZONE_TRANSITION' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type Event = 
  | { type: 'SessionStarted' }
  | { type: 'ZoneStarted', zoneId: string, index: number }
  | { type: 'ZoneEnded', zoneId: string }
  | { type: 'TransitionStarted', fromZoneId: string, toZoneId: string }
  | { type: 'Halfway' }
  | { type: 'FinalZoneStarted', zoneId: string }
  | { type: 'Completed' }
  | { type: 'Paused' }
  | { type: 'Resumed' }
  | { type: 'Cancelled' };

export interface SessionData {
  state: SessionState;
  currentZone: string | null;
  currentZoneIndex: number;
  remainingSeconds: number; // For display, ceil(remainingMs / 1000)
  elapsedSeconds: number; // For display, total cumulative brushing time in seconds
  totalSeconds: number; // total brushing time required
}

export type CommandResult = { ok: true } | { ok: false, code: 'ILLEGAL_TRANSITION' | 'CLOCK_REGRESSION' };

export interface Clock {
  now(): number;
}

export class SessionStateMachine {
  private state: SessionState = 'IDLE';
  private protocol: Protocol | null = null;
  private currentZoneIndex = -1;
  private lastAcceptedTimestamp = 0;
  
  private currentPhaseEndMs = 0; 
  private remainingMsAtPause = 0;
  private pausedState: SessionState | null = null;
  
  private cumulativeBrushingMs = 0;
  private halfwayFired = false;
  
  private events: Event[] = [];

  constructor(private clock: Clock) {}

  start(protocol: Protocol): CommandResult {
    if (this.state !== 'IDLE' && this.state !== 'COMPLETED' && this.state !== 'CANCELLED') {
      return { ok: false, code: 'ILLEGAL_TRANSITION' };
    }
    this.protocol = protocol;
    this.currentZoneIndex = -1;
    this.cumulativeBrushingMs = 0;
    this.halfwayFired = false;
    this.events = [{ type: 'SessionStarted' }];
    
    this.lastAcceptedTimestamp = this.clock.now();
    this.enterPhase('COUNTDOWN', GET_READY_SECONDS * 1000, this.lastAcceptedTimestamp);
    
    return { ok: true };
  }

  pause(): CommandResult {
    if (this.state !== 'COUNTDOWN' && this.state !== 'BRUSHING' && this.state !== 'ZONE_TRANSITION') {
      return { ok: false, code: 'ILLEGAL_TRANSITION' };
    }
    const now = this.clock.now();
    if (now < this.lastAcceptedTimestamp) return { ok: false, code: 'CLOCK_REGRESSION' };
    
    // We must tick to update elapsed time accurately up to pause point
    this.tick(now);
    
    this.pausedState = this.state;
    this.remainingMsAtPause = this.currentPhaseEndMs - now;
    if (this.remainingMsAtPause < 0) this.remainingMsAtPause = 0;
    
    this.state = 'PAUSED';
    this.lastAcceptedTimestamp = now;
    this.events.push({ type: 'Paused' });
    return { ok: true };
  }

  resume(): CommandResult {
    if (this.state !== 'PAUSED' || !this.pausedState) return { ok: false, code: 'ILLEGAL_TRANSITION' };
    const now = this.clock.now();
    if (now < this.lastAcceptedTimestamp) return { ok: false, code: 'CLOCK_REGRESSION' };
    
    this.state = this.pausedState;
    this.pausedState = null;
    this.lastAcceptedTimestamp = now;
    this.currentPhaseEndMs = now + this.remainingMsAtPause;
    
    this.events.push({ type: 'Resumed' });
    return { ok: true };
  }

  cancel(): CommandResult {
    if (this.state === 'IDLE' || this.state === 'COMPLETED' || this.state === 'CANCELLED') {
      return { ok: false, code: 'ILLEGAL_TRANSITION' };
    }
    this.state = 'CANCELLED';
    this.events.push({ type: 'Cancelled' });
    return { ok: true };
  }

  tick(now: number): CommandResult {
    if (now < this.lastAcceptedTimestamp) return { ok: false, code: 'CLOCK_REGRESSION' };
    if (now === this.lastAcceptedTimestamp) return { ok: true }; // idempotent
    if (this.state === 'IDLE' || this.state === 'COMPLETED' || this.state === 'CANCELLED' || this.state === 'PAUSED') {
      this.lastAcceptedTimestamp = now;
      return { ok: true };
    }

    let currentNow = this.lastAcceptedTimestamp;
    
    while (currentNow < now) {
      if (this.state === 'COMPLETED') break;

      const msToPhaseEnd = this.currentPhaseEndMs - currentNow;
      const msAvailable = now - currentNow;
      const msToAdvance = Math.min(msAvailable, msToPhaseEnd);
      
      currentNow += msToAdvance;
      
      if (this.state === 'BRUSHING') {
        this.cumulativeBrushingMs += msToAdvance;
        this.checkHalfway();
      }
      
      if (currentNow >= this.currentPhaseEndMs) {
        this.advancePhase(currentNow);
      }
    }

    this.lastAcceptedTimestamp = now;
    return { ok: true };
  }
  
  private enterPhase(phase: SessionState, durationMs: number, currentNow: number) {
    this.state = phase;
    this.currentPhaseEndMs = currentNow + durationMs;
  }

  private advancePhase(currentNow: number) {
    if (!this.protocol) return;
    const slots = this.protocol.slots;

    if (this.state === 'COUNTDOWN') {
      this.currentZoneIndex = 0;
      this.startBrushingZone(currentNow);
    } else if (this.state === 'BRUSHING') {
      const zoneId = slots[this.currentZoneIndex].id;
      this.events.push({ type: 'ZoneEnded', zoneId });
      
      if (this.currentZoneIndex === slots.length - 1) {
        this.state = 'COMPLETED';
        this.events.push({ type: 'Completed' });
      } else {
        const nextZoneId = slots[this.currentZoneIndex + 1].id;
        this.events.push({ type: 'TransitionStarted', fromZoneId: zoneId, toZoneId: nextZoneId });
        this.enterPhase('ZONE_TRANSITION', TRANSITION_SECONDS * 1000, currentNow);
      }
    } else if (this.state === 'ZONE_TRANSITION') {
      this.currentZoneIndex++;
      this.startBrushingZone(currentNow);
    }
  }
  
  private startBrushingZone(currentNow: number) {
    if (!this.protocol) return;
    const slots = this.protocol.slots;
    const zoneId = slots[this.currentZoneIndex].id;
    const isFinal = this.currentZoneIndex === slots.length - 1;
    
    if (isFinal) {
      this.events.push({ type: 'FinalZoneStarted', zoneId });
    } else {
      this.events.push({ type: 'ZoneStarted', zoneId, index: this.currentZoneIndex });
    }
    
    this.enterPhase('BRUSHING', slots[this.currentZoneIndex].duration * 1000, currentNow);
  }

  private checkHalfway() {
    if (!this.protocol || this.halfwayFired) return;
    const halfTotalMs = this.protocol.computedTotalDuration * 500;
    if (this.cumulativeBrushingMs >= halfTotalMs) {
      this.halfwayFired = true;
      this.events.push({ type: 'Halfway' });
    }
  }

  getEvents(): Event[] {
    const evs = this.events;
    this.events = [];
    return evs;
  }
  
  peekEvents(): Event[] {
    return this.events;
  }

  getSessionData(): SessionData {
    let currentZone = null;
    let remainingSeconds = 0;
    
    if (this.state === 'COUNTDOWN') {
      remainingSeconds = Math.ceil(Math.max(0, this.currentPhaseEndMs - this.lastAcceptedTimestamp) / 1000);
    } else if (this.state === 'BRUSHING') {
      currentZone = this.protocol?.slots[this.currentZoneIndex]?.id || null;
      remainingSeconds = Math.ceil(Math.max(0, this.currentPhaseEndMs - this.lastAcceptedTimestamp) / 1000);
    } else if (this.state === 'ZONE_TRANSITION') {
      currentZone = this.protocol?.slots[this.currentZoneIndex]?.id || null;
      // During transition, UI often shows the next zone's full duration as remaining, or 0. Let's just say 0 or transition remaining.
      remainingSeconds = Math.ceil(Math.max(0, this.currentPhaseEndMs - this.lastAcceptedTimestamp) / 1000);
    } else if (this.state === 'PAUSED') {
      remainingSeconds = Math.ceil(this.remainingMsAtPause / 1000);
      if (this.pausedState === 'BRUSHING' || this.pausedState === 'ZONE_TRANSITION') {
        currentZone = this.protocol?.slots[this.currentZoneIndex]?.id || null;
      }
    } else if (this.state === 'COMPLETED') {
      currentZone = this.protocol?.slots[this.protocol.slots.length - 1]?.id || null;
    }

    return {
      state: this.state,
      currentZone,
      currentZoneIndex: this.currentZoneIndex,
      remainingSeconds,
      elapsedSeconds: Math.floor(this.cumulativeBrushingMs / 1000),
      totalSeconds: this.protocol?.computedTotalDuration || 0
    };
  }
}

