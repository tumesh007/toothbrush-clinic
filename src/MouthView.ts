import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

const ZONE_IDS_TO_PAIRS: Record<string, string[]> = {};
[...ZONES_12, ...ZONES_8, ...CHEWING_ZONES].forEach(z => {
  const pairs: string[] = [];
  z.toothIds.forEach(t => {
    z.surfaces.forEach(s => {
      pairs.push(`${t}_${s}`);
    });
  });
  ZONE_IDS_TO_PAIRS[z.id] = pairs;
});

const CAMERA_POSES: Record<string, { position: [number, number, number], lookAt: [number, number, number] }> = {
  // 12-zone
  'upper_front_outer': { position: [0, 1.2, 12], lookAt: [0, 1.2, 0] },
  'upper_right_outer': { position: [10, 1.2, 8], lookAt: [3, 1.2, -2] },
  'upper_left_outer': { position: [-10, 1.2, 8], lookAt: [-3, 1.2, -2] },
  'lower_front_outer': { position: [0, -1.2, 12], lookAt: [0, -1.2, 0] },
  'lower_right_outer': { position: [10, -1.2, 8], lookAt: [3, -1.2, -2] },
  'lower_left_outer': { position: [-10, -1.2, 8], lookAt: [-3, -1.2, -2] },
  'upper_front_inner': { position: [0, -10, 5], lookAt: [0, 1.2, 0] },
  'upper_right_inner': { position: [-2, -8, 2], lookAt: [4, 1.2, -2] },
  'upper_left_inner': { position: [2, -8, 2], lookAt: [-4, 1.2, -2] },
  'lower_front_inner': { position: [0, 10, 5], lookAt: [0, -1.2, 0] },
  'lower_right_inner': { position: [-2, 8, 2], lookAt: [4, -1.2, -2] },
  'lower_left_inner': { position: [2, 8, 2], lookAt: [-4, -1.2, -2] },
  
  // 8-zone (approximate using the same angles)
  'q_upper_right_outer': { position: [8, 1.2, 10], lookAt: [2, 1.2, -1] },
  'q_upper_left_outer': { position: [-8, 1.2, 10], lookAt: [-2, 1.2, -1] },
  'q_lower_right_outer': { position: [8, -1.2, 10], lookAt: [2, -1.2, -1] },
  'q_lower_left_outer': { position: [-8, -1.2, 10], lookAt: [-2, -1.2, -1] },
  'q_upper_right_inner': { position: [-2, -8, 3], lookAt: [2, 1.2, -1] },
  'q_upper_left_inner': { position: [2, -8, 3], lookAt: [-2, 1.2, -1] },
  'q_lower_right_inner': { position: [-2, 8, 3], lookAt: [2, -1.2, -1] },
  'q_lower_left_inner': { position: [2, 8, 3], lookAt: [-2, -1.2, -1] },
  
  // chewing
  'upper_right_chewing': { position: [2, -10, -2], lookAt: [4, 1.2, -4] },
  'upper_left_chewing': { position: [-2, -10, -2], lookAt: [-4, 1.2, -4] },
  'lower_right_chewing': { position: [2, 10, -2], lookAt: [4, -1.2, -4] },
  'lower_left_chewing': { position: [-2, 10, -2], lookAt: [-4, -1.2, -4] },
};

export class MouthView implements MouthViewPort {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private meshes: Record<string, THREE.Mesh> = {};
  
  private cameraMode: 'auto' | 'manual' = 'auto';
  private reducedMotion = false;
  
  private targetCameraPos = new THREE.Vector3(0, 0, 15);
  private targetCameraLook = new THREE.Vector3(0, 0, 0);

  // For visual tracking
  private completedMeshNames: Set<string> = new Set();
  private activeMeshNames: Set<string> = new Set();
  private upcomingMeshNames: Set<string> = new Set(); // e.g. for blinking anticipation

  private blinkState = false;
  private lastBlinkTime = 0;

