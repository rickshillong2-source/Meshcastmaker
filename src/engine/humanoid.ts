import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/** A convex capsule (hull of two spheres) running along the Y axis from y=0 to y=length. */
function capsuleY(wasm: ManifoldToplevel, length: number, radius: number): Manifold {
  const a = wasm.Manifold.sphere(radius, 24).translate([0, radius, 0]);
  const b = wasm.Manifold.sphere(radius, 24).translate([0, length - radius, 0]);
  return wasm.Manifold.hull([a, b]);
}

/**
 * A flat-ended cylinder running along the Y axis, nominally from y=0 to
 * y=length, extended by `overlap` at both ends so it genuinely penetrates
 * into the solids it connects to - a flush, tangent join between two flat
 * caps (or a flat cap and a curved surface) has near-zero contact area and
 * can fail to union into a single watertight solid.
 */
function cylinderY(wasm: ManifoldToplevel, length: number, radius: number, overlap: number): Manifold {
  // Manifold.cylinder extrudes along Z by default; rotate it onto Y.
  return wasm.Manifold.cylinder(length + 2 * overlap, radius, radius, 24, false)
    .rotate([-90, 0, 0])
    .translate([0, -overlap, 0]);
}

export interface JointLandmark {
  /** A point on the joint's own axis, roughly at its midpoint. */
  point: [number, number, number];
  /** Unit-ish direction along the joint's axis (a plane through `point` with this normal cuts cleanly across it). */
  axis: [number, number, number];
}

export interface HumanoidLandmarks {
  neck: JointLandmark;
  leftShoulder: JointLandmark;
  rightShoulder: JointLandmark;
  leftHip: JointLandmark;
  rightHip: JointLandmark;
}

export interface HumanoidResult {
  manifold: Manifold;
  landmarks: HumanoidLandmarks;
}

/**
 * Builds a simple procedural humanoid out of capsule primitives, unioned into
 * a single watertight manifold, with narrow cylindrical "pins" at the
 * neck/shoulders/hips - like a real figure's distinct joints - so a single
 * planar cut through a pin cleanly separates one limb without grazing
 * anything else. The torso is a plain flat-ended cylinder (rather than a
 * rounded capsule) specifically so the hip pins, which attach to its flat
 * underside, get a reliable full-radius overlap instead of tapering to zero
 * near a rounded cap. Used as a reproducible stand-in for a real humanoid
 * STL/OBJ during testing, since it gives exact, known joint locations.
 */
export function buildHumanoid(wasm: ManifoldToplevel): HumanoidResult {
  const JOIN_OVERLAP = 3;

  const legLength = 36;
  const legRadius = 6;
  const legX = 9;
  const hipPinRadius = 3.5;
  const hipPinLength = 8;

  const leftLegCapsule = capsuleY(wasm, legLength, legRadius).translate([-legX, 0, 0]);
  const rightLegCapsule = capsuleY(wasm, legLength, legRadius).translate([legX, 0, 0]);
  const leftHipPin = cylinderY(wasm, hipPinLength, hipPinRadius, JOIN_OVERLAP).translate([-legX, legLength, 0]);
  const rightHipPin = cylinderY(wasm, hipPinLength, hipPinRadius, JOIN_OVERLAP).translate([legX, legLength, 0]);

  const torsoBottomY = legLength + hipPinLength;
  const torsoHeight = 42;
  const torsoRadius = 15;
  const torso = cylinderY(wasm, torsoHeight, torsoRadius, 0).translate([0, torsoBottomY, 0]);

  const shoulderPinLength = 7;
  const shoulderPinRadius = 3.2;
  const shoulderY = torsoBottomY + torsoHeight - torsoRadius * 0.7;
  // Shoulder pins stick out horizontally from the torso; a cylinder built
  // along Y is rotated 90 degrees about Z so its axis points along +/-X.
  const leftShoulderPin = cylinderY(wasm, shoulderPinLength, shoulderPinRadius, JOIN_OVERLAP)
    .rotate([0, 0, 90])
    .translate([-torsoRadius, shoulderY, 0]);
  const rightShoulderPin = cylinderY(wasm, shoulderPinLength, shoulderPinRadius, JOIN_OVERLAP)
    .rotate([0, 0, -90])
    .translate([torsoRadius, shoulderY, 0]);

  const armLength = 34;
  const armRadius = 5;
  const armAttachX = torsoRadius + shoulderPinLength;
  const leftArm = capsuleY(wasm, armLength, armRadius)
    .rotate([0, 0, 180])
    .translate([-armAttachX, shoulderY + armRadius, 0]);
  const rightArm = capsuleY(wasm, armLength, armRadius)
    .rotate([0, 0, 180])
    .translate([armAttachX, shoulderY + armRadius, 0]);

  const neckY = torsoBottomY + torsoHeight;
  const neckHeight = 9;
  const neckRadius = 5.5;
  const neck = cylinderY(wasm, neckHeight, neckRadius, JOIN_OVERLAP).translate([0, neckY, 0]);

  const headRadius = 12;
  const headY = neckY + neckHeight + headRadius * 0.75;
  const head = wasm.Manifold.sphere(headRadius, 32).translate([0, headY, 0]);

  const manifold = wasm.Manifold.union([
    leftLegCapsule, rightLegCapsule, leftHipPin, rightHipPin,
    torso, leftShoulderPin, rightShoulderPin, leftArm, rightArm,
    neck, head,
  ]);

  return {
    manifold,
    landmarks: {
      neck: { point: [0, neckY + neckHeight / 2, 0], axis: [0, 1, 0] },
      leftShoulder: { point: [-torsoRadius - shoulderPinLength / 2, shoulderY, 0], axis: [1, 0, 0] },
      rightShoulder: { point: [torsoRadius + shoulderPinLength / 2, shoulderY, 0], axis: [1, 0, 0] },
      leftHip: { point: [-legX, legLength + hipPinLength / 2, 0], axis: [0, 1, 0] },
      rightHip: { point: [legX, legLength + hipPinLength / 2, 0], axis: [0, 1, 0] },
    },
  };
}
