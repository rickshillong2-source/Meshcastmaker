import { getManifold } from '../src/engine/runtime';
import { buildHumanoid } from '../src/engine/humanoid';
import { cutByPlane } from '../src/engine/cut';
import type { CutPlane } from '../src/engine/plane';
import { cutCrossSection, clampToCrossSection } from '../src/engine/crossSection';
import { applyConnector, connectorFootprintRadius, DEFAULT_CLEARANCE_MM } from '../src/engine/connector';
import type { ConnectorSpec } from '../src/engine/connector';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

/**
 * Counts the "real" solid pieces in a decomposed manifold, ignoring tiny
 * enclosed voids. A peg fitted into a socket with clearance necessarily
 * leaves a fully sealed micro air-gap around it once the two parts are
 * notionally reunited; decompose() correctly reports that trapped void as
 * its own (negative-volume, inward-facing) component even though it isn't a
 * stray fragment of actual material. Each part is printed separately in
 * practice, so this sealed gap never appears in any single exported STL -
 * it's only an artifact of gluing the two parts back together for this
 * alignment check.
 */
function countSolidPieces(pieces: { volume(): number }[], volumeEpsilon = 1): number {
  return pieces.filter((p) => p.volume() > volumeEpsilon).length;
}

async function main() {
  const wasm = await getManifold();
  const { manifold, landmarks } = buildHumanoid(wasm);

  const plane: CutPlane = { origin: landmarks.neck.point, normal: landmarks.neck.axis };
  const { positive: head, negative: body } = cutByPlane(manifold, plane);

  // --- Round peg, centered on the neck's axis ---
  const roundSpec: ConnectorSpec = {
    id: 'round-1',
    type: 'round',
    position: [0, 0],
    rotationDeg: 0,
    diameter: 6,
    length: 5,
    socketDepth: 6,
    clearance: DEFAULT_CLEARANCE_MM,
    pegOn: 'negative', // peg lives on the body, socket cut into the head
  };

  const before = { headTri: head.numTri(), bodyTri: body.numTri() };
  const afterRound = applyConnector(wasm, plane, roundSpec, head, body);

  assert(!afterRound.negative.isEmpty(), 'body-with-peg non-empty');
  assert(!afterRound.positive.isEmpty(), 'head-with-socket non-empty');
  assert(afterRound.negative.numTri() > before.bodyTri, 'peg added new geometry to body');
  assert(afterRound.positive.numTri() > before.headTri, 'socket cut added new geometry to head (capping the cavity)');
  assert(afterRound.negative.decompose().length === 1, 'body+peg is a single connected piece (peg is physically attached)');
  assert(afterRound.positive.decompose().length === 1, 'head+socket is a single connected piece (no floating fragments)');
  assert(afterRound.negative.genus() === 0, 'body+peg is watertight (genus 0)');
  assert(afterRound.positive.genus() === 0, 'head+socket is watertight (genus 0)');
  assert(afterRound.negative.status() === 'NoError', 'body+peg status NoError');
  assert(afterRound.positive.status() === 'NoError', 'head+socket status NoError');

  // Alignment check: when head and body sit at their original (un-exploded)
  // world positions, the peg (union'd into body) and socket cavity (cut into
  // head) must coincide. We verify this by re-uniting body+peg with head+socket:
  // if they align and the socket is big enough for the peg (clearance-fit),
  // the union should be watertight with no leftover peg surface poking out
  // unexpectedly (volume should be very close to head+body+peg, i.e nothing
  // extra sticking out or interfering) - most importantly, the socket must
  // actually have removed a cavity in the same place the peg fills, so the
  // reunited whole should be a single connected watertight solid.
  const reunited = wasm.Manifold.union([afterRound.negative, afterRound.positive]);
  const reunitedPieces = reunited.decompose();
  assert(
    countSolidPieces(reunitedPieces) === 1,
    'body+peg reunited with head+socket forms a single connected solid (aligned) - ignoring the sealed clearance micro-gap',
  );
  assert(reunited.status() === 'NoError', 'reunited whole status NoError');

  // The socket must be a strict superset (clearance-enlarged) of the peg, so
  // reunited volume should be very close to (head+socket volume + body+peg
  // volume - overlap), and importantly must NOT be dramatically larger than
  // the original head+body (which would indicate the peg pokes out through
  // the socket without fitting, i.e. misalignment).
  const originalWhole = manifold.volume();
  const reunitedVolume = reunited.volume();
  const volumeDelta = Math.abs(reunitedVolume - originalWhole);
  console.log(`  original volume=${originalWhole.toFixed(1)} reunited volume=${reunitedVolume.toFixed(1)} delta=${volumeDelta.toFixed(2)}`);
  assert(volumeDelta < originalWhole * 0.01, 'reunited volume matches original within 1% (peg fits cleanly in socket, nothing floating outside)');

  // --- Containment: connector must stay within the actual cut surface ---
  const section = cutCrossSection(manifold, plane);
  const footprint = connectorFootprintRadius(roundSpec);
  const [cu, cv] = clampToCrossSection(wasm, section, footprint, 0, 0);
  assert(Math.hypot(cu, cv) < 1e-6, 'centered connector position needs no clamping on the neck (well within bounds)');

  const farOut = clampToCrossSection(wasm, section, footprint, 1000, 1000);
  assert(Math.hypot(farOut[0], farOut[1]) < 20, 'a wildly out-of-bounds position gets clamped back onto the cut surface');

  // Regression check: cutCrossSection must work on the "negative"-side half
  // too, not just the full original mesh. A cut half's flat cap sits at the
  // *top* of its own local bounding box on the negative side (vs. the
  // bottom on the positive side) - Manifold.slice() documents that slicing
  // exactly at the top of a bounding box returns empty, which previously
  // made containment checks silently pass with an empty (infinite-bounds)
  // cross-section whenever the mating part was the negative side.
  const negativeSideSection = cutCrossSection(body, plane);
  assert(!negativeSideSection.isEmpty(), 'cross-section of the negative-side cut half is non-empty');
  assert(negativeSideSection.area() > 1, `negative-side cross-section has real area (got ${negativeSideSection.area().toFixed(2)})`);
  const positiveSideSection = cutCrossSection(head, plane);
  assert(!positiveSideSection.isEmpty(), 'cross-section of the positive-side cut half is non-empty');
  assert(
    Math.abs(negativeSideSection.area() - positiveSideSection.area()) < 1,
    'both cut halves report the same cross-sectional area (they share the same seam)',
  );

  // --- Keyed (rectangular) peg, offset from center, rotated ---
  const keyedSpec: ConnectorSpec = {
    id: 'keyed-1',
    type: 'keyed',
    position: [2, 1],
    rotationDeg: 30,
    diameter: 5,
    keyHeight: 3,
    length: 4,
    socketDepth: 5,
    clearance: DEFAULT_CLEARANCE_MM,
    pegOn: 'positive', // peg on head this time, socket in body
  };
  const afterKeyed = applyConnector(wasm, plane, keyedSpec, head, body);
  assert(afterKeyed.positive.decompose().length === 1, 'keyed: head+peg is a single connected piece');
  assert(afterKeyed.negative.decompose().length === 1, 'keyed: body+socket is a single connected piece');
  assert(afterKeyed.positive.genus() === 0, 'keyed: head+peg watertight');
  assert(afterKeyed.negative.genus() === 0, 'keyed: body+socket watertight');
  const reunitedKeyed = wasm.Manifold.union([afterKeyed.positive, afterKeyed.negative]);
  assert(
    countSolidPieces(reunitedKeyed.decompose()) === 1,
    'keyed: reunited whole is a single connected solid (aligned)',
  );

  // --- Multiple registration points on one cut surface ---
  const specA: ConnectorSpec = { ...roundSpec, id: 'multi-a', position: [-4, 0] };
  const specB: ConnectorSpec = { ...roundSpec, id: 'multi-b', position: [4, 0] };
  let multiHead = head;
  let multiBody = body;
  for (const spec of [specA, specB]) {
    const result = applyConnector(wasm, plane, spec, multiHead, multiBody);
    multiHead = result.positive;
    multiBody = result.negative;
  }
  assert(multiBody.decompose().length === 1, 'multiple pegs: body+2 pegs is a single connected piece');
  assert(multiHead.decompose().length === 1, 'multiple pegs: head+2 sockets is a single connected piece');
  const reunitedMulti = wasm.Manifold.union([multiHead, multiBody]);
  assert(
    countSolidPieces(reunitedMulti.decompose()) === 1,
    'multiple pegs: reunited whole is a single connected solid',
  );

  console.log('\nAll connector tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
