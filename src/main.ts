import * as THREE from 'three';

const UPPER_RIGHT = ['ur_ci', 'ur_li', 'ur_c', 'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2'];
const UPPER_LEFT  = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2'];
const LOWER_RIGHT = ['lr_ci', 'lr_li', 'lr_c', 'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2'];
const LOWER_LEFT  = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2'];

const TEETH = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT];

const ZONES = {
  'upper_front_outer': ['ur_c', 'ur_li', 'ur_ci', 'ul_ci', 'ul_li', 'ul_c'],
  'upper_right_outer': ['ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2'],
  'upper_left_outer': ['ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2'],
  'lower_front_outer': ['lr_c', 'lr_li', 'lr_ci', 'll_ci', 'll_li', 'll_c'],
  'lower_right_outer': ['lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2'],
  'lower_left_outer': ['ll_pm1', 'll_pm2', 'll_m1', 'll_m2'],
  'upper_front_inner': ['ur_c', 'ur_li', 'ur_ci', 'ul_ci', 'ul_li', 'ul_c'],
  'upper_right_inner': ['ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2'],
  'upper_left_inner': ['ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2'],
  'lower_front_inner': ['lr_c', 'lr_li', 'lr_ci', 'll_ci', 'll_li', 'll_c'],
  'lower_right_inner': ['lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2'],
  'lower_left_inner': ['ll_pm1', 'll_pm2', 'll_m1', 'll_m2'],
};

const CAMERA_POSES = {
  'upper_front_outer': { position: [0, 0, 12], lookAt: [0, 1, 0] },
  'upper_right_outer': { position: [10, 0, 8], lookAt: [3, 1, -2] },
  'upper_left_outer': { position: [-10, 0, 8], lookAt: [-3, 1, -2] },
  'lower_front_outer': { position: [0, 0, 12], lookAt: [0, -1, 0] },
  'lower_right_outer': { position: [10, 0, 8], lookAt: [3, -1, -2] },
  'lower_left_outer': { position: [-10, 0, 8], lookAt: [-3, -1, -2] },
  'upper_front_inner': { position: [0, -10, 5], lookAt: [0, 1, 0] },
  'upper_right_inner': { position: [-2, -8, 2], lookAt: [4, 1, -2] },
  'upper_left_inner': { position: [2, -8, 2], lookAt: [-4, 1, -2] },
  'lower_front_inner': { position: [0, 10, 5], lookAt: [0, -1, 0] },
  'lower_right_inner': { position: [-2, 8, 2], lookAt: [4, -1, -2] },
  'lower_left_inner': { position: [2, 8, 2], lookAt: [-4, -1, -2] },
};

function init() {
  const container = document.getElementById('app');
  if (!container) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 15);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, 10, 10);
  scene.add(dirLight);

  const toothMeshes: Record<string, THREE.Mesh> = {};

  const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const angles = [5, 15, 27, 40, 55, 70, 85].map(deg => deg * Math.PI / 180);
  const a = 4; // x radius
  const b = 5; // z radius

  function placeTeeth(ids: string[], isUpper: boolean, isRight: boolean) {
    const y = isUpper ? 1.0 : -1.0;
    const signX = isRight ? 1 : -1;

    ids.forEach((id, index) => {
      const t = angles[index];
      const x = a * Math.sin(t) * signX;
      const z = b * Math.cos(t) - b; // Offset so center is near z=0

      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.set(x, y, z);
      // Rotate to face outward
      mesh.rotation.y = t * signX;
      scene.add(mesh);
      toothMeshes[id] = mesh;
    });
  }

  placeTeeth(UPPER_RIGHT, true, true);
  placeTeeth(UPPER_LEFT, true, false);
  placeTeeth(LOWER_RIGHT, false, true);
  placeTeeth(LOWER_LEFT, false, false);

  function highlightZone(zoneId: string) {
    const targetIds = ZONES[zoneId as keyof typeof ZONES] || [];
    TEETH.forEach(id => {
      const mesh = toothMeshes[id];
      const isTarget = targetIds.includes(id);
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

    const pose = CAMERA_POSES[zoneId as keyof typeof CAMERA_POSES];
    if (pose) {
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    }
  }

  function resetCamera() {
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    TEETH.forEach(id => {
      const mesh = toothMeshes[id];
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xffffff);
      mat.opacity = 1.0;
      mat.transparent = false;
    });
  }

  const controlsDiv = document.getElementById('controls');
  if (controlsDiv) {
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.onclick = resetCamera;
    controlsDiv.appendChild(resetBtn);

    Object.keys(ZONES).forEach(zone => {
      const btn = document.createElement('button');
      btn.textContent = zone;
      btn.onclick = () => highlightZone(zone);
      controlsDiv.appendChild(btn);
    });
  }

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
  
  // Make these accessible for Playwright to trigger
  (window as any).highlightZone = highlightZone;
  (window as any).resetCamera = resetCamera;
}

init();
