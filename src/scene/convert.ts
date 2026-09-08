import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { manifoldToRawMesh } from '../engine/manifoldConvert';

/** Builds a renderable three.js geometry (with computed normals) from a Manifold. */
export function manifoldToBufferGeometry(manifold: Manifold): THREE.BufferGeometry {
  const raw = manifoldToRawMesh(manifold);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(raw.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(raw.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
