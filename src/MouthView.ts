/**
 * MouthView.ts  –  V2 implementation
 *
 * Changes from V1:
 *  - Real focusZone() / resetCamera() with smooth GSAP-like tween (no external dep).
 *  - Manual pan / zoom / rotation clamped to safe limits.
 *  - Touch gestures isolated to the canvas; UI buttons remain independently tappable.
 *  - "Reset View" button rendered inside the 3D viewport.
 *  - setCameraMode() and setReducedMotion() are now functional.
 *  - Anatomically coloured material preset (ivory/enamel white, pink gums).
 *  - Separate gum mesh colouring detected by node name prefix "gum_".
 *
 * Camera coordinate notes:
 *  - Model centred at roughly (0, 0, 0). Upper arch at y≈+1.4, lower at y≈-1.4.
 *  - Default camera: pos (0, 0.15, 14) looking at (0, 0, 0), FOV 40°.
 *    This fits the full arch at ~17 units away with comfortable margin.
 *
 * Licence: Part of Toothbrush Clinic, MIT.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ZONES_12, ZONES_8, CHEWING_ZONES } from './protocol/zones';
import { MOUTH_MANIFEST, validateManifest } from './MouthManifest';

// ---------------------------------------------------------------------------
// Public interface (unchanged from V1 — BrushingController depends on this)
// ---------------------------------------------------------------------------
export interface MouthViewPort {
  updateState(data: any, protocol: any): void;
  highlightZone(zoneId: string): void;
  clearHighlight(): void;
  focusZone(zoneId: string): void;
  resetCamera(): void;
  setCameraMode(mode: 'auto' | 'manual'): void;
  setReducedMotion(reduced: boolean): void;
}

// ---------------------------------------------------------------------------
// Zone → mesh-name mapping (same as V1)
// ---------------------------------------------------------------------------
const ZONE_IDS_TO_PAIRS: Record<string, string[]> = {};
[...ZONES_12, ...ZONES_8, ...CHEWING_ZONES].forEach(z => {
  const pairs: string[] = [];
  z.toothIds.forEach(t => {
    z.surfaces.forEach(s => { pairs.push(`${t}_${s}`); });
  });
  ZONE_IDS_TO_PAIRS[z.id] = pairs;
});

// ---------------------------------------------------------------------------
// Camera target definitions per zone class
// ---------------------------------------------------------------------------
interface CameraTarget {
  pos: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/** Default (home) camera: centred, full arch visible, slight elevation. */
const DEFAULT_TARGET: CameraTarget = {
  pos:    new THREE.Vector3(0, 0.15, 14.0),
  lookAt: new THREE.Vector3(0, 0,     0),
};

/**
 * Map zone-id to a camera target.
 * Positions are tuned to the V2 model coordinate system.
 *   Upper arch centre  y≈ +1.4
 *   Lower arch centre  y≈ -1.4
 *   Arch depth         z  0 → -5.5
 *   Right side         x  > 0  (anatomical LEFT = screen RIGHT for patient facing viewer)
 */
