import type { Manifold } from 'manifold-3d';
import type { CutPlane } from './plane';
import { planeNormalVec, planeOriginVec } from './plane';

export interface CutResult {
  /** The half of the mesh in the direction the plane's normal points. */
  positive: Manifold;
  /** The half of the mesh on the opposite side. */
  negative: Manifold;
}

/**
 * Cuts a manifold with a plane, producing two capped, watertight halves.
 * Manifold's splitByPlane both performs the boolean split and caps the new
 * faces in one robust operation.
 */
export function cutByPlane(manifold: Manifold, plane: CutPlane): CutResult {
  const n = planeNormalVec(plane);
  const o = planeOriginVec(plane);
  const offset = n.dot(o);
  const [positive, negative] = manifold.splitByPlane([n.x, n.y, n.z], offset);
  return { positive, negative };
}
