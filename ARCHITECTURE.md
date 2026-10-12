# Architecture — Toothbrush Clinic

This document describes the internal design of Toothbrush Clinic for contributors and maintainers.

---

## Module Dependency Graph

```
main.ts
  ├── MouthView.ts          (Three.js rendering, camera, touch)
  ├── BrushingController.ts
  │     ├── StateMachine.ts (protocol/StateMachine.ts)
  │     ├── MouthViewPort   (interface from MouthView.ts)
  │     └── ports.ts        (VoicePort, SoundPort, HapticPort, KeepAwakePort)
  ├── adapters.ts            (Web implementations of all ports)
  └── protocol/
        ├── anatomy.ts
        ├── zones.ts
        └── allocation.ts
```

No module imports from a parent; dependencies only flow downward.

---

## Protocol Engine

### Tooth IDs

All tooth identifiers follow the pattern `<quadrant>_<type>`:

```
ur_ci  ul_ci  lr_ci  ll_ci   (central incisors)
ur_li  ul_li  lr_li  ll_li   (lateral incisors)
ur_c   ul_c   lr_c   ll_c    (canines)
ur_pm1 ul_pm1 lr_pm1 ll_pm1  (first premolars)
ur_pm2 ul_pm2 lr_pm2 ll_pm2  (second premolars)
ur_m1  ul_m1  lr_m1  ll_m1   (first molars)
ur_m2  ul_m2  lr_m2  ll_m2   (second molars)
```

Quadrant prefix: `ur` = upper-right, `ul` = upper-left, `lr` = lower-right, `ll` = lower-left.

### Surface Manifest (`MouthManifest.ts`)

Maps every `<toothId>_<surface>` key to a GLB mesh node name (currently 1:1). Validated at runtime after the GLB loads:

```typescript
validateManifest(availableNodes: Set<string>)
// throws if any manifest key has no corresponding GLB node
```

Total: 72 keys (28 outer + 28 inner + 16 chewing).

### Zone Definitions (`protocol/zones.ts`)

Three exported arrays:

| Export | Zones | Surfaces |
|---|---|---|
| `ZONES_12` | 12 | outer × 6 + inner × 6 |
| `ZONES_8` | 8 | outer × 4 + inner × 4 |
| `CHEWING_ZONES` | 4 | chewing × 4 |

Each `ZoneDefinition` carries: `id`, `toothIds[]`, `surfaces[]`, `order`, `type`.

### Duration Allocation (`protocol/allocation.ts`)

`allocateDuration(totalSeconds, slotsCount)` → `Result<number[]>`

Algorithm: integer division with remainder distributed to first `r` slots:
```
base = floor(total / n)
each slot gets base, first (total % n) slots get base + 1
```

`createAutoProtocol(seconds, zoneMode, chewingEnabled)` assembles zones + allocation into a `Protocol` object and validates it with `validateProtocol`.

Constraints enforced:
- `MIN_ZONE_SECONDS = 5`
- `MAX_ZONE_SECONDS = 120`
- `MAX_TOTAL_SECONDS = 900`
- Computed total must exactly equal `requestedBrushingDuration`

---

## State Machine (`protocol/StateMachine.ts`)

### States

```
IDLE → COUNTDOWN → BRUSHING ⇄ ZONE_TRANSITION → BRUSHING → ... → COMPLETED
                     ↕                   ↕
                   PAUSED              PAUSED
                     ↕                   ↕
                   BRUSHING           ZONE_TRANSITION
                                  ↓
                               CANCELLED
```

### Phase mechanics

Each state has a `currentPhaseEndMs` deadline set at entry. `tick(now)` advances time by consuming the minimum of `(now - lastAccepted)` and `(phaseEndMs - currentNow)`, enabling multi-phase advancement in a single tick call with no timing drift.

```
tick loop (10 Hz):
  while currentNow < now:
    msToAdvance = min(now - currentNow, phaseEnd - currentNow)
    currentNow += msToAdvance
    if state == BRUSHING: cumulativeBrushingMs += msToAdvance
    if currentNow >= phaseEnd: advancePhase()
```

### Event queue

Events are accumulated in `events[]` during `tick()` and consumed by `BrushingController.processEvents()` after each tick. The queue is cleared on read (`getEvents()` is destructive).

Event types: `SessionStarted`, `ZoneStarted`, `FinalZoneStarted`, `ZoneEnded`, `TransitionStarted`, `Halfway`, `Completed`, `Paused`, `Resumed`, `Cancelled`.

### Pause / Resume

On pause: `remainingMsAtPause = phaseEnd - now`. On resume: `phaseEnd = now + remainingMsAtPause`. The saved `pausedState` is restored.

---

## MouthView (`src/MouthView.ts`)

### Rendering setup

- `THREE.WebGLRenderer` with `antialias: true`, `pixelRatio = min(devicePixelRatio, 2)`
- `THREE.PerspectiveCamera` FOV 40°
- Animation loop via `renderer.setAnimationLoop()`
- Resize handled by `window.addEventListener('resize')`

