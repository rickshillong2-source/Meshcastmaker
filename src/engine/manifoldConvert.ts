import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { RawMesh } from './rawMesh';
import { weldMesh } from './rawMesh';

/**
 * Converts a raw (possibly non-welded) triangle mesh into a Manifold,
 * welding vertices first since Manifold requires a proper indexed mesh
 * to determine manifoldness.
 */
export function rawMeshToManifold(wasm: ManifoldToplevel, raw: RawMesh, epsilon = 1e-5): Manifold {
  const welded = weldMesh(raw, epsilon);
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: welded.positions,
    triVerts: welded.indices,
  });
  mesh.merge();
  return new wasm.Manifold(mesh);
}

/** Extracts a plain RawMesh (positions + triangle indices) from a Manifold. */
export function manifoldToRawMesh(manifold: Manifold): RawMesh {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp;
  const numVert = mesh.numVert;
  const positions = new Float32Array(numVert * 3);
  for (let v = 0; v < numVert; v++) {
    positions[v * 3] = mesh.vertProperties[v * numProp];
    positions[v * 3 + 1] = mesh.vertProperties[v * numProp + 1];
    positions[v * 3 + 2] = mesh.vertProperties[v * numProp + 2];
  }
  return {
    positions,
    indices: new Uint32Array(mesh.triVerts),
  };
}