  private isTransitioning = false;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);  // dark mouth interior

    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);

    const canvas = this.renderer.domElement;
    // CRITICAL for Android WebView: touch-action must be on the canvas itself
    canvas.style.touchAction = 'none';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Pass canvas directly — not the container — so touches are not
    // intercepted by any overlying UI div
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 35;
    this.controls.target.set(0, 0, -1);

    // Stop auto-transition the moment the user touches the model
    this.controls.addEventListener('start', () => {
      this.isTransitioning = false;
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 10, 10);
    this.scene.add(dirLight);

    const loader = new GLTFLoader();
    loader.load('/mouth.glb', (gltf) => {
      const availableNodes = new Set<string>();
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          // Outline initially: wireframe true, transparent grey
          mesh.material = new THREE.MeshStandardMaterial({ 
            color: 0x999999, 
            wireframe: true,
            transparent: true,
            opacity: 0.5
          });
          availableNodes.add(mesh.name);
          this.meshes[mesh.name] = mesh;
        }
      });
      
      try {
        validateManifest(availableNodes);
      } catch (err) {
        console.error(err);
        alert(err);
      }

      // Center the model explicitly by offsetting it
      gltf.scene.position.set(0, 0, 0);
      this.scene.add(gltf.scene);
    });

    this.renderer.setAnimationLoop(() => {
      this.animate();
      this.renderer.render(this.scene, this.camera);
    });

    window.addEventListener('resize', () => {
      const rw = container.clientWidth  || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
    });
  }
  
  private animate() {
    const now = performance.now();
    
    // Handle Auto Camera (Lerping)
    if (this.cameraMode === 'auto' && this.isTransitioning) {
      if (this.reducedMotion) {
        this.camera.position.copy(this.targetCameraPos);
        this.controls.target.copy(this.targetCameraLook);
        this.isTransitioning = false;
      } else {
        this.camera.position.lerp(this.targetCameraPos, 0.1);
        this.controls.target.lerp(this.targetCameraLook, 0.1);
        
        if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1 && 
            this.controls.target.distanceTo(this.targetCameraLook) < 0.1) {
            this.isTransitioning = false;
        }
      }
    }
    
    // Always update controls to keep damping and manual interactions smooth
    this.controls.update();

    // Handle Blinking for upcoming zones (3-4 sec before switch)
    if (now - this.lastBlinkTime > 250) { // toggle every 250ms
      this.blinkState = !this.blinkState;
      this.lastBlinkTime = now;
      this.applyVisuals();
    }
  }

  updateState(data: any, protocol: any): void {
    if (!protocol || !protocol.slots) return;
    
    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();
    
    const currentIndex = data.currentZoneIndex;
    
    protocol.slots.forEach((slot: any, index: number) => {
      const pairs = ZONE_IDS_TO_PAIRS[slot.id] || [];
      const meshNames = pairs.map(p => MOUTH_MANIFEST[p]).filter(Boolean);
      
      if (index < currentIndex) {
        meshNames.forEach(n => this.completedMeshNames.add(n));
      } else if (index === currentIndex) {
        meshNames.forEach(n => this.activeMeshNames.add(n));
      } else if (index === currentIndex + 1) {
        // Next zone
        if (data.state === 'BRUSHING' && data.remainingSeconds <= 4) {
          meshNames.forEach(n => this.upcomingMeshNames.add(n));
        } else if (data.state === 'ZONE_TRANSITION') {
          // During transition, it's about to be active, maybe blink too?
          meshNames.forEach(n => this.upcomingMeshNames.add(n));
        }
      }
    });
    
    this.applyVisuals();
  }
  
  private applyVisuals() {
    Object.values(this.meshes).forEach(mesh => {
      const name = mesh.name;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      
      if (this.activeMeshNames.has(name)) {
        // Active: highlighted, solid green
        mat.wireframe = false;
        mat.color.setHex(0x00ff00);
        mat.opacity = 1.0;
        mat.transparent = false;
      } else if (this.upcomingMeshNames.has(name) && this.blinkState) {
        // Upcoming: blinking orange/yellow
        mat.wireframe = false;
        mat.color.setHex(0xffaa00);
        mat.opacity = 0.8;
        mat.transparent = true;
      } else if (this.completedMeshNames.has(name)) {
        // Completed: filled in, solid white/light blue
        mat.wireframe = false;
        mat.color.setHex(0xddddff);
        mat.opacity = 1.0;
        mat.transparent = false;
      } else {
        // Default / untouched: outline
        mat.wireframe = true;
        mat.color.setHex(0x999999);
        mat.opacity = 0.5;
        mat.transparent = true;
      }
    });
  }

  highlightZone(zoneId: string): void {
    // Left for backwards compatibility if needed, but updateState is the main driver now.
  }

  clearHighlight(): void {
    // Reset to default outlines when completed
    this.completedMeshNames.clear();
    this.activeMeshNames.clear();
    this.upcomingMeshNames.clear();
    Object.values(this.meshes).forEach(mesh => {
      this.completedMeshNames.add(mesh.name); // Final state is all filled
    });
    this.applyVisuals();
  }

  focusZone(zoneId: string): void {
    if (this.cameraMode !== 'auto') return;
    
    const pose = CAMERA_POSES[zoneId];
    if (pose) {
      this.targetCameraPos.set(pose.position[0], pose.position[1], pose.position[2]);
      this.targetCameraLook.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
      this.isTransitioning = true;
    }
  }

  resetCamera(): void {
    this.targetCameraPos.set(0, 0, 15);
    this.targetCameraLook.set(0, 0, 0);
    this.isTransitioning = true;
  }

  setCameraMode(mode: 'auto' | 'manual'): void {
    this.cameraMode = mode;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }
}
