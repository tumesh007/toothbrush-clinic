import { Settings, SettingsStore, VoicePort, SoundPort, HapticPort, KeepAwakePort } from './ports';

export class LocalStorageSettingsStore implements SettingsStore {
  private defaultSettings: Settings = {
    duration: 180,
    zoneMode: 12,
    chewing: true,   // V2: chewing is ON by default — it is a first-class guided surface
    voice: true,
    sound: true,
    countdownSound: false,
    haptics: true,
    cameraMode: 'auto',
    reducedAnimation: false,
  };

  async load(): Promise<Settings> {
    const data = localStorage.getItem('clinic_settings');
    if (data) {
      try {
        return { ...this.defaultSettings, ...JSON.parse(data) };
      } catch (e) {
        return { ...this.defaultSettings };
      }
    }
    return { ...this.defaultSettings };
  }

  async save(settings: Settings): Promise<void> {
    localStorage.setItem('clinic_settings', JSON.stringify(settings));
  }
}

export class WebVoicePort implements VoicePort {
  async speak(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
  }
}

export class WebSoundPort implements SoundPort {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playChime(): void {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch(e) {}
  }

  playTick(): void {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch(e) {}
  }
}

export class WebHapticPort implements HapticPort {
  pulse(): void {
    if (navigator.vibrate) {
      navigator.vibrate(50); // 50ms pulse
    }
  }
}

export class WebKeepAwakePort implements KeepAwakePort {
  private wakeLock: any = null;

  async acquire(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('WakeLock failed', err);
      }
    }
  }

  async release(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.warn('WakeLock release failed', err);
      }
    }
  }
}
