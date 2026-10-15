# Toothbrush Clinic

Toothbrush Clinic is a visually guided, step-by-step toothbrushing companion application. Built as an MVP, it features an interactive 3D mouth model that directs the user to brush specific quadrants and surfaces of their teeth for a medically adequate duration.

## Features

- **Guided 3D Visuals:** A procedurally generated 3D mouth model (`.glb`) mapping precisely to 28 permanent teeth across 72 unique inner, outer, and chewing surfaces.
- **Strict Protocol Engine:** Customizable brushing routines based on the user's selected mode (8 zones or 12 zones) and chewing surface preference.
- **Session State Machine:** A robust, deadline-based brushing lifecycle engine handling pauses, interruptions, and countdowns accurately.
- **Web & Android Ready:** Built with Vite and Three.js for the web, and packaged for Android using Capacitor.
- **Local Persistence:** All settings (duration, modes, sound, and haptic preferences) are saved locally without needing any cloud backend or account creation.
- **No Analytics / No Ads:** A calm, tracking-free, privacy-first offline experience.

### V2 mouth camera

Automatic mode frames the mapped teeth for each brushing zone using the loaded GLB mesh bounds. In Settings, Manual camera controls turn off automatic zone framing; drag on the mouth to rotate, use Shift+drag on desktop to pan, and pinch or use the wheel to zoom. Camera gestures are attached to the 3D canvas, so the UI controls remain tappable. Zoom is limited to 0.90–1.35×, rotation to ±8°, and pan is bounded. Reset View returns to the whole-mouth view. Reduce camera motion applies zone framing immediately.

The camera controls are unit tested; this environment has no `adb` executable or connected Android device, so Android runtime interaction has not been tested.

## Technology Stack

- **Frontend:** HTML, TypeScript, Vite
- **3D Rendering:** Three.js (`GLTFLoader`)
- **Testing:** Vitest (Unit), Playwright (E2E/Visual Integration)
- **Android App:** Capacitor
- **Model Generation:** Python (`trimesh`)

## Development Setup

### Web

To start the local web development server:

```bash
npm install
npm run dev
```

To build for production:

```bash
npm run build
npm run preview
```

### Android

The project uses Capacitor to generate an Android project.

```bash
# Sync latest web build to Android project
npx cap sync android

# Open Android Studio
npx cap open android
```

To build the APK from the command line (requires Android SDK and Java):

```bash
cd android
./gradlew assembleDebug
# The APK will be output to: android/app/build/outputs/apk/debug/app-debug.apk
```

## Testing

The project has strict tests covering the state machine, protocol allocation, node manifest mappings, and Playwright UI tests for the app lifecycle.

```bash
# Run unit tests
npm test

# Run end-to-end UI tests (the Vite server on port 5173 must be running)
npm run test:e2e
```

## License

MIT