const ZONE_CAMERA_TARGETS: Record<string, CameraTarget> = {
  // ---- 12-zone outer (front view, tilted slightly toward buccal) ----
  upper_right_outer:   { pos: new THREE.Vector3( 3.2,  1.8, 11.0), lookAt: new THREE.Vector3( 2.5,  1.4, -1.5) },
  upper_front_outer:   { pos: new THREE.Vector3( 0.0,  2.5, 12.5), lookAt: new THREE.Vector3( 0.0,  1.4,  0.0) },
  upper_left_outer:    { pos: new THREE.Vector3(-3.2,  1.8, 11.0), lookAt: new THREE.Vector3(-2.5,  1.4, -1.5) },
  lower_right_outer:   { pos: new THREE.Vector3( 3.2, -1.8, 11.0), lookAt: new THREE.Vector3( 2.5, -1.4, -1.5) },
  lower_front_outer:   { pos: new THREE.Vector3( 0.0, -2.5, 12.5), lookAt: new THREE.Vector3( 0.0, -1.4,  0.0) },
  lower_left_outer:    { pos: new THREE.Vector3(-3.2, -1.8, 11.0), lookAt: new THREE.Vector3(-2.5, -1.4, -1.5) },

  // ---- 12-zone inner (camera behind the arch — shifted to z < 0) ----
  upper_right_inner:   { pos: new THREE.Vector3( 3.0,  2.2, -9.5), lookAt: new THREE.Vector3( 2.5,  1.4, -1.5) },
  upper_front_inner:   { pos: new THREE.Vector3( 0.0,  2.8,-11.0), lookAt: new THREE.Vector3( 0.0,  1.4,  0.0) },
  upper_left_inner:    { pos: new THREE.Vector3(-3.0,  2.2, -9.5), lookAt: new THREE.Vector3(-2.5,  1.4, -1.5) },
  lower_right_inner:   { pos: new THREE.Vector3( 3.0, -2.2, -9.5), lookAt: new THREE.Vector3( 2.5, -1.4, -1.5) },
  lower_front_inner:   { pos: new THREE.Vector3( 0.0, -2.8,-11.0), lookAt: new THREE.Vector3( 0.0, -1.4,  0.0) },
  lower_left_inner:    { pos: new THREE.Vector3(-3.0, -2.2, -9.5), lookAt: new THREE.Vector3(-2.5, -1.4, -1.5) },

  // ---- chewing / occlusal (camera from above/below looking at occlusal surface) ----
  upper_right_chewing: { pos: new THREE.Vector3( 3.2,  8.0, -2.5), lookAt: new THREE.Vector3( 2.8,  1.4, -2.5) },
  upper_left_chewing:  { pos: new THREE.Vector3(-3.2,  8.0, -2.5), lookAt: new THREE.Vector3(-2.8,  1.4, -2.5) },
  lower_right_chewing: { pos: new THREE.Vector3( 3.2, -8.0, -2.5), lookAt: new THREE.Vector3( 2.8, -1.4, -2.5) },
  lower_left_chewing:  { pos: new THREE.Vector3(-3.2, -8.0, -2.5), lookAt: new THREE.Vector3(-2.8, -1.4, -2.5) },

  // ---- 8-zone outer ----
  q_upper_right_outer: { pos: new THREE.Vector3( 2.8,  1.6, 11.0), lookAt: new THREE.Vector3( 2.2,  1.2, -1.0) },
  q_upper_left_outer:  { pos: new THREE.Vector3(-2.8,  1.6, 11.0), lookAt: new THREE.Vector3(-2.2,  1.2, -1.0) },
  q_lower_right_outer: { pos: new THREE.Vector3( 2.8, -1.6, 11.0), lookAt: new THREE.Vector3( 2.2, -1.2, -1.0) },
  q_lower_left_outer:  { pos: new THREE.Vector3(-2.8, -1.6, 11.0), lookAt: new THREE.Vector3(-2.2, -1.2, -1.0) },

  // ---- 8-zone inner ----
  q_upper_right_inner: { pos: new THREE.Vector3( 2.8,  2.0, -9.0), lookAt: new THREE.Vector3( 2.2,  1.2, -1.0) },
  q_upper_left_inner:  { pos: new THREE.Vector3(-2.8,  2.0, -9.0), lookAt: new THREE.Vector3(-2.2,  1.2, -1.0) },
  q_lower_right_inner: { pos: new THREE.Vector3( 2.8, -2.0, -9.0), lookAt: new THREE.Vector3( 2.2, -1.2, -1.0) },
  q_lower_left_inner:  { pos: new THREE.Vector3(-2.8, -2.0, -9.0), lookAt: new THREE.Vector3(-2.2, -1.2, -1.0) },
};