### Lighting

```
AmbientLight    #fff8f0  0.65   warm white
DirectionalLight  #ffffff  1.1   key (2, 8, 12)
DirectionalLight  #b0c8ff  0.35  fill (-6, 4, 8)
DirectionalLight  #ffffff  0.20  rim (0, -6, -10)
```

### Tooth materials

```typescript
// Default (unlit)
MeshStandardMaterial { color: 0xf5f0e8, roughness: 0.30, metalness: 0.05 }

// Gum
MeshStandardMaterial { color: 0xd9768a, roughness: 0.75 }

// Active zone
color: 0x00e676, emissive: 0x007744, emissiveIntensity: 0.35

// Upcoming (blinks 300 ms)
color: 0xffab00 | 0x666644

// Completed
color: 0x90caf9
```

### Camera tween system

```typescript
interface Tween {
  fromPos, fromLook: THREE.Vector3
  toPos, toLook: THREE.Vector3
  startTime: number   // performance.now()
  duration: number    // ms
}
```

Each `frame()` call:
1. If tween active: interpolate `pos` and `lookAt` using `easeInOutCubic(elapsed / duration)`
2. Apply manual offsets on top of interpolated base
3. Camera `lookAt` updated every frame

**Manual offsets** (applied in `applyManualOffsets`):
- Zoom: scale distance from lookAt by `1 / manualZoom`
- Pan: translate both `pos` and `lookAt` along `right` and `up` vectors
- RotY: rotate `pos` around `lookAt` using `Matrix4.makeRotationY`

### Touch / pointer input

Attached only to `renderer.domElement`. Events stop-propagate to prevent bubbling to UI layer.

```
pointerdown  → record pointer; if 2 pointers, init pinch baseline
pointermove  → 1 pointer: update rotY; 2 pointers: update zoom + pan
pointerup    → remove pointer
wheel        → update zoom
```

Reset View button: separate `<button>` element appended to container div. Its `pointerdown` calls `stopPropagation()` before `resetCamera()` to avoid the canvas handler capturing it.

---

## BrushingController (`src/BrushingController.ts`)

Owns the 100 ms `setInterval` tick loop. On each tick:

1. `sm.tick(performance.now())`
2. `sm.getEvents()` → `processEvents(events)`
3. `mouthView.updateState(data, protocol)` — repaints mesh colours
4. `onStateChange(data)` — updates UI countdown/label (only when state/zone/seconds change)

`processEvents` handles: zone TTS, `focusZone`, `playChime`, `pulse`, completion cleanup.

---

## Port Interfaces (`src/ports.ts`)

```typescript
VoicePort      { speak(text): Promise<void>; stop(): void }
SoundPort      { playChime(): void; playTick(): void }
HapticPort     { pulse(): void }
KeepAwakePort  { acquire(): Promise<void>; release(): Promise<void> }
SettingsStore  { load(): Promise<Settings>; save(s): Promise<void> }
```

Web implementations are in `adapters.ts`. Fake implementations (for unit tests) are in `ports.ts`.

---

## Settings Schema

```typescript
interface Settings {
  duration: number         // seconds (120–360)
  zoneMode: 8 | 12
  chewing: boolean         // default true (V2)
  voice: boolean
  sound: boolean
  countdownSound: boolean
  haptics: boolean
  cameraMode: 'auto' | 'manual'
  reducedAnimation: boolean
}
```

Stored in `localStorage` under key `clinic_settings`. Missing fields fall back to defaults on load.

---

## Android / Capacitor

Capacitor bridges the web app to a native Android `WebView`. The web bundle is copied to `android/app/src/main/assets/public/` by `npx cap sync`.

No custom Capacitor plugins are used — all APIs (speech synthesis, vibration, wake lock) are standard Web APIs available in Android WebView.

Build requirements: **Java 21** (Capacitor 8 uses `sourceCompatibility = JavaVersion.VERSION_21`).

---

## Testing Strategy

| Layer | Tool | What's tested |
|---|---|---|
| Protocol (unit) | Vitest | 28 teeth, 72 mappings, zone coverage, allocation math, state machine transitions |
| Camera/interaction (unit) | Vitest | camera constants, zone counts, limit bounds, timing independence |
| UI / lifecycle (E2E) | Playwright | start, pause, resume, background pause, settings, persistence |
| Screenshots | Playwright | visual captures of all zone views |

The state machine and protocol engine are pure TypeScript with no DOM or WebGL dependencies, making them fast and reliable to unit-test.

---

## Known Limitations

1. The 3D tooth geometry uses procedural box/cylinder primitives — anatomically categorised but not clinically accurate.
2. Gum meshes are open ribbons (non-watertight) because `trimesh.fix_normals()` requires `scipy`. Normals are recomputed by Three.js; visual quality is unaffected.
3. Playwright E2E tests require a running dev server (`npm run dev`) and a display (not headless-only) — they are not run in CI.
4. The release keystore (`android/app/toothbrush-clinic-release.keystore`) is not committed to git. Store it securely to publish updates.
