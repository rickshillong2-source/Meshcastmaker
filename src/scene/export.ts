import JSZip from 'jszip';
import type { PartRecord } from '../state/types';
import { manifoldToRawMesh } from '../engine/manifoldConvert';
import { exportSTL } from '../engine/stl';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\- ]/gi, '_');
}

export function exportPartSTL(part: PartRecord) {
  const raw = manifoldToRawMesh(part.manifold);
  const bytes = exportSTL(raw);
  downloadBlob(new Blob([bytes], { type: 'model/stl' }), `${safeFilename(part.name)}.stl`);
}

export async function exportAllPartsZip(parts: PartRecord[]) {
  const zip = new JSZip();
  for (const part of parts) {
    const raw = manifoldToRawMesh(part.manifold);
    const bytes = exportSTL(raw);
    zip.file(`${safeFilename(part.name)}.stl`, bytes);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, 'parts.zip');
}
