import { SessionStateMachine, Event, SessionData, CommandResult } from './protocol/StateMachine';
import { Protocol } from './protocol/allocation';
import { MouthViewPort } from './MouthView';
import { VoicePort, SoundPort, HapticPort, KeepAwakePort, Settings } from './ports';

export class BrushingController {
  private lastSessionData: SessionData | null = null;
  private timerId: any = null;
  private currentProtocol: Protocol | null = null;

  constructor(
    private sm: SessionStateMachine,
    private mouthView: MouthViewPort,
    private voice: VoicePort,
    private sound: SoundPort,
    private haptics: HapticPort,
    private keepAwake: KeepAwakePort,
    private settings: Settings,
    private onStateChange: (data: SessionData) => void
  ) {}

  async start(protocol: Protocol): Promise<CommandResult> {
    const res = this.sm.start(protocol);
    if (!res.ok) return res;
    
    this.currentProtocol = protocol;
    await this.keepAwake.acquire();
    this.processEvents(this.sm.getEvents());
    this.notifyUI();
    this.startLoop();
    
    if (this.settings.voice) {
      this.voice.speak("Let's start brushing.");
    }
    
    return res;
  }

  pause(): CommandResult {
    const res = this.sm.pause();
    if (res.ok) {
      this.processEvents(this.sm.getEvents());
      this.notifyUI();
      this.stopLoop();
    }
    return res;
  }

  resume(): CommandResult {
    const res = this.sm.resume();
    if (res.ok) {
      this.processEvents(this.sm.getEvents());
      this.notifyUI();
      this.startLoop();
    }
    return res;
  }

  async cancel(): Promise<CommandResult> {
    const res = this.sm.cancel();
    if (res.ok) {
      this.processEvents(this.sm.getEvents());
      this.notifyUI();
      this.stopLoop();
      await this.keepAwake.release();
      this.mouthView.clearHighlight();
      this.mouthView.resetCamera();
    }
    return res;
  }
  
  private startLoop() {
    this.stopLoop();
    this.timerId = setInterval(() => {
      this.sm.tick(performance.now());
      this.processEvents(this.sm.getEvents());
      this.notifyUI();
      
      const state = this.sm.getSessionData().state;
      if (state === 'COMPLETED' || state === 'CANCELLED') {
        this.stopLoop();
        this.keepAwake.release();
      }
    }, 100); // 10hz is enough for 1-second accurate UI updates + fast transitions
  }
  
  private stopLoop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private notifyUI() {
    const data = this.sm.getSessionData();
    this.mouthView.updateState(data, this.currentProtocol);

    // Only notify if something changed that UI cares about (e.g. remaining seconds, state, zone)
    if (
      !this.lastSessionData ||
      this.lastSessionData.state !== data.state ||
      this.lastSessionData.remainingSeconds !== data.remainingSeconds ||
      this.lastSessionData.currentZone !== data.currentZone
    ) {
      this.lastSessionData = data;
      this.onStateChange(data);
      
      if (data.state === 'COUNTDOWN' && data.remainingSeconds > 0 && data.remainingSeconds <= 3 && this.settings.countdownSound) {
        this.sound.playTick();
      }
    }
  }

  private processEvents(events: Event[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'ZoneStarted':
        case 'FinalZoneStarted':
          if (ev.type === 'FinalZoneStarted' && this.settings.voice) {
            this.voice.speak("Almost finished. " + this.zoneInstruction(ev.zoneId));
          } else if (ev.type === 'ZoneStarted' && this.settings.voice && ev.index > 0) {
            this.voice.speak(this.zoneInstruction(ev.zoneId));
          }
          this.mouthView.highlightZone(ev.zoneId);
          this.mouthView.focusZone(ev.zoneId);
          break;
        case 'ZoneEnded':
          if (this.settings.haptics) this.haptics.pulse();
          if (this.settings.sound) this.sound.playChime();
          break;
        case 'TransitionStarted':
          if (this.settings.voice) {
            this.voice.speak("Good. Next section.");
          }
          break;
        case 'Halfway':
          if (this.settings.voice) {
            this.voice.speak("You're halfway there. Keep going!");
          }
          break;
        case 'Completed':
          this.mouthView.clearHighlight();
          this.mouthView.resetCamera();
          if (this.settings.voice) {
            this.voice.speak("All done. Excellent brushing!");
          }
          break;
      }
    }
  }

  /** Returns a child-friendly spoken instruction for a given zone ID. */
  private zoneInstruction(zoneId: string): string {
    const map: Record<string, string> = {
      // 12-zone outer
      'upper_right_outer':  'Upper right — outside.',
      'upper_front_outer':  'Upper front — outside.',
      'upper_left_outer':   'Upper left — outside.',
      'lower_right_outer':  'Lower right — outside.',
      'lower_front_outer':  'Lower front — outside.',
      'lower_left_outer':   'Lower left — outside.',
      // 12-zone inner
      'upper_right_inner':  'Upper right — inside.',
      'upper_front_inner':  'Upper front — inside.',
      'upper_left_inner':   'Upper left — inside.',
      'lower_right_inner':  'Lower right — inside.',
      'lower_front_inner':  'Lower front — inside.',
      'lower_left_inner':   'Lower left — inside.',
      // chewing surfaces
      'upper_right_chewing': 'Now brush the chewing surfaces on the upper right.',
      'upper_left_chewing':  'Now brush the chewing surfaces on the upper left.',
      'lower_right_chewing': 'Now brush the chewing surfaces on the lower right.',
      'lower_left_chewing':  'Now brush the chewing surfaces on the lower left.',
      // 8-zone outer
      'q_upper_right_outer': 'Upper right — outside.',
      'q_upper_left_outer':  'Upper left — outside.',
      'q_lower_right_outer': 'Lower right — outside.',
      'q_lower_left_outer':  'Lower left — outside.',
      // 8-zone inner
      'q_upper_right_inner': 'Upper right — inside.',
      'q_upper_left_inner':  'Upper left — inside.',
      'q_lower_right_inner': 'Lower right — inside.',
      'q_lower_left_inner':  'Lower left — inside.',
    };
    return map[zoneId] ?? 'Next section.';
  }
}
