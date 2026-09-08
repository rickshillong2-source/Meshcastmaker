import { writeFileSync, mkdirSync } from 'node:fs';
import { getManifold } from '../src/engine/runtime';
import { buildHumanoid } from '../src/engine/humanoid';
import { manifoldToRawMesh } from '../src/engine/manifoldConvert';
import { exportSTL } from '../src/engine/stl';

async function main() {
  const wasm = await getManifold();
  const { manifold, landmarks } = buildHumanoid(wasm);

  console.log('landmarks', landmarks);
  console.log('isEmpty', manifold.isEmpty());
  console.log('genus', manifold.genus());
  console.log('numTri', manifold.numTri());
  console.log('numVert', manifold.numVert());
  console.log('boundingBox', manifold.boundingBox());
  console.log('volume', manifold.volume());
  console.log('status', manifold.status());

  const raw = manifoldToRawMesh(manifold);
  const stl = exportSTL(raw);
  mkdirSync('scratch', { recursive: true });
  writeFileSync('scratch/humanoid.stl', Buffer.from(stl));
  console.log('wrote scratch/humanoid.stl', stl.byteLength, 'bytes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
