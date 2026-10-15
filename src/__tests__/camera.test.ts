import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MouthView } from '../MouthView';
import { MOUTH_MANIFEST } from '../MouthManifest';
import { ZONES_12 } from '../protocol/zones';

describe('MouthView camera regression', () => {
  it('frames the requested zone and Reset View restores the default pose', () => {
    const view = Object.create(MouthView.prototype) as any;
    const zone = ZONES_12.find(z => z.id === 'upper_right_outer')!;
    const node = MOUTH_MANIFEST[`${zone.toothIds[0]}_outer`];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(4, 1, -2);
    mesh.updateMatrixWorld(true);
    Object.assign(view, {
      meshes: { [node]: mesh }, cameraMode: 'auto', reducedMotion: true,
      defaultPosition: new THREE.Vector3(0, 2, 22), defaultTarget: new THREE.Vector3(0, 0, -1),
      basePosition: new THREE.Vector3(0, 2, 22), destination: new THREE.Vector3(0, 2, 22),
      target: new THREE.Vector3(0, 0, -1), targetDestination: new THREE.Vector3(0, 0, -1),
      transitionFrom: new THREE.Vector3(), transitionTargetFrom: new THREE.Vector3(),
      pan: new THREE.Vector2(), zoom: 1, yaw: 0, pitch: 0, transitionStarted: 0,
    });

    view.focusZone(zone.id);
    expect(view.basePosition.distanceTo(new THREE.Vector3(0, 2, 22))).toBeGreaterThan(1);
    expect(view.target.x).toBeGreaterThan(0);
    expect(view.transitionStarted).toBe(0); // reduced motion applies the pose immediately

    view.resetCamera();
    expect(view.basePosition.toArray()).toEqual([0, 2, 22]);
    expect(view.target.toArray()).toEqual([0, 0, -1]);
  });
});
