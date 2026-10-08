import { SessionStateMachine, Event, SessionData, CommandResult } from './protocol/StateMachine';
import { Protocol } from './protocol/allocation';
import { MouthViewPort } from './MouthView';
import { VoicePort, SoundPort, HapticPort, KeepAwakePort, Settings } from './ports';

export class BrushingController {
  private lastSessionData: SessionData | null = null;
  private timerId: any = null;

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
            this.voice.speak("Almost finished.");
          } else if (ev.type === 'ZoneStarted' && this.settings.voice && ev.index === 0) {
            // First zone, already said "Let's start brushing."
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
            this.voice.speak("Next section.");
          }
          break;
        case 'Halfway':
          if (this.settings.voice) {
            this.voice.speak("You're halfway there.");
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
}
