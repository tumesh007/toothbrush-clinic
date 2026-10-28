export interface VoicePort {
  speak(text: string): Promise<void>;
  stop(): void;
  prime?(): void;
}

export interface SoundPort {
  playChime(): void;
  playTick(): void;
  prime?(): void;
}

export interface HapticPort {
  pulse(): void;
}

export interface KeepAwakePort {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export interface Settings {
  duration: number;
  zoneMode: 8 | 12;
  chewing: boolean;
  voice: boolean;
  sound: boolean;
  countdownSound: boolean;
  haptics: boolean;
  cameraMode: 'auto' | 'manual';
  reducedAnimation: boolean;
}

export interface SettingsStore {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

// Fakes
export class FakeVoicePort implements VoicePort {
  async speak(text: string) { console.log(`[Voice] ${text}`); }
  stop() { console.log(`[Voice Stop]`); }
}

export class FakeSoundPort implements SoundPort {
  playChime() { console.log(`[Sound] Chime`); }
  playTick() { console.log(`[Sound] Tick`); }
}

export class FakeHapticPort implements HapticPort {
  pulse() { console.log(`[Haptic] Pulse`); }
}

export class FakeKeepAwakePort implements KeepAwakePort {
  async acquire() { console.log(`[KeepAwake] Acquire`); }
  async release() { console.log(`[KeepAwake] Release`); }
}

export class InMemorySettingsStore implements SettingsStore {
  private settings: Settings = {
    duration: 180,
    zoneMode: 12,
    chewing: false,
    voice: true,
    sound: true,
    countdownSound: false,
    haptics: true,
    cameraMode: 'auto',
    reducedAnimation: false,
  };
  async load() { return { ...this.settings }; }
  async save(settings: Settings) { this.settings = { ...settings }; }
}
