/** A plain indexed triangle mesh, independent of any 3D engine. */
export interface RawMesh {
  /** Flat xyz,xyz,... vertex positions. */
  positions: Float32Array;
  /** Triangle vertex indices, 3 per triangle. */
  indices: Uint32Array;
}

/**
 * Welds vertices that are within `epsilon` of each other. STL files store
 * triangle soup with no shared vertices, so this is required before handing
 * geometry to Manifold, which needs a proper indexed manifold mesh.
 */
export function weldMesh(mesh: RawMesh, epsilon = 1e-5): RawMesh {
  const scale = 1 / epsilon;
  const keyToIndex = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Uint32Array(mesh.positions.length / 3);

  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const x = mesh.positions[v * 3];
    const y = mesh.positions[v * 3 + 1];
    const z = mesh.positions[v * 3 + 2];
    const key = `${Math.round(x * scale)},${Math.round(y * scale)},${Math.round(z * scale)}`;
    let idx = keyToIndex.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(x, y, z);
      keyToIndex.set(key, idx);
    }
    remap[v] = idx;
  }

  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) {
    indices[i] = remap[mesh.indices[i]];
  }

  // Drop degenerate triangles created by welding (all 3 verts collapsed).
  const filtered: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    if (a !== b && b !== c && a !== c) {
      filtered.push(a, b, c);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(filtered),
  };
}

export function boundingBox(mesh: RawMesh): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    for (let a = 0; a < 3; a++) {
      const val = mesh.positions[v * 3 + a];
      if (val < min[a]) min[a] = val;
      if (val > max[a]) max[a] = val;
    }
  }
  return { min, max };
}