// ---------------------------------------------------------------------------
// Simple easing tween (no external dependency)
// ---------------------------------------------------------------------------
interface Tween {
  fromPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  toPos: THREE.Vector3;
  toLook: THREE.Vector3;
  startTime: number;
  duration: number;  // ms
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Manual interaction limits
// ---------------------------------------------------------------------------
const ZOOM_MIN   = 0.70;   // ×  vs default distance
const ZOOM_MAX   = 1.50;
const PAN_LIMIT_X = 1.8;   // world units
const PAN_LIMIT_Y = 1.4;
const ROT_LIMIT  = THREE.MathUtils.degToRad(10); // radians

// ---------------------------------------------------------------------------
// MouthView
// ---------------------------------------------------------------------------
export class MouthView implements MouthViewPort {
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private meshes:   Record<string, THREE.Mesh> = {};

  // Visual state
  private completedMeshNames: Set<string> = new Set();
  private activeMeshNames:    Set<string> = new Set();
  private upcomingMeshNames:  Set<string> = new Set();
  private blinkState    = false;
  private lastBlinkTime = 0;

  // Camera state
  private cameraMode:     'auto' | 'manual' = 'auto';
  private reducedMotion:  boolean = false;
  private tween:          Tween | null = null;
  private currentTarget:  CameraTarget = { pos: DEFAULT_TARGET.pos.clone(), lookAt: DEFAULT_TARGET.lookAt.clone() };

  // Manual adjustment offsets  (applied on top of auto target)
  private manualPanX  = 0;   // world units
  private manualPanY  = 0;
  private manualZoom  = 1.0; // multiplier
  private manualRotY  = 0;   // radians (Y-axis rotation around lookAt)
  private userHasAdjusted = false;

  // Touch / pointer state
  private pointers: Map<number, {x: number; y: number}> = new Map();
  private lastPinchDist  = 0;
  private lastMidpoint   = {x: 0, y: 0};
  private panStartOffset = {x: 0, y: 0};

  // Reset button overlay
  private resetBtn: HTMLButtonElement | null = null;

  constructor(private container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1b2a);

    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
    this.camera.position.copy(DEFAULT_TARGET.pos);
    this.camera.lookAt(DEFAULT_TARGET.lookAt);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    const canvas = this.renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top      = '0';
    canvas.style.left     = '0';
    canvas.style.width    = '100%';
    canvas.style.height   = '100%';
    // Only capture touches on the canvas element itself
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    this.buildLighting();
    this.buildResetButton();
    this.loadModel();
    this.attachInputHandlers(canvas);

    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------------
  // MouthViewPort API
  // ---------------------------------------------------------------------------

  updateState(data: any, protocol: any): void {
    if (!protocol?.slots) return;

    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();

    const idx = data.currentZoneIndex;

    protocol.slots.forEach((slot: any, i: number) => {
      const names = (ZONE_IDS_TO_PAIRS[slot.id] || [])
        .map((p: string) => MOUTH_MANIFEST[p])
        .filter(Boolean);

      if (i < idx) {
        names.forEach((n: string) => this.completedMeshNames.add(n));
      } else if (i === idx) {
        names.forEach((n: string) => this.activeMeshNames.add(n));
      } else if (i === idx + 1) {
        if ((data.state === 'BRUSHING' && data.remainingSeconds <= 4) ||
            data.state === 'ZONE_TRANSITION') {
          names.forEach((n: string) => this.upcomingMeshNames.add(n));
        }
      }
    });

    this.applyVisuals();
  }

  /** Used by BrushingController – kept but effectively superseded by focusZone. */
  highlightZone(_zoneId: string): void {
    // Visual state is driven by updateState; nothing extra needed here.
  }

  clearHighlight(): void {
    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();
    Object.keys(this.meshes).forEach(n => this.completedMeshNames.add(n));
    this.applyVisuals();
  }

  focusZone(zoneId: string): void {
    if (this.cameraMode !== 'auto') return;
    const target = ZONE_CAMERA_TARGETS[zoneId] ?? DEFAULT_TARGET;
    this.startTween(target);
  }

  resetCamera(): void {
    this.manualPanX = 0;
    this.manualPanY = 0;
    this.manualZoom = 1.0;
    this.manualRotY = 0;
    this.userHasAdjusted = false;
    this.startTween(DEFAULT_TARGET);
    this.updateResetButtonVisibility();
  }

