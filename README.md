# 🦷 Toothbrush Clinic

**A visually guided, step-by-step toothbrushing companion app.**

Toothbrush Clinic leads the user through a complete, medically adequate brushing routine using a live 3D mouth model that highlights the exact surface being brushed. All logic runs locally — no accounts, no cloud, no ads, no tracking.

---

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Download](#download)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Dental Protocol](#dental-protocol)
- [3D Model](#3d-model)
- [Camera System](#camera-system)
- [Development Setup](#development-setup)
- [Building for Android](#building-for-android)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Changelog](#changelog)
- [License](#license)

---

## Screenshots

Visual screenshots are captured during E2E Playwright tests and stored in `screenshots/`.

| View | Description |
|------|-------------|
| `00-initial.png` | Home screen |
| `upper_front_outer.png` | Outer front upper zone highlighted |
| `upper_right_chewing.png` | Chewing surface zone highlighted |
| `lower_right_inner.png` | Inner right lower zone |

---

## Features

| Feature | Detail |
|---------|--------|
| **Guided 3D visuals** | Procedurally generated GLB mouth model — 28 teeth, 72 addressable surfaces |
| **Zone-by-zone guidance** | Active zone highlighted in green; upcoming zone blinks amber |
| **Three-surface posterior** | Outer, inner, and chewing surfaces on all premolars and molars |
| **Smart camera** | Auto-frames the active brushing zone with a smooth 650 ms tween |
| **Manual camera** | Pinch-zoom, drag-rotate, two-finger pan — all clamped to safe limits |
| **Reset View** | One-tap return to the default centred view |
| **Duration presets** | 2, 3, 4, 5, or 6 minutes |
| **Zone modes** | 12-zone (separate left/right/front) or 8-zone (full quadrants) |
| **Chewing surface toggle** | On by default; adds 4 chewing zones to the routine |
| **Voice instructions** | Each zone announced via Web Speech API |
| **Sound effects** | Chime on zone completion, tick during final countdown |
| **Haptics** | 50 ms vibration pulse on zone change |
| **Screen wake lock** | Screen stays on during brushing |
| **Background auto-pause** | Session pauses when the app goes to background |
| **Local persistence** | Settings stored in `localStorage` — no cloud required |
| **Parent gate** | Simple maths gate protects settings from children |
| **Privacy-first** | Zero analytics, zero tracking, zero network requests during use |

---

## Download

| Build | File | Size |
|-------|------|------|
| Release (signed) | [`toothbrush-clinic-release-v2.apk`](./toothbrush-clinic-release-v2.apk) | ~3.3 MB |
| Debug | [`toothbrush-clinic-debug.apk`](./toothbrush-clinic-debug.apk) | ~4.2 MB |

Install the release APK directly on Android (enable **Install unknown apps** in Settings for your file manager or browser).

> Minimum Android version: **API 24 (Android 7.0 Nougat)**

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend language | TypeScript |
| Bundler | Vite 8 |
| 3D rendering | Three.js 0.186 (`GLTFLoader`) |
| 3D model generation | Python 3 + trimesh (MIT) |
| Unit tests | Vitest 5 |
| E2E / screenshot tests | Playwright 1.64 |
| Android packaging | Capacitor 8 |
| Android build | Gradle 8.14 / AGP, compileSdk 36, minSdk 24 |
| Java toolchain | OpenJDK 21 |

---

## Architecture Overview

```
src/
├── main.ts                  UI bootstrap, screen transitions, settings management
├── MouthView.ts             Three.js renderer + camera system + touch input
├── MouthManifest.ts         Map of 72 surface IDs → GLB mesh names
├── BrushingController.ts    Orchestrates SM events → view + audio + haptics
├── ports.ts                 Interface definitions (voice, sound, haptics, wake, settings)
├── adapters.ts              Web/localStorage implementations of all ports
└── protocol/
    ├── anatomy.ts           28 tooth IDs, arch and posterior groupings
    ├── zones.ts             12-zone, 8-zone, and chewing zone definitions
    ├── allocation.ts        Duration allocation + protocol validation
    └── StateMachine.ts      Deadline-based session state machine
```

### Data flow

```
User taps "Start"
  → createAutoProtocol()          allocates time across zones
  → BrushingController.start()    acquires wake lock, starts 10 Hz tick loop
      → StateMachine.tick()       advances phase deadlines
      → processEvents()           fires zone/completion events
          → MouthView.focusZone() smooth camera tween to zone
          → MouthView.updateState() repaints highlighted teeth
          → VoicePort.speak()     TTS instruction
          → HapticPort.pulse()    vibration on zone change
          → SoundPort.playChime() chime on zone completion
```

---

## Dental Protocol

### Tooth anatomy

28 permanent teeth (no wisdom teeth), identified by position:

```
Upper right → ur_ci  ur_li  ur_c  ur_pm1  ur_pm2  ur_m1  ur_m2
Upper left  → ul_ci  ul_li  ul_c  ul_pm1  ul_pm2  ul_m1  ul_m2
Lower right → lr_ci  lr_li  lr_c  lr_pm1  lr_pm2  lr_m1  lr_m2
Lower left  → ll_ci  ll_li  ll_c  ll_pm1  ll_pm2  ll_m1  ll_m2

Legend: ci=central incisor  li=lateral incisor  c=canine
        pm1/pm2=premolars   m1/m2=molars
```

### Surface coverage

| Surface type | Count | Teeth |
|---|---|---|
| Outer (buccal/labial) | 28 | All teeth |
| Inner (lingual/palatal) | 28 | All teeth |
| Chewing (occlusal) | 16 | Premolars + molars only |
| **Total** | **72** | — |

### Zone modes

**12-zone mode** (default):
```
Zones 1–6   Outer surfaces: upper-right, upper-front, upper-left,
                             lower-right, lower-front, lower-left
Zones 7–12  Inner surfaces: same order
Zones 13–16 Chewing surfaces (when enabled): upper-right, upper-left,
                                              lower-left, lower-right
```

**8-zone mode**:
```
Zones 1–4   Outer surfaces: upper-right quadrant, upper-left,
                             lower-right, lower-left
Zones 5–8   Inner surfaces: same order
Zones 9–12  Chewing surfaces (when enabled)
```

### Duration allocation

Total brushing time is divided evenly across all active zones. Remainder seconds are distributed one-per-zone to the first zones.

Example — 2 minutes, 12-zone + chewing (16 zones):
```
120 s ÷ 16 zones = 7 s base + 8 zones get 8 s = 120 s total ✓
```

Constraints: minimum 5 s per zone, maximum 120 s per zone, maximum 900 s total.

---

## 3D Model

### Generation

The model is **procedurally generated from scratch** using Python + trimesh. No external dental assets are used.

```bash
# Regenerate the model
cd toothbrush-clinic
venv/bin/python scripts/create_mouth_v2.py
# → writes public/mouth.glb
```

Script: [`scripts/create_mouth_v2.py`](./scripts/create_mouth_v2.py)

### Model contents

| Mesh name pattern | Count | Description |
|---|---|---|
| `<tooth_id>_outer` | 28 | Buccal/labial surface half |
| `<tooth_id>_inner` | 28 | Lingual/palatal surface half |
| `<tooth_id>_chewing` | 16 | Occlusal surface (posteriors only) |
| `gum_upper` | 1 | Upper gum arch ribbon (cosmetic) |
| `gum_lower` | 1 | Lower gum arch ribbon (cosmetic) |
| **Total** | **74** | 72 manifest-addressable + 2 cosmetic |

### Tooth shapes

| Type | Shape | Cusps |
|---|---|---|
| Central incisor (`ci`) | Flat rectangular wedge | None |
| Lateral incisor (`li`) | Narrower wedge | None |
| Canine (`c`) | Taller body with pointed tip | 1 (tip) |
| Premolar (`pm1`, `pm2`) | Box with 2 buccal/lingual cusps | 2 |
| Molar (`m1`, `m2`) | Wide rectangular block | 4 (2×2 grid) |

### License

Generated programmatically using trimesh (MIT). No third-party dental model assets. © Toothbrush Clinic project, MIT.

**File:** `public/mouth.glb` — **79 KB**

---

## Camera System

### Default view

| Property | Value |
|---|---|
| Position | `(0, 0.15, 14)` |
| Look-at | `(0, 0, 0)` |
| FOV | 40° |
| Background | Dark navy `#0d1b2a` |

Upper arch is above (`y ≈ +1.4`), lower below (`y ≈ −1.4`). Anatomical right is screen right. Full arch visible without clipping.

### Automatic zone framing

When a new brushing zone starts, the camera smoothly tweens to a predefined `CameraTarget` for that zone:

- **Duration:** 650 ms (0 ms if `reducedMotion` is enabled)
- **Easing:** `easeInOutCubic`
- **Interruption:** A new zone arrival immediately replaces the in-progress tween
- **Protocol timing:** Camera tweens run entirely outside the state machine — they never delay or extend brushing time

Zone camera positions:

| Zone class | Camera angle |
|---|---|
| Outer zones | Frontal-buccal, slightly elevated |
| Inner zones | Palatal/lingual side (behind arch, `z < 0`) |
| Chewing zones | Top-down from above/below (`y = ±8`) |

### Manual controls

| Gesture | Action | Limit |
|---|---|---|
| Single-finger drag | Y-axis rotation | ±10° |
| Two-finger pinch | Zoom in/out | 0.70×–1.50× |
| Two-finger pan | Pan X/Y | ±1.8 / ±1.4 world units |
| Mouse wheel | Zoom | same |
| Reset View button | Restore default | — |

All gestures are captured **only on the Three.js canvas** via `setPointerCapture`. UI buttons (Pause, Resume, Exit) are never hijacked.

---

## Development Setup

### Prerequisites

- Node.js ≥ 18
- Python 3.12 + trimesh (for model regeneration only)
- Java 21 + Android SDK (for Android builds only)

### Web development

```bash
git clone https://github.com/tumesh007/toothbrush-clinic
cd toothbrush-clinic
npm install
npm run dev        # http://localhost:5173
```

### Run unit tests

```bash
npx vitest run     # 96 tests, 4 suites
```

### Run E2E tests (requires running dev server)

```bash
npm run dev &
npx playwright test
```

### Regenerate the 3D mouth model

```bash
python3 -m venv venv
venv/bin/pip install trimesh numpy
venv/bin/python scripts/create_mouth_v2.py
# → public/mouth.glb  (79 KB, 74 nodes)
```

---

## Building for Android

### Prerequisites

| Tool | Version |
|---|---|
| Java (JDK) | **21** (required — Capacitor uses Java 21 source level) |
| Android SDK | compileSdk **36**, buildTools **36.0.0** |
| Gradle | 8.14.3 (downloaded automatically by wrapper) |

#### Install Android SDK (headless)

```bash
# 1. Download cmdline-tools from https://developer.android.com/studio#command-tools
mkdir -p ~/android-sdk/cmdline-tools
unzip commandlinetools-linux-*.zip
mv cmdline-tools ~/android-sdk/cmdline-tools/latest

# 2. Set environment variables
export ANDROID_HOME=~/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

# 3. Accept licenses and install packages
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

### Debug build

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
# Copied to: toothbrush-clinic-debug.apk
```

### Release build (signed)

```bash
# 1. Generate a keystore (one-time)
keytool -genkeypair \
  -keystore android/app/toothbrush-clinic-release.keystore \
  -alias toothbrush-clinic -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <YOUR_PASSWORD> -keypass <YOUR_PASSWORD> \
  -dname "CN=Your Name, O=Your Org, C=IN"

# 2. Build release variant
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease

# 3. Sign with apksigner
$ANDROID_HOME/build-tools/36.0.0/apksigner sign \
  --ks android/app/toothbrush-clinic-release.keystore \
  --ks-key-alias toothbrush-clinic \
  --ks-pass pass:<YOUR_PASSWORD> \
  --key-pass pass:<YOUR_PASSWORD> \
  --out toothbrush-clinic-release-v2.apk \
  android/app/build/outputs/apk/release/app-release-unsigned.apk
```

> ⚠️ Keep your keystore file safe. You need the same keystore to publish updates to the same install.

### App identity

| Property | Value |
|---|---|
| Application ID | `com.example.toothbrushclinic` |
| Version name | `1.0` |
| Version code | `1` |
| Min SDK | API 24 (Android 7.0) |
| Target SDK | API 36 (Android 16) |

---

## Testing

### Unit tests (Vitest)

```
src/__tests__/manifest.test.ts          3 tests  — 72 surface mappings, 28 teeth, 16 posteriors
src/__tests__/camera-interaction.test.ts  34 tests  — camera constants, zone coverage, limits, timing
src/protocol/__tests__/protocol.test.ts   51 tests  — zones, allocation, validation, presets
src/protocol/__tests__/StateMachine.test.ts  8 tests  — state machine transitions
────────────────────────────────────────────────────────
Total                                   96 tests  ✓ all pass
```

Run:
```bash
npx vitest run
```

### E2E tests (Playwright)

- `test-integration.spec.ts` — app lifecycle, settings, persistence, background pause
- `test-spike.spec.ts` — screenshot capture of all zone views

Run:
```bash
npx playwright test
```

---

## Project Structure

```
toothbrush-clinic/
├── src/
│   ├── main.ts                    App bootstrap + UI screens
│   ├── MouthView.ts               3D renderer, camera, touch input
│   ├── MouthManifest.ts           72 surface ID → mesh name map
│   ├── BrushingController.ts      Session orchestration
│   ├── ports.ts                   Port interfaces + fakes
│   ├── adapters.ts                Web adapter implementations
│   └── protocol/
│       ├── anatomy.ts             Tooth IDs and groupings
│       ├── zones.ts               Zone definitions (12, 8, chewing)
│       ├── allocation.ts          Duration allocation + validation
│       └── StateMachine.ts        Session state machine
├── scripts/
│   ├── create_mouth_v2.py         V2 model generator (anatomic teeth + gums)
│   └── create_mouth.py            V1 model generator (reference)
├── public/
│   └── mouth.glb                  Procedural 3D mouth model (79 KB)
├── android/                       Capacitor Android project
│   └── app/
│       ├── build.gradle           App build config
│       └── toothbrush-clinic-release.keystore  (not in git — generate locally)
├── screenshots/                   E2E test screenshots
├── toothbrush-clinic-debug.apk    Latest debug build
├── toothbrush-clinic-release-v2.apk  Latest signed release build
├── index.html                     App entry point
├── vite.config.ts                 Vite + Vitest config
├── capacitor.config.json          Capacitor config
├── package.json                   Dependencies
└── README.md                      This file
```

---

## Changelog

### V2 — `feature/v2-3d-mouth-camera` (current)

**3D Model**
- Regenerated `public/mouth.glb` using `scripts/create_mouth_v2.py`
- Anatomically distinct tooth types: incisors (flat wedge), canines (pointed tip), premolars (2 cusps), molars (4-cusp 2×2 grid)
- Added upper and lower gum arch meshes (pink, cosmetic)
- File size reduced from 603 KB → **79 KB**

**Camera System**
- Replaced no-op `focusZone()` / `resetCamera()` stubs with fully functional implementation
- 24 predefined `CameraTarget` positions (outer, inner, chewing for all zones)
- 650 ms `easeInOutCubic` tween; instant when `reducedMotion` enabled
- Manual pan / zoom / rotation with hard clamping
- "Reset View" button appears only after manual adjustment
- `setCameraMode()` and `setReducedMotion()` now functional

**Touch Interaction**
- Canvas-only pointer capture via `setPointerCapture` — UI buttons never intercepted
- Single-finger rotate, two-finger pinch-zoom and pan
- Desktop mouse wheel zoom

**Tests**
- Added 34 new unit tests (`camera-interaction.test.ts`)
- Fixed pre-existing Vitest issue (Playwright specs excluded via `vite.config.ts`)
- Total: 96 tests, 4 suites, 100% pass

**Build**
- Debug APK: `toothbrush-clinic-debug.apk` (4.2 MB)
- Release APK: `toothbrush-clinic-release-v2.apk` (3.3 MB, signed)
- Toolchain: Java 21, Android SDK 36, Gradle 8.14

### V1 — `master`

- Initial working release
- Procedural 3D mouth (icosphere-based, 603 KB)
- Full brushing protocol engine (72 surfaces, 12/8 zones, chewing surfaces)
- 2–6 minute presets, voice, sound, haptics, wake lock, persistence
- Fixed camera (no zone framing)

---

## License

MIT — see [LICENSE](./LICENSE) for details.

The 3D mouth model is procedurally generated and is covered by the same MIT license.
No third-party dental model assets are used.
