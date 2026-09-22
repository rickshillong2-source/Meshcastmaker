import type { RawMesh } from './rawMesh';

function isBinarySTL(buffer: ArrayBuffer): boolean {
  // Binary STL: 80 byte header + 4 byte triangle count + 50 bytes/triangle.
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const expected = 84 + triCount * 50;
  if (expected === buffer.byteLength) return true;

  // Fall back to sniffing for the ASCII "solid" keyword at the very start.
  const headerBytes = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
  const header = String.fromCharCode(...headerBytes).toLowerCase();
  return header !== 'solid';
}

function parseBinarySTL(buffer: ArrayBuffer): RawMesh {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);
  const indices = new Uint32Array(triCount * 3);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    offset += 12; // skip normal
    for (let v = 0; v < 3; v++) {
      const base = t * 9 + v * 3;
      positions[base] = view.getFloat32(offset, true);
      positions[base + 1] = view.getFloat32(offset + 4, true);
      positions[base + 2] = view.getFloat32(offset + 8, true);
      offset += 12;
    }
    offset += 2; // skip attribute byte count
    indices[t * 3] = t * 3;
    indices[t * 3 + 1] = t * 3 + 1;
    indices[t * 3 + 2] = t * 3 + 2;
  }
  return { positions, indices };
}

function parseAsciiSTL(text: string): RawMesh {
  const positions: number[] = [];
  const vertexRe = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let match: RegExpExecArray | null;
  while ((match = vertexRe.exec(text)) !== null) {
    positions.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions: new Float32Array(positions), indices };
}

export function parseSTL(buffer: ArrayBuffer): RawMesh {
  if (isBinarySTL(buffer)) {
    return parseBinarySTL(buffer);
  }
  const text = new TextDecoder().decode(buffer);
  return parseAsciiSTL(text);
}

/** Exports a mesh as a binary STL file. */
export function exportSTL(mesh: RawMesh): ArrayBuffer {
  const triCount = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const ia = mesh.indices[t * 3];
    const ib = mesh.indices[t * 3 + 1];
    const ic = mesh.indices[t * 3 + 2];
    const ax = mesh.positions[ia * 3], ay = mesh.positions[ia * 3 + 1], az = mesh.positions[ia * 3 + 2];
    const bx = mesh.positions[ib * 3], by = mesh.positions[ib * 3 + 1], bz = mesh.positions[ib * 3 + 2];
    const cx = mesh.positions[ic * 3], cy = mesh.positions[ic * 3 + 1], cz = mesh.positions[ic * 3 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true); view.setFloat32(offset + 4, ny, true); view.setFloat32(offset + 8, nz, true);
    offset += 12;
    view.setFloat32(offset, ax, true); view.setFloat32(offset + 4, ay, true); view.setFloat32(offset + 8, az, true);
    offset += 12;
    view.setFloat32(offset, bx, true); view.setFloat32(offset + 4, by, true); view.setFloat32(offset + 8, bz, true);
    offset += 12;
    view.setFloat32(offset, cx, true); view.setFloat32(offset + 4, cy, true); view.setFloat32(offset + 8, cz, true);
    offset += 12;
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}