  setCameraMode(mode: 'auto' | 'manual'): void {
    this.cameraMode = mode;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  // ---------------------------------------------------------------------------
  // Internal: lighting
  // ---------------------------------------------------------------------------
  private buildLighting(): void {
    // Ambient — slightly warm to mimic dental examination light
    const ambient = new THREE.AmbientLight(0xfff8f0, 0.65);
    this.scene.add(ambient);

    // Key light — from slightly upper-front
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 8, 12);
    this.scene.add(key);

    // Fill light — slight blue tint from upper-left
    const fill = new THREE.DirectionalLight(0xb0c8ff, 0.35);
    fill.position.set(-6, 4, 8);
    this.scene.add(fill);

    // Rim / back light — subtle to give depth
    const rim = new THREE.DirectionalLight(0xffffff, 0.20);
    rim.position.set(0, -6, -10);
    this.scene.add(rim);
  }

  // ---------------------------------------------------------------------------
  // Internal: reset button overlay
  // ---------------------------------------------------------------------------
  private buildResetButton(): void {
    const btn = document.createElement('button');
    btn.id    = 'mouth-reset-view';
    btn.textContent = '⟳ Reset View';
    Object.assign(btn.style, {
      position:    'absolute',
      bottom:      '12px',
      right:       '12px',
      zIndex:      '20',
      padding:     '7px 13px',
      fontSize:    '13px',
      fontFamily:  'sans-serif',
      background:  'rgba(0,0,0,0.55)',
      color:       '#fff',
      border:      '1px solid rgba(255,255,255,0.35)',
      borderRadius:'6px',
      cursor:      'pointer',
      display:     'none',
      // Must be separately tappable — pointerEvents set to auto explicitly
      pointerEvents: 'auto',
      touchAction: 'manipulation',
    });
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();   // prevent canvas from capturing this as a pan/zoom gesture
      e.preventDefault();
      this.resetCamera();
    });
    this.container.appendChild(btn);
    this.resetBtn = btn;
  }

  private updateResetButtonVisibility(): void {
    if (!this.resetBtn) return;
    this.resetBtn.style.display = this.userHasAdjusted ? 'block' : 'none';
  }

  // ---------------------------------------------------------------------------
  // Internal: model loading
  // ---------------------------------------------------------------------------
  private loadModel(): void {
    const loader = new GLTFLoader();
    loader.load('./mouth.glb', (gltf) => {
      const availableNodes = new Set<string>();
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const isGum = mesh.name.startsWith('gum_');
          mesh.material = isGum
            ? new THREE.MeshStandardMaterial({
                color:     0xd9768a,  // gum pink
                roughness: 0.75,
                metalness: 0.0,
              })
            : new THREE.MeshStandardMaterial({
                color:     0xf5f0e8,  // enamel ivory
                roughness: 0.30,
                metalness: 0.05,
                envMapIntensity: 0.4,
              });
          availableNodes.add(mesh.name);
          this.meshes[mesh.name] = mesh;
        }
      });
      try {
        validateManifest(availableNodes);
      } catch (err) {
        console.error('[MouthView] Manifest validation failed:', err);
      }
      this.scene.add(gltf.scene);
      this.applyVisuals();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: rendering loop
  // ---------------------------------------------------------------------------
  private frame(): void {
    const now = performance.now();

    // Blink for upcoming zone (300 ms interval)
    if (now - this.lastBlinkTime > 300) {
      this.blinkState    = !this.blinkState;
      this.lastBlinkTime = now;
      this.applyVisuals();
    }

    // Advance camera tween
    if (this.tween) {
      const elapsed = now - this.tween.startTime;
      const t = Math.min(elapsed / this.tween.duration, 1.0);
      const e = easeInOutCubic(t);

      // Interpolate base position / lookAt
      const basePos  = new THREE.Vector3().lerpVectors(this.tween.fromPos,  this.tween.toPos,  e);
      const baseLook = new THREE.Vector3().lerpVectors(this.tween.fromLook, this.tween.toLook, e);

      this.applyManualOffsets(basePos, baseLook);

      if (t >= 1.0) {
        this.tween = null;
        this.currentTarget = {
          pos:    this.tween ? this.tween.toPos.clone()  : basePos.clone(),
          lookAt: this.tween ? this.tween.toLook.clone() : baseLook.clone(),
        };
      }
    } else {
      // No active tween — apply current target + manual offsets every frame
      const basePos  = this.currentTarget.pos.clone();
      const baseLook = this.currentTarget.lookAt.clone();
      this.applyManualOffsets(basePos, baseLook);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Apply manual pan/zoom/rotation on top of a base camera position. */
  private applyManualOffsets(basePos: THREE.Vector3, baseLook: THREE.Vector3): void {
    // Direction from camera to lookAt
    const forward = baseLook.clone().sub(basePos).normalize();
    const right   = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up      = new THREE.Vector3().crossVectors(right, forward).normalize();

    // Zoom: scale distance from lookAt
    const dist = basePos.distanceTo(baseLook);
    const zoomedDist = dist / this.manualZoom;

    // Start from lookAt, move back along -forward by zoomedDist
    let pos = baseLook.clone().sub(forward.clone().multiplyScalar(zoomedDist));

    // Pan: translate both pos and lookAt
    const panOffset = right.clone().multiplyScalar(this.manualPanX)
      .add(up.clone().multiplyScalar(this.manualPanY));
    pos.add(panOffset);
    const lookAt = baseLook.clone().add(panOffset);

    // Rotation: rotate pos around lookAt (Y axis)
    if (this.manualRotY !== 0) {
      const relPos = pos.clone().sub(lookAt);
      const rotM = new THREE.Matrix4().makeRotationY(this.manualRotY);
      relPos.applyMatrix4(rotM);
      pos = lookAt.clone().add(relPos);
    }

    this.camera.position.copy(pos);
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------
  // Internal: camera tweening
  // ---------------------------------------------------------------------------
  private startTween(target: CameraTarget): void {
    const duration = this.reducedMotion ? 0 : 650; // ms

    // Start from wherever the camera actually is now
    const fromPos  = this.camera.position.clone();
    // Reconstruct current lookAt from camera direction
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const fromLook = fromPos.clone().add(dir.multiplyScalar(10));

    this.tween = {
      fromPos,
      fromLook,
      toPos:    target.pos.clone(),
      toLook:   target.lookAt.clone(),
      startTime: performance.now(),
      duration,
    };
    this.currentTarget = { pos: target.pos.clone(), lookAt: target.lookAt.clone() };
  }

  // ---------------------------------------------------------------------------
  // Internal: visuals / highlighting
  // ---------------------------------------------------------------------------
  private applyVisuals(): void {
    Object.values(this.meshes).forEach(mesh => {
      // Skip gum meshes from highlighting — keep them pink
      if (mesh.name.startsWith('gum_')) return;

      const mat  = mesh.material as THREE.MeshStandardMaterial;
      const name = mesh.name;

      if (this.activeMeshNames.has(name)) {
        mat.wireframe         = false;
        mat.color.setHex(0x00e676);    // bright green
        mat.opacity           = 1.0;
        mat.transparent       = false;
        mat.emissive.setHex(0x007744);
        mat.emissiveIntensity = 0.35;
        mat.roughness         = 0.25;
      } else if (this.upcomingMeshNames.has(name)) {
        mat.wireframe         = false;
        mat.color.setHex(this.blinkState ? 0xffab00 : 0x666644);
        mat.opacity           = 0.90;
        mat.transparent       = true;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.roughness         = 0.40;
      } else if (this.completedMeshNames.has(name)) {
        mat.wireframe         = false;
        mat.color.setHex(0x90caf9);    // light blue — done
        mat.opacity           = 1.0;
        mat.transparent       = false;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.roughness         = 0.30;
      } else {
        // Default / not-yet: enamel ivory
        mat.wireframe         = false;
        mat.color.setHex(0xf5f0e8);
        mat.opacity           = 1.0;
        mat.transparent       = false;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.roughness         = 0.30;
      }
      mat.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: resize
  // ---------------------------------------------------------------------------
  private onResize(): void {
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------------------------------------------------------------------------
  // Internal: input handling (touch + mouse)
  //
  // Strategy:
  //  - Attach only to the renderer canvas (not document).
  //  - On first pointer contact:  record pointer
  //  - Two-pointer:  pinch = zoom, midpoint delta = pan
  //  - One-pointer:  drag = rotation (Y axis)
  //  - All events stopPropagation() so they do NOT bubble to UI buttons.
  //
  // Clamping:
  //  - zoom clamped to [ZOOM_MIN, ZOOM_MAX]
  //  - pan  clamped to ±PAN_LIMIT_X / ±PAN_LIMIT_Y
  //  - rotY clamped to ±ROT_LIMIT
  // ---------------------------------------------------------------------------

  private attachInputHandlers(canvas: HTMLElement): void {
    canvas.addEventListener('pointerdown',  (e) => this.onPointerDown(e as PointerEvent),  { passive: false });
    canvas.addEventListener('pointermove',  (e) => this.onPointerMove(e as PointerEvent),  { passive: false });
    canvas.addEventListener('pointerup',    (e) => this.onPointerUp(e as PointerEvent),    { passive: false });
    canvas.addEventListener('pointercancel',(e) => this.onPointerUp(e as PointerEvent),    { passive: false });
    // Desktop scroll wheel zoom
    canvas.addEventListener('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
  }

  private onPointerDown(e: PointerEvent): void {
    // Do not capture pointer if the reset button was the target — let it handle it.
    if ((e.target as HTMLElement).id === 'mouth-reset-view') return;

    e.preventDefault();
    e.stopPropagation();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (this.pointers.size === 2) {
      this.lastPinchDist = this.getPinchDistance();
      this.lastMidpoint  = this.getPinchMidpoint();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();

    const prev = this.pointers.get(e.pointerId)!;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1) {
      // Single finger / mouse drag → rotation around Y
      const rotSensitivity = 0.004;
      this.manualRotY = THREE.MathUtils.clamp(
        this.manualRotY + dx * rotSensitivity,
        -ROT_LIMIT, ROT_LIMIT
      );
      this.markUserAdjusted();
    } else if (this.pointers.size === 2) {
      // Two fingers → pinch-zoom + pan
      const newDist = this.getPinchDistance();
      if (this.lastPinchDist > 0) {
        const zoomFactor = newDist / this.lastPinchDist;
        this.manualZoom = THREE.MathUtils.clamp(
          this.manualZoom * zoomFactor,
          ZOOM_MIN, ZOOM_MAX
        );
      }
      this.lastPinchDist = newDist;

      const newMid = this.getPinchMidpoint();
      const panSensitivity = 0.015;
      this.manualPanX = THREE.MathUtils.clamp(
        this.manualPanX - (newMid.x - this.lastMidpoint.x) * panSensitivity,
        -PAN_LIMIT_X, PAN_LIMIT_X
      );
      this.manualPanY = THREE.MathUtils.clamp(
        this.manualPanY + (newMid.y - this.lastMidpoint.y) * panSensitivity,
        -PAN_LIMIT_Y, PAN_LIMIT_Y
      );
      this.lastMidpoint = newMid;
      this.markUserAdjusted();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    e.stopPropagation();
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = 0;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    this.manualZoom = THREE.MathUtils.clamp(
      this.manualZoom * (1 + delta),
      ZOOM_MIN, ZOOM_MAX
    );
    this.markUserAdjusted();
  }

  private markUserAdjusted(): void {
    this.userHasAdjusted = true;
    this.updateResetButtonVisibility();
  }

  private getPinchDistance(): number {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPinchMidpoint(): { x: number; y: number } {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return { x: 0, y: 0 };
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }
}
