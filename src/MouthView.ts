import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ZONES_12, ZONES_8, CHEWING_ZONES } from './protocol/zones';
import { MOUTH_MANIFEST, validateManifest } from './MouthManifest';

export interface MouthViewPort {
  updateState(data: any, protocol: any): void;
  highlightZone(zoneId: string): void;
  clearHighlight(): void;
  focusZone(zoneId: string): void;
  resetCamera(): void;
  setCameraMode(mode: 'auto' | 'manual'): void;
  setReducedMotion(reduced: boolean): void;
}

// Map zone id → list of mesh names in that zone
const ZONE_IDS_TO_PAIRS: Record<string, string[]> = {};
[...ZONES_12, ...ZONES_8, ...CHEWING_ZONES].forEach(z => {
  const pairs: string[] = [];
  z.toothIds.forEach(t => {
    z.surfaces.forEach(s => { pairs.push(`${t}_${s}`); });
  });
  ZONE_IDS_TO_PAIRS[z.id] = pairs;
});

export class MouthView implements MouthViewPort {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private meshes: Record<string, THREE.Mesh> = {};
  private cameraMode: 'auto' | 'manual' = 'auto';
  private reducedMotion = false;
  private readonly defaultPosition = new THREE.Vector3(0, 2, 22);
  private readonly defaultTarget = new THREE.Vector3(0, 0, -1);
  private target = this.defaultTarget.clone();
  private targetDestination = this.defaultTarget.clone();
  private destination = this.defaultPosition.clone();
  private basePosition = this.defaultPosition.clone();
  private transitionStarted = 0;
  private transitionFrom = this.defaultPosition.clone();
  private transitionTargetFrom = this.defaultTarget.clone();
  private zoom = 1;
  private yaw = 0;
  private pitch = 0;
  private pan = new THREE.Vector2();

  private completedMeshNames: Set<string> = new Set();
  private activeMeshNames:   Set<string> = new Set();
  private upcomingMeshNames: Set<string> = new Set();

