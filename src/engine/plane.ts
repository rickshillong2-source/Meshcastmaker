import * as THREE from 'three';

export interface CutPlane {
  origin: [number, number, number];
  normal: [number, number, number];
}

/** A stable orthonormal (u, v) basis for the plane, derived only from its normal. */
export function planeBasis(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const n = normal.clone().normalize();
  // Pick whichever world axis is least parallel to n, for a numerically stable basis.
  const reference =
    Math.abs(n.x) <= Math.abs(n.y) && Math.abs(n.x) <= Math.abs(n.z)
      ? new THREE.Vector3(1, 0, 0)
      : Math.abs(n.y) <= Math.abs(n.z)
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  const u = reference.clone().cross(n).normalize();
  const v = n.clone().cross(u).normalize();
  return { u, v };
}

export function planeNormalVec(plane: CutPlane): THREE.Vector3 {
  return new THREE.Vector3(...plane.normal).normalize();
}

export function planeOriginVec(plane: CutPlane): THREE.Vector3 {
  return new THREE.Vector3(...plane.origin);
}

/** World position of a (u, v) point expressed in the plane's own coordinate frame. */
export function planePointToWorld(plane: CutPlane, u: number, v: number): THREE.Vector3 {
  const { u: uAxis, v: vAxis } = planeBasis(planeNormalVec(plane));
  return planeOriginVec(plane).add(uAxis.multiplyScalar(u)).add(vAxis.multiplyScalar(v));
}

/** Projects a world point onto the plane's own (u, v) coordinate frame. */
export function worldPointToPlaneUV(plane: CutPlane, point: [number, number, number]): [number, number] {
  const { u: uAxis, v: vAxis } = planeBasis(planeNormalVec(plane));
  const rel = new THREE.Vector3(...point).sub(planeOriginVec(plane));
  return [rel.dot(uAxis), rel.dot(vAxis)];
}
