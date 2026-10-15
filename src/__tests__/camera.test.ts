import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MouthView } from '../MouthView';
import { MOUTH_MANIFEST } from '../MouthManifest';
import { ZONES_12 } from '../protocol/zones';

describe('MouthView camera regression', () => {
  function createView(meshes: Record<string, THREE.Mesh>, reducedMotion = true) {
    const view = Object.create(MouthView.prototype) as any;
    Object.assign(view, {
      meshes, cameraMode: 'auto', reducedMotion,
      camera: new THREE.PerspectiveCamera(50, 1, 0.1, 100),
      defaultPosition: new THREE.Vector3(0, 2, 22), defaultTarget: new THREE.Vector3(0, 0, -1),
      basePosition: new THREE.Vector3(0, 2, 22), destination: new THREE.Vector3(0, 2, 22),
      target: new THREE.Vector3(0, 0, -1), targetDestination: new THREE.Vector3(0, 0, -1),
      transitionFrom: new THREE.Vector3(), transitionTargetFrom: new THREE.Vector3(),
      pan: new THREE.Vector2(), zoom: 1, yaw: 0, pitch: 0, transitionStarted: 0,
      completedMeshNames: new Set(), activeMeshNames: new Set(), upcomingMeshNames: new Set(),
      blinkState: false, lastBlinkTime: 0,
    });
    return view;
  }

  it('frames the requested zone and Reset View restores the default pose', () => {
    const view = createView({}, true);
    const zone = ZONES_12.find(z => z.id === 'upper_right_outer')!;
    const node = MOUTH_MANIFEST[`${zone.toothIds[0]}_outer`];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.position.set(4, 1, -2);
    mesh.updateMatrixWorld(true);
    view.meshes = { [node]: mesh };

    view.focusZone(zone.id);
    expect(view.basePosition.distanceTo(new THREE.Vector3(0, 2, 22))).toBeGreaterThan(1);
    expect(view.target.x).toBeGreaterThan(0);
    expect(view.transitionStarted).toBe(0); // reduced motion applies the pose immediately

    view.resetCamera();
    expect(view.basePosition.toArray()).toEqual([0, 2, 22]);
    expect(view.target.toArray()).toEqual([0, 0, -1]);
  });

  it('completes automatic framing in 650 ms using smooth interpolation', () => {
    const zone = ZONES_12.find(z => z.id === 'upper_right_outer')!;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.position.set(3, 2, -1);
    mesh.updateMatrixWorld(true);
    const node = MOUTH_MANIFEST[`${zone.toothIds[0]}_outer`];
    const view = createView({ [node]: mesh }, false);
    const startTime = 1000;
    vi.spyOn(performance, 'now').mockReturnValue(startTime);

    view.focusZone(zone.id);
    expect(view.transitionStarted).toBe(startTime);
    const from = view.basePosition.clone();
    const destination = view.destination.clone();

    vi.mocked(performance.now).mockReturnValue(startTime + 325);
    view.tick();
    expect(view.basePosition.distanceTo(from)).toBeGreaterThan(0);
    expect(view.basePosition.distanceTo(destination)).toBeGreaterThan(0);

    vi.mocked(performance.now).mockReturnValue(startTime + 650);
    view.tick();
    expect(view.basePosition.toArray()).toEqual(destination.toArray());
    expect(view.transitionStarted).toBe(0);
    vi.restoreAllMocks();
  });
});
