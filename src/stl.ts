import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const loader = new STLLoader();
const exporter = new STLExporter();

export function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function exportSTL(mesh: THREE.Mesh, binary = true): Blob {
  const result = exporter.parse(mesh, { binary }) as unknown as ArrayBuffer | string;
  if (typeof result === 'string') {
    return new Blob([result], { type: 'model/stl' });
  }
  return new Blob([result], { type: 'model/stl' });
}

export function countTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const count = index ? index.count : geometry.getAttribute('position').count;
  return Math.floor(count / 3);
}

export function geometrySizeMM(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  return size;
}

/** Signed-tetrahedron volume of a closed triangle mesh, in geometry units^3. */
export function computeVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  let volume = 0;
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  const readTri = (a: number, b: number, c: number) => {
    p0.fromBufferAttribute(pos, a);
    p1.fromBufferAttribute(pos, b);
    p2.fromBufferAttribute(pos, c);
    volume += p0.dot(p1.clone().cross(p2)) / 6;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      readTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      readTri(i, i + 1, i + 2);
    }
  }
  return Math.abs(volume);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
