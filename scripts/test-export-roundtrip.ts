import { getManifold } from '../src/engine/runtime';
import { buildHumanoid } from '../src/engine/humanoid';
import { cutByPlane } from '../src/engine/cut';
import type { CutPlane } from '../src/engine/plane';
import { applyConnector, DEFAULT_CLEARANCE_MM } from '../src/engine/connector';
import type { ConnectorSpec } from '../src/engine/connector';
import { manifoldToRawMesh, rawMeshToManifold } from '../src/engine/manifoldConvert';
import { exportSTL, parseSTL } from '../src/engine/stl';
import { boundingBox } from '../src/engine/rawMesh';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

function closeTo(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

async function main() {
  const wasm = await getManifold();
  const { manifold, landmarks } = buildHumanoid(wasm);

  const plane: CutPlane = { origin: landmarks.neck.point, normal: landmarks.neck.axis };
  const { positive: head, negative: body } = cutByPlane(manifold, plane);

  const spec: ConnectorSpec = {
    id: 'round-1',
    type: 'round',
    position: [0, 0],
    rotationDeg: 0,
    diameter: 6,
    length: 5,
    socketDepth: 6,
    clearance: DEFAULT_CLEARANCE_MM,
    pegOn: 'negative',
  };
  const { positive: headWithSocket, negative: bodyWithPeg } = applyConnector(wasm, plane, spec, head, body);

  const parts = [
    { name: 'head-with-socket', manifold: headWithSocket },
    { name: 'body-with-peg', manifold: bodyWithPeg },
  ];

  for (const part of parts) {
    console.log(`\n--- part: ${part.name} ---`);
    const rawBefore = manifoldToRawMesh(part.manifold);
    const bboxBefore = boundingBox(rawBefore);
    const volumeBefore = part.manifold.volume();
    const triCountBefore = part.manifold.numTri();

    // Export to STL bytes, then re-parse those bytes exactly as a fresh
    // import would (no reuse of in-memory structures).
    const stlBytes = exportSTL(rawBefore);
    const reparsedRaw = parseSTL(stlBytes);

    assert(reparsedRaw.indices.length === rawBefore.indices.length, `${part.name}: re-parsed triangle count matches (${reparsedRaw.indices.length / 3} tris)`);

    // Rebuild a Manifold from the re-imported STL, exactly as the app would
    // when a user re-imports an exported file, and verify it's still a
    // valid, watertight, single-piece solid with the same shape.
    const rebuilt = rawMeshToManifold(wasm, reparsedRaw);
    assert(!rebuilt.isEmpty(), `${part.name}: rebuilt manifold from re-imported STL is non-empty`);
    assert(rebuilt.status() === 'NoError', `${part.name}: rebuilt manifold status is NoError`);
    assert(rebuilt.decompose().length === 1, `${part.name}: rebuilt manifold is a single connected piece`);
    assert(rebuilt.genus() === 0, `${part.name}: rebuilt manifold is watertight (genus 0)`);

    const bboxAfter = boundingBox(manifoldToRawMesh(rebuilt));
    for (let a = 0; a < 3; a++) {
      assert(closeTo(bboxBefore.min[a], bboxAfter.min[a], 1e-3), `${part.name}: bbox min[${a}] preserved (scale/orientation)`);
      assert(closeTo(bboxBefore.max[a], bboxAfter.max[a], 1e-3), `${part.name}: bbox max[${a}] preserved (scale/orientation)`);
    }

    const volumeAfter = rebuilt.volume();
    assert(closeTo(volumeBefore, volumeAfter, volumeBefore * 1e-4), `${part.name}: volume preserved after export/reimport (${volumeBefore.toFixed(2)} vs ${volumeAfter.toFixed(2)})`);
    assert(rebuilt.numTri() === triCountBefore, `${part.name}: triangle count preserved after export/reimport round-trip`);
  }

  // Finally, confirm the connector geometry itself survives the round-trip:
  // reunite the two *rebuilt-from-STL* parts and check they still fit
  // together as a single solid (ignoring the sealed clearance micro-gap),
  // proving the peg/socket shapes - not just the parts' outer envelopes -
  // came through the export/reimport intact and still aligned.
  const rebuiltHead = rawMeshToManifold(wasm, parseSTL(exportSTL(manifoldToRawMesh(headWithSocket))));
  const rebuiltBody = rawMeshToManifold(wasm, parseSTL(exportSTL(manifoldToRawMesh(bodyWithPeg))));
  const reunited = wasm.Manifold.union([rebuiltHead, rebuiltBody]);
  const solidPieces = reunited.decompose().filter((p) => p.volume() > 1);
  assert(solidPieces.length === 1, 'reimported head+socket and body+peg still reunite into a single solid (connector alignment preserved)');

  console.log('\nAll export/reimport round-trip tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
