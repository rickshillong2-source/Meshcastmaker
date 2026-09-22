import * as THREE from 'three';
import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d';
import type { CutPlane } from './plane';
import { planeBasis, planeNormalVec, planeOriginVec } from './plane';

export type ConnectorType = 'round' | 'keyed';
export type ConnectorSide = 'positive' | 'negative';

export interface ConnectorSpec {
  id: string;
  type: ConnectorType;
  /** Position on the cut surface, in the plane's local (u, v) coordinates. */
  position: [number, number];
  /** Rotation in degrees of the connector's cross-section about the plane normal. */
  rotationDeg: number;
  /** Round: diameter of the peg. Keyed: width of the rectangular peg. */
  diameter: number;
  /** Keyed only: height of the rectangular cross-section (defaults to diameter * 0.6). */
  keyHeight?: number;
  /** How far the peg protrudes across the cut, into the mating part. */
  length: number;
  /** How deep the socket cavity is cut into the mating part. */
  socketDepth: number;
  /** Per-side clearance added to the socket over the peg's nominal size. */
  clearance: number;
  /** Which side of the cut (relative to the plane normal) carries the peg; the other gets the socket. */
  pegOn: ConnectorSide;
}

export const DEFAULT_CLEARANCE_MM = 0.2;

/** How far the peg is embedded into its own part for a solid anchor (not user-facing). */
function anchorDepth(spec: ConnectorSpec): number {
  const size = spec.type === 'round' ? spec.diameter / 2 : Math.min(spec.diameter, spec.keyHeight ?? spec.diameter * 0.6) / 2;
  return Math.max(1.5, size * 0.6);
}

/** Small extra depth so the socket cut cleanly punches through the flat cut face. */
const SEAM_OVERLAP_MM = 0.6;

function mat4ToArray(m: THREE.Matrix4): Mat4 {
  return Array.from(m.elements) as Mat4;
}

/** Builds the world transform placing a connector's local +Z axis along `axisDir` at plane position (u, v). */
function connectorWorldMatrix(plane: CutPlane, spec: ConnectorSpec, axisDir: THREE.Vector3): THREE.Matrix4 {
  const n = planeNormalVec(plane);
  const { u: uAxis, v: vAxis } = planeBasis(n);

  const rot = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(spec.rotationDeg));
  const x = uAxis.clone().applyQuaternion(rot);
  const y = vAxis.clone().applyQuaternion(rot);

  const m = new THREE.Matrix4().makeBasis(x, y, axisDir);
  const position = planeOriginVec(plane)
    .add(uAxis.clone().multiplyScalar(spec.position[0]))
    .add(vAxis.clone().multiplyScalar(spec.position[1]));
  m.setPosition(position);
  return m;
}

function localRoundSolid(wasm: ManifoldToplevel, radius: number, zMin: number, zMax: number): Manifold {
  const height = zMax - zMin;
  return wasm.Manifold.cylinder(height, radius, radius, 32, false).translate([0, 0, zMin]);
}

function localKeyedSolid(wasm: ManifoldToplevel, width: number, depth: number, zMin: number, zMax: number): Manifold {
  const height = zMax - zMin;
  return wasm.Manifold.cube([width, depth, height], false)
    .translate([-width / 2, -depth / 2, 0])
    .translate([0, 0, zMin]);
}

/** The peg's own local footprint radius (for cross-section containment checks). */
export function connectorFootprintRadius(spec: ConnectorSpec): number {
  const clearance = spec.clearance;
  if (spec.type === 'round') return spec.diameter / 2 + clearance;
  const h = spec.keyHeight ?? spec.diameter * 0.6;
  return Math.hypot(spec.diameter, h) / 2 + clearance;
}

export interface ConnectorGeometry {
  peg: Manifold;
  socket: Manifold;
}

/**
 * Builds the world-space peg and socket solids for a connector spec.
 * The peg is meant to be boolean-unioned into the part on `spec.pegOn`;
 * the socket is meant to be boolean-subtracted from the other part. Both
 * are built from the same plane/position/orientation, so once unioned and
 * subtracted they are guaranteed to line up when the parts sit at their
 * original (un-exploded) positions.
 */
export function buildConnectorGeometry(wasm: ManifoldToplevel, plane: CutPlane, spec: ConnectorSpec): ConnectorGeometry {
  const n = planeNormalVec(plane);
  // Peg points away from its own part, into the mating part.
  const pegAxis = spec.pegOn === 'positive' ? n.clone().negate() : n.clone();
  const embed = anchorDepth(spec);

  const pegMatrix = connectorWorldMatrix(plane, spec, pegAxis);
  const socketMatrix = pegMatrix; // identical placement/orientation as the peg

  let localPeg: Manifold;
  let localSocket: Manifold;

  if (spec.type === 'round') {
    const r = spec.diameter / 2;
    localPeg = localRoundSolid(wasm, r, -embed, spec.length);
    localSocket = localRoundSolid(wasm, r + spec.clearance, -SEAM_OVERLAP_MM, spec.socketDepth);
  } else {
    const w = spec.diameter;
    const h = spec.keyHeight ?? spec.diameter * 0.6;
    localPeg = localKeyedSolid(wasm, w, h, -embed, spec.length);
    localSocket = localKeyedSolid(wasm, w + spec.clearance * 2, h + spec.clearance * 2, -SEAM_OVERLAP_MM, spec.socketDepth);
  }

  const peg = localPeg.transform(mat4ToArray(pegMatrix));
  const socket = localSocket.transform(mat4ToArray(socketMatrix));
  return { peg, socket };
}

/** Applies a connector to a cut result, returning the updated positive/negative parts. */
export function applyConnector(
  wasm: ManifoldToplevel,
  plane: CutPlane,
  spec: ConnectorSpec,
  positive: Manifold,
  negative: Manifold,
): { positive: Manifold; negative: Manifold } {
  const { peg, socket } = buildConnectorGeometry(wasm, plane, spec);
  if (spec.pegOn === 'positive') {
    return {
      positive: positive.add(peg),
      negative: negative.subtract(socket),
    };
  }
  return {
    positive: positive.subtract(socket),
    negative: negative.add(peg),
  };
}