  private blinkState    = false;
  private lastBlinkTime = 0;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1b2a); // dark navy — mouth interior feel

    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    // Fixed camera — whole jaw always visible, slightly elevated
    this.camera.position.copy(this.defaultPosition);
    this.camera.lookAt(this.defaultTarget);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);

    const canvas = this.renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top      = '0';
    canvas.style.left     = '0';
    canvas.style.width    = '100%';
    canvas.style.height   = '100%';
    canvas.style.touchAction = 'none';
    this.attachGestures(canvas);
    container.appendChild(canvas);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(0, 10, 15);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(0, -5, 10);
    this.scene.add(fill);

    // Load model
    const loader = new GLTFLoader();
    loader.load('/mouth.glb', (gltf) => {
      const availableNodes = new Set<string>();
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            wireframe: false,
            roughness: 0.4,
            metalness: 0.0,
          });
          availableNodes.add(mesh.name);
          this.meshes[mesh.name] = mesh;
        }
      });
      try {
        validateManifest(availableNodes);
      } catch (err) {
        console.error(err);
      }
      this.scene.add(gltf.scene);
      this.applyVisuals(); // paint default state immediately
    });

    // Resize handler
    window.addEventListener('resize', () => {
      const rw = container.clientWidth  || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
    });

    this.renderer.setAnimationLoop(() => {
      this.tick();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private tick() {
    if (this.transitionStarted) {
      const t = Math.min(1, (performance.now() - this.transitionStarted) / 650);
      const eased = t * t * (3 - 2 * t);
      this.basePosition.lerpVectors(this.transitionFrom, this.destination, eased);
      this.target.lerpVectors(this.transitionTargetFrom, this.targetDestination, eased);
      if (t === 1) this.transitionStarted = 0;
    }
    this.applyCameraTransform();
    const now = performance.now();
    if (now - this.lastBlinkTime > 300) {
      this.blinkState    = !this.blinkState;
      this.lastBlinkTime = now;
      this.applyVisuals();
    }
  }

  // Called every 100 ms by BrushingController
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
        // Blink the NEXT zone only in the last 4 seconds of the current zone
        if ((data.state === 'BRUSHING' && data.remainingSeconds <= 4) ||
             data.state === 'ZONE_TRANSITION') {
          names.forEach((n: string) => this.upcomingMeshNames.add(n));
        }
      }
    });

    this.applyVisuals();
  }

  private applyVisuals() {
    Object.values(this.meshes).forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const name = mesh.name;

      if (this.activeMeshNames.has(name)) {
        // Currently brushing — solid bright green
        mat.wireframe   = false;
        mat.color.setHex(0x00e676);
        mat.opacity     = 1.0;
        mat.transparent = false;
        mat.emissive.setHex(0x00aa44);
        mat.emissiveIntensity = 0.3;
      } else if (this.upcomingMeshNames.has(name)) {
        // About to be brushed — blink amber
        mat.wireframe   = false;
        mat.color.setHex(this.blinkState ? 0xffab00 : 0x555555);
        mat.opacity     = 0.9;
        mat.transparent = true;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      } else if (this.completedMeshNames.has(name)) {
        // Done — filled blue-white
        mat.wireframe   = false;
        mat.color.setHex(0x90caf9);
        mat.opacity     = 1.0;
        mat.transparent = false;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      } else {
        // Not yet — dim outline
        mat.wireframe   = true;
        mat.color.setHex(0x555577);
        mat.opacity     = 0.6;
        mat.transparent = true;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  }

  highlightZone(_zoneId: string): void {}
  focusZone(zoneId: string): void {
    if (this.cameraMode !== 'auto') return;
    const names = (ZONE_IDS_TO_PAIRS[zoneId] || []).map(key => MOUTH_MANIFEST[key]).filter(Boolean);
    const bounds = new THREE.Box3();
    names.forEach(name => { const mesh = this.meshes[name]; if (mesh) bounds.expandByObject(mesh); });
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    this.transitionFrom.copy(this.basePosition);
    this.transitionTargetFrom.copy(this.target);
    this.targetDestination.copy(center);
    this.destination.copy(center).add(new THREE.Vector3(0, 0.4, 8));
    this.zoom = 1;
    this.pan.set(0, 0); this.yaw = 0; this.pitch = 0;
    if (this.reducedMotion) { this.basePosition.copy(this.destination); this.target.copy(this.targetDestination); this.transitionStarted = 0; }
    else this.transitionStarted = performance.now();
  }
  resetCamera(): void {
    this.transitionFrom.copy(this.basePosition);
    this.transitionTargetFrom.copy(this.target);
    this.targetDestination.copy(this.defaultTarget);
    this.destination.copy(this.defaultPosition);
    this.zoom = 1; this.pan.set(0, 0); this.yaw = 0; this.pitch = 0;
    if (this.reducedMotion) { this.basePosition.copy(this.destination); this.target.copy(this.targetDestination); this.transitionStarted = 0; }
    else this.transitionStarted = performance.now();
  }
  setCameraMode(mode: 'auto' | 'manual'): void { this.cameraMode = mode; }
  setReducedMotion(reduced: boolean): void { this.reducedMotion = reduced; }

  private applyCameraTransform(): void {
    const boundedYaw = THREE.MathUtils.clamp(this.yaw, -0.1396, 0.1396);
    const boundedPitch = THREE.MathUtils.clamp(this.pitch, -0.1396, 0.1396);
    const boundedPanX = THREE.MathUtils.clamp(this.pan.x, -1.8, 1.8);
    const boundedPanY = THREE.MathUtils.clamp(this.pan.y, -1.4, 1.4);
    const focus = this.target.clone().add(new THREE.Vector3(boundedPanX, boundedPanY, 0));
    const offset = this.basePosition.clone().sub(this.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), boundedYaw);
    offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), boundedPitch);
    this.camera.position.copy(focus).add(offset.multiplyScalar(1 / this.zoom));
    this.camera.lookAt(focus);
  }

  private attachGestures(canvas: HTMLCanvasElement): void {
    let pointer: { x: number; y: number; id: number } | null = null;
    const points = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    canvas.addEventListener('pointerdown', e => {
      pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) pinchDistance = this.distanceBetweenPoints([...points.values()]);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!points.has(e.pointerId) || this.cameraMode !== 'manual') return;
      const previous = points.get(e.pointerId)!;
      const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
      const previousDistance = pinchDistance;
      const previousCenter = points.size === 2 ? this.centerOfPoints([...points.values()]) : null;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        pinchDistance = this.distanceBetweenPoints([...points.values()]);
        if (previousDistance > 0) this.zoom = THREE.MathUtils.clamp(this.zoom * pinchDistance / previousDistance, 0.90, 1.35);
        if (previousCenter) {
          const center = this.centerOfPoints([...points.values()]);
          this.pan.x = THREE.MathUtils.clamp(this.pan.x - (center.x - previousCenter.x) * 0.01, -1.8, 1.8);
          this.pan.y = THREE.MathUtils.clamp(this.pan.y + (center.y - previousCenter.y) * 0.01, -1.4, 1.4);
        }
      } else if (pointer?.id === e.pointerId && e.shiftKey) {
        this.pan.x = THREE.MathUtils.clamp(this.pan.x + dx * 0.01, -1.8, 1.8);
        this.pan.y = THREE.MathUtils.clamp(this.pan.y - dy * 0.01, -1.4, 1.4);
      } else if (pointer?.id === e.pointerId) {
        this.yaw = THREE.MathUtils.clamp(this.yaw + dx * 0.003, -0.1396, 0.1396);
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, -0.1396, 0.1396);
      }
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    const release = (e: PointerEvent) => { points.delete(e.pointerId); pointer = null; pinchDistance = 0; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', e => { if (this.cameraMode !== 'manual') return; e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * 0.001), 0.90, 1.35); }, { passive: false });
  }

  private distanceBetweenPoints(points: { x: number; y: number }[]): number {
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private centerOfPoints(points: { x: number; y: number }[]): THREE.Vector2 {
    return new THREE.Vector2((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
  }

  clearHighlight(): void {
    // Session complete — mark all as done
    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();
    Object.keys(this.meshes).forEach(n => this.completedMeshNames.add(n));
    this.applyVisuals();
  }
}
