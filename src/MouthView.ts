import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ALL_TEETH } from './protocol/anatomy';
import { ZONES_12, ZONES_8, CHEWING_ZONES } from './protocol/zones';
import { MOUTH_MANIFEST, validateManifest } from './MouthManifest';

export interface MouthViewPort {
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
  private meshes: Record<string, THREE.Mesh> = {};
  
  private cameraMode: 'auto' | 'manual' = 'auto';
  private reducedMotion = false;
  
  private targetCameraPos = new THREE.Vector3(0, 0, 15);
  private targetCameraLook = new THREE.Vector3(0, 0, 0);
  private currentCameraLook = new THREE.Vector3(0, 0, 0);

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 15);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

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
          // Create a new material so we can change its color/opacity independently
          mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
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

      this.scene.add(gltf.scene);
    });

    this.renderer.setAnimationLoop(() => {
      this.animate();
      this.renderer.render(this.scene, this.camera);
    });
  }
  
  private animate() {
    if (this.cameraMode === 'auto') {
      if (this.reducedMotion) {
        this.camera.position.copy(this.targetCameraPos);
        this.currentCameraLook.copy(this.targetCameraLook);
        this.camera.lookAt(this.currentCameraLook);
      } else {
        this.camera.position.lerp(this.targetCameraPos, 0.1);
        this.currentCameraLook.lerp(this.targetCameraLook, 0.1);
        this.camera.lookAt(this.currentCameraLook);
      }
    }
  }

  highlightZone(zoneId: string): void {
    const targetPairs = ZONE_IDS_TO_PAIRS[zoneId] || [];
    const targetMeshNames = targetPairs.map(p => MOUTH_MANIFEST[p]);
    
    Object.values(this.meshes).forEach(mesh => {
      const isTarget = targetMeshNames.includes(mesh.name);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (isTarget) {
        mat.color.setHex(0x00ff00);
        mat.opacity = 1.0;
        mat.transparent = false;
      } else {
        mat.color.setHex(0xffffff);
        mat.opacity = 0.3;
        mat.transparent = true;
      }
    });
  }

  clearHighlight(): void {
    Object.values(this.meshes).forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xffffff);
      mat.opacity = 1.0;
      mat.transparent = false;
    });
  }

  focusZone(zoneId: string): void {
    if (this.cameraMode !== 'auto') return;
    
    const pose = CAMERA_POSES[zoneId];
    if (pose) {
      this.targetCameraPos.set(pose.position[0], pose.position[1], pose.position[2]);
      this.targetCameraLook.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    }
  }

  resetCamera(): void {
    this.targetCameraPos.set(0, 0, 15);
    this.targetCameraLook.set(0, 0, 0);
  }

  setCameraMode(mode: 'auto' | 'manual'): void {
    this.cameraMode = mode;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }
}
