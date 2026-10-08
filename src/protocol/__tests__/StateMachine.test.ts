import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStateMachine, Clock } from '../StateMachine';
import { Protocol } from '../allocation';

class FakeClock implements Clock {
  private time = 0;
  now() { return this.time; }
  advance(ms: number) { this.time += ms; }
  set(ms: number) { this.time = ms; }
}

describe('SessionStateMachine', () => {
  let clock: FakeClock;
  let sm: SessionStateMachine;
  let protocol: Protocol;

  beforeEach(() => {
    clock = new FakeClock();
    sm = new SessionStateMachine(clock);
    protocol = {
      id: 'test_protocol',
      name: 'Test',
      zoneMode: 12,
      slots: [
        { id: 'z1', duration: 10 },
        { id: 'z2', duration: 10 },
        { id: 'z3', duration: 10 },
      ],
      chewingSurfacePass: false,
      requestedBrushingDuration: 30,
      computedTotalDuration: 30,
    };
  });

  it('handles GET_READY and transitions to BRUSHING', () => {
    sm.start(protocol);
    let events = sm.getEvents();
    expect(events).toEqual([{ type: 'SessionStarted' }]);
    expect(sm.getSessionData().state).toBe('COUNTDOWN');
    expect(sm.getSessionData().remainingSeconds).toBe(3);

    clock.advance(3000);
    sm.tick(clock.now());
    
    events = sm.getEvents();
    expect(events).toEqual([{ type: 'ZoneStarted', zoneId: 'z1', index: 0 }]);
    expect(sm.getSessionData().state).toBe('BRUSHING');
    expect(sm.getSessionData().currentZone).toBe('z1');
    expect(sm.getSessionData().remainingSeconds).toBe(10);
  });

  it('emits exact event sequence over time including late ticks', () => {
    sm.start(protocol);
    sm.getEvents();
    
    // Jump to the middle of transition
    clock.advance(13500); // 3s countdown + 10s z1 + 0.5s transition
    sm.tick(clock.now());
    
    const events = sm.getEvents();
    expect(events).toEqual([
      { type: 'ZoneStarted', zoneId: 'z1', index: 0 },
      { type: 'ZoneEnded', zoneId: 'z1' },
      { type: 'TransitionStarted', fromZoneId: 'z1', toZoneId: 'z2' }
    ]);
    expect(sm.getSessionData().state).toBe('ZONE_TRANSITION');
    
    // Jump past halfway and into z3
    clock.advance(9000); // Now at 22.5s (in z2). Halfway is at 15s of brushing (i.e. halfway into z2).
    // Total brushing elapsed before tick: 10s. We advance by 9s, so 8.5s inside z2. Total brushing: 18.5s.
    sm.tick(clock.now());
    
    const events2 = sm.getEvents();
    expect(events2).toEqual([
      { type: 'ZoneStarted', zoneId: 'z2', index: 1 },
      { type: 'Halfway' }
    ]);
  });

  it('handles pause and resume correctly', () => {
    sm.start(protocol);
    sm.getEvents();
    clock.advance(3000);
    sm.tick(clock.now());
    sm.getEvents(); // clear ZoneStarted
    
    // brush for 4s
    clock.advance(4000);
    sm.tick(clock.now());
    
    // pause
    sm.pause();
    expect(sm.getEvents()).toEqual([{ type: 'Paused' }]);
    expect(sm.getSessionData().state).toBe('PAUSED');
    expect(sm.getSessionData().remainingSeconds).toBe(6);
    expect(sm.getSessionData().elapsedSeconds).toBe(4);
    
    // wait 10s
    clock.advance(10000);
    sm.tick(clock.now());
    expect(sm.getSessionData().remainingSeconds).toBe(6);
    
    // resume
    sm.resume();
    expect(sm.getEvents()).toEqual([{ type: 'Resumed' }]);
    
    // advance remaining 6s
    clock.advance(6000);
    sm.tick(clock.now());
    expect(sm.getEvents()).toEqual([
      { type: 'ZoneEnded', zoneId: 'z1' },
      { type: 'TransitionStarted', fromZoneId: 'z1', toZoneId: 'z2' }
    ]);
  });

  it('returns CLOCK_REGRESSION on backward time', () => {
    sm.start(protocol);
    clock.advance(1000);
    sm.tick(clock.now());
    
    clock.set(500);
    const res = sm.tick(clock.now());
    expect(res).toEqual({ ok: false, code: 'CLOCK_REGRESSION' });
  });

  it('idempotent on same timestamp', () => {
    sm.start(protocol);
    sm.getEvents(); // clear SessionStarted event
    clock.advance(1000);
    sm.tick(clock.now());
    sm.getEvents(); // clear any events from tick
    const res = sm.tick(clock.now());
    expect(res).toEqual({ ok: true });
    expect(sm.getEvents()).toEqual([]); // no double events
  });

  it('handles 35-second late tick correctly', () => {
    clock.set(100000); // Fixed starting time
    sm.start(protocol);
    sm.getEvents();
    
    // The protocol is: 3s GET_READY, 10s z1, 1s trans, 10s z2, 1s trans, 10s z3 (35s total real time to end)
    // We advance exactly 35,000 ms
    clock.advance(35000);
    const res = sm.tick(clock.now());
    
    expect(res).toEqual({ ok: true });
    expect(sm.getSessionData().state).toBe('COMPLETED');
    expect(sm.getSessionData().currentZone).toBe('z3'); // currentZone keeps last zone? The spec doesn't explicitly restrict.
    expect(sm.getSessionData().remainingSeconds).toBe(0);
    
    const events = sm.getEvents();
    expect(events).toEqual([
      { type: 'ZoneStarted', zoneId: 'z1', index: 0 },
      { type: 'ZoneEnded', zoneId: 'z1' },
      { type: 'TransitionStarted', fromZoneId: 'z1', toZoneId: 'z2' },
      { type: 'ZoneStarted', zoneId: 'z2', index: 1 },
      { type: 'Halfway' },
      { type: 'ZoneEnded', zoneId: 'z2' },
      { type: 'TransitionStarted', fromZoneId: 'z2', toZoneId: 'z3' },
      { type: 'FinalZoneStarted', zoneId: 'z3' },
      { type: 'ZoneEnded', zoneId: 'z3' },
      { type: 'Completed' }
    ]);
  });
  
  it('no transition after final zone', () => {
    // handled implicitly in the 35-second tick, we can see no TransitionStarted after z3
    // because it went straight to Completed
  });

  it('handles cancel', () => {
    sm.start(protocol);
    sm.cancel();
    expect(sm.getEvents()).toEqual([
      { type: 'SessionStarted' },
      { type: 'Cancelled' }
    ]);
    expect(sm.getSessionData().state).toBe('CANCELLED');
  });
});
