import { Settings, SettingsStore, VoicePort, SoundPort, HapticPort, KeepAwakePort } from './ports';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

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
  private activeUtterances = new Set<SpeechSynthesisUtterance>();
  private isNative = Capacitor.isNativePlatform();

  prime(): void {
    if (this.isNative) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.resume();
      // Unlock iOS Safari / iPadOS audio and synthesis queue during user gesture
      const primer = new SpeechSynthesisUtterance('');
      primer.volume = 0;
      this.activeUtterances.add(primer);
      primer.onend = () => { this.activeUtterances.delete(primer); };
      primer.onerror = () => { this.activeUtterances.delete(primer); };
      window.speechSynthesis.speak(primer);
    } catch (e) {
      // Ignored if priming fails
    }
  }

  async speak(text: string): Promise<void> {
    if (this.isNative) {
      try {
        await TextToSpeech.stop();
        await TextToSpeech.speak({
          text,
          lang: 'en-US',
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0,
          category: 'ambient',
        });
      } catch (e) {
        console.warn('Native TextToSpeech error:', e);
      }
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.resume();
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Keep strong reference so iOS WebKit doesn't garbage collect mid-speech
      this.activeUtterances.add(utterance);
      utterance.onend = () => { this.activeUtterances.delete(utterance); };
      utterance.onerror = () => { this.activeUtterances.delete(utterance); };

      // Micro-timeout prevents WebKit asynchronous cancel() from cancelling new utterance
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          this.activeUtterances.delete(utterance);
        }
      }, 30);
    } catch (e) {
      console.warn('Web SpeechSynthesis error:', e);
    }
  }

  stop(): void {
    if (this.isNative) {
      TextToSpeech.stop().catch(() => {});
      return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      this.activeUtterances.clear();
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

export class WebSoundPort implements SoundPort {
  private ctx: AudioContext | null = null;

  prime(): void {
    try {
      this.initCtx();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {}
  }

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
