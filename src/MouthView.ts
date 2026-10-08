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
    this.camera.position.set(0, 2, 22);
    this.camera.lookAt(0, 0, -1);

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

  // No-ops / stubs kept for interface compatibility
  highlightZone(_zoneId: string): void {}
  focusZone(_zoneId: string): void {}   // camera is fixed — no zoom
  resetCamera(): void {}
  setCameraMode(_mode: 'auto' | 'manual'): void {}
  setReducedMotion(_reduced: boolean): void {}

  clearHighlight(): void {
    // Session complete — mark all as done
    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();
    Object.keys(this.meshes).forEach(n => this.completedMeshNames.add(n));
    this.applyVisuals();
  }
}
