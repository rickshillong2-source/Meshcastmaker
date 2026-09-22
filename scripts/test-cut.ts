import { getManifold } from '../src/engine/runtime';
import { buildHumanoid } from '../src/engine/humanoid';
import { cutByPlane } from '../src/engine/cut';
import type { CutPlane } from '../src/engine/plane';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

async function main() {
  const wasm = await getManifold();
  const { manifold, landmarks } = buildHumanoid(wasm);

  const cuts: { name: string; plane: CutPlane }[] = [
    { name: 'neck', plane: { origin: landmarks.neck.point, normal: landmarks.neck.axis } },
    { name: 'left shoulder', plane: { origin: landmarks.leftShoulder.point, normal: landmarks.leftShoulder.axis } },
    // Hip pins run vertically (like the legs), so a level horizontal cut is
    // mirror-symmetric with the other leg and would sever both at once - a
    // real user would tilt the plane (mostly across, slightly down) to
    // isolate one leg, same as here.
    { name: 'right hip (tilted)', plane: { origin: landmarks.rightHip.point, normal: [2, 1, 0.5] } },
    { name: 'left hip (tilted)', plane: { origin: landmarks.leftHip.point, normal: [-2, 1, 0.5] } },
    { name: 'right shoulder (tilted)', plane: { origin: landmarks.rightShoulder.point, normal: [1, 0.1, 0.05] } },
  ];

  for (const { name, plane } of cuts) {
    console.log(`\n--- cut: ${name} ---`);
    const { positive, negative } = cutByPlane(manifold, plane);

    assert(!positive.isEmpty(), `${name}: positive side non-empty`);
    assert(!negative.isEmpty(), `${name}: negative side non-empty`);

    const origTri = manifold.numTri();
    const posTri = positive.numTri();
    const negTri = negative.numTri();
    console.log(`  original tris=${origTri} positive tris=${posTri} negative tris=${negTri}`);

    // Two genuinely separate meshes: neither should equal the whole original,
    // and combined they should be strictly more triangles (new capping faces added).
    assert(posTri < origTri && negTri < origTri, `${name}: both halves are strict subsets of the original`);
    assert(posTri + negTri > origTri, `${name}: capping added new triangles (posTri+negTri > origTri)`);

    // Both halves must be watertight/manifold: genus() is only meaningful for
    // a single connected component, and Manifold's constructor already
    // throws if the result isn't an oriented 2-manifold, but we also check
    // decompose() to ensure no stray disconnected fragments crept in from
    // the split, and confirm genus 0 (no unexpected handles/holes).
    for (const [side, part] of [['positive', positive], ['negative', negative]] as const) {
      const pieces = part.decompose();
      assert(pieces.length === 1, `${name}: ${side} side is a single connected piece (got ${pieces.length})`);
      assert(part.genus() === 0, `${name}: ${side} side is genus 0 (watertight, no handles) - got ${part.genus()}`);
      assert(part.status() === 'NoError', `${name}: ${side} side status is NoError`);
      assert(part.volume() > 0, `${name}: ${side} side has positive volume`);
    }
  }

  console.log('\nAll cut/capping tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
