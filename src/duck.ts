import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedurally builds a simple rubber-duck-like mesh so "Load an example"
 * works without bundling a third-party STL asset.
 */
export function buildExampleDuckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.SphereGeometry(30, 32, 24);
  body.scale(1.15, 1.0, 1.35);
  body.translate(0, 30, 0);
  parts.push(body);

  const head = new THREE.SphereGeometry(19, 28, 20);
  head.translate(0, 62, 14);
  parts.push(head);

  const cheekL = new THREE.SphereGeometry(6, 16, 12);
  cheekL.scale(1, 0.9, 0.7);
  cheekL.translate(13, 60, 22);
  parts.push(cheekL);
  const cheekR = cheekL.clone();
  cheekR.translate(-26, 0, 0);
  parts.push(cheekR);

  const beak = new THREE.ConeGeometry(9, 16, 20);
  beak.rotateX(Math.PI / 2.1);
  beak.translate(0, 58, 32);
  parts.push(beak);

  const tail = new THREE.ConeGeometry(8, 14, 16);
  tail.rotateX(-Math.PI / 2.4);
  tail.translate(0, 34, -36);
  parts.push(tail);

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  merged.center();
  merged.computeBoundingBox();

  // Match the ~74 x 107 x 101 mm footprint shown in the reference tool.
  const box = merged.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = new THREE.Vector3(74 / size.x, 107 / size.y, 101 / size.z);
  merged.scale(scale.x, scale.y, scale.z);
  merged.computeBoundingBox();
  merged.translate(0, -merged.boundingBox!.min.y, 0);
  merged.computeVertexNormals();
  return merged;
}
