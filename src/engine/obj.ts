import type { RawMesh } from './rawMesh';

/** Minimal OBJ parser: reads vertex positions and faces (triangulated by fan). */
export function parseOBJ(text: string): RawMesh {
  const positions: number[] = [];
  const indices: number[] = [];

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (trimmed.startsWith('f ')) {
      const parts = trimmed.split(/\s+/).slice(1);
      // Each part looks like "v", "v/vt", "v/vt/vn", or "v//vn". Take the v index.
      const vIdx = parts.map((p) => {
        const idx = parseInt(p.split('/')[0], 10);
        return idx > 0 ? idx - 1 : positions.length / 3 + idx;
      });
      for (let i = 1; i < vIdx.length - 1; i++) {
        indices.push(vIdx[0], vIdx[i], vIdx[i + 1]);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/** Exports a mesh as a simple OBJ file (positions + triangle faces). */
export function exportOBJ(mesh: RawMesh): string {
  const lines: string[] = [];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    lines.push(`v ${mesh.positions[v * 3]} ${mesh.positions[v * 3 + 1]} ${mesh.positions[v * 3 + 2]}`);
  }
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const a = mesh.indices[t * 3] + 1;
    const b = mesh.indices[t * 3 + 1] + 1;
    const c = mesh.indices[t * 3 + 2] + 1;
    lines.push(`f ${a} ${b} ${c}`);
  }
  return lines.join('\n');
}
