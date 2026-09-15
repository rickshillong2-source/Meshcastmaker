import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

export type UpAxis = 'x' | 'y' | 'z';
export type SplitCount = 2 | 4;
export type CastMaterial = 'wax' | 'resin' | 'soap' | 'plaster';

export const MATERIAL_DENSITY_G_PER_ML: Record<CastMaterial, number> = {
  wax: 0.9,
  resin: 1.1,
  soap: 1.0,
  plaster: 1.7,
};

export interface MoldOptions {
  /** Solid margin (mm) between the model surface and the outside of the block. */
  wallThickness: number;
  /** Extra headroom (mm) above the model reserved for the pour reservoir. */
  topClearance: number;
  /** Radius (mm) of the spout where it meets the cavity. */
  spoutBottomRadius: number;
  /** Radius (mm) of the spout opening at the top of the block. */
  spoutTopRadius: number;
  /** How many pieces to split the block into. */
  pieces: SplitCount;
  /** Offset (mm) of the X parting plane from the model's horizontal center. */
  seamOffsetX: number;
  /** Offset (mm) of the Z parting plane from the model's horizontal center (used for 4-piece splits). */
  seamOffsetZ: number;
}

export const DEFAULT_MOLD_OPTIONS: MoldOptions = {
  wallThickness: 6,
  topClearance: 16,
  spoutBottomRadius: 4,
  spoutTopRadius: 9,
  pieces: 2,
  seamOffsetX: 0,
  seamOffsetZ: 0,
};

export interface MoldResult {
  pieces: THREE.BufferGeometry[];
  blockSize: THREE.Vector3;
  blockMin: THREE.Vector3;
  blockMax: THREE.Vector3;
}

const UP_ROTATIONS: Record<UpAxis, THREE.Euler> = {
  y: new THREE.Euler(0, 0, 0),
  x: new THREE.Euler(0, 0, Math.PI / 2),
  z: new THREE.Euler(Math.PI / 2, 0, 0),
};

export const AXIS_QUATERNIONS: Record<UpAxis, THREE.Quaternion> = {
  y: new THREE.Quaternion().setFromEuler(UP_ROTATIONS.y),
  x: new THREE.Quaternion().setFromEuler(UP_ROTATIONS.x),
  z: new THREE.Quaternion().setFromEuler(UP_ROTATIONS.z),
};

/** Rotates a geometry (about its own origin) by the given quaternion, then sits it on the bed. */
export function orientGeometry(geometry: THREE.BufferGeometry, quaternion: THREE.Quaternion): THREE.BufferGeometry {
  const oriented = geometry.clone();
  oriented.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion));
  oriented.computeBoundingBox();
  const box = oriented.boundingBox!;
  // Sit the model on the bed (min Y = 0) and center it in X/Z.
  const center = new THREE.Vector3();
  box.getCenter(center);
  oriented.translate(-center.x, -box.min.y, -center.z);
  oriented.computeBoundingBox();
  oriented.computeVertexNormals();
  return oriented;
}

/**
 * Picks an up-axis that minimizes the model's print height, mirroring
 * "Auto-orient for printing".
 */
export function autoOrientUpAxis(geometry: THREE.BufferGeometry): UpAxis {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const heights: Record<UpAxis, number> = { x: size.x, y: size.y, z: size.z };
  return (Object.keys(heights) as UpAxis[]).reduce((a, b) => (heights[a] <= heights[b] ? a : b));
}

/** Heuristic mirroring "Auto measures your model and picks for you". */
export function autoPieceCount(geometry: THREE.BufferGeometry): SplitCount {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const footprintRatio = Math.max(size.x, size.z) / Math.max(1e-6, Math.min(size.x, size.z));
  // A roughly-square footprint tends to have undercuts on all four sides;
  // an elongated one usually releases fine from a single side-to-side split.
  return footprintRatio < 1.4 ? 4 : 2;
}

function boxBrush(min: THREE.Vector3, max: THREE.Vector3): Brush {
  const size = new THREE.Vector3().subVectors(max, min);
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const brush = new Brush(geometry);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  brush.position.copy(center);
  brush.updateMatrixWorld(true);
  return brush;
}

function spoutBrush(
  center: THREE.Vector3,
  cavityTopY: number,
  blockTopY: number,
  bottomRadius: number,
  topRadius: number,
): Brush {
  const height = blockTopY - cavityTopY + 2;
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 32, 1, true);
  const brush = new Brush(geometry);
  brush.position.set(center.x, cavityTopY + height / 2, center.z);
  brush.updateMatrixWorld(true);
  return brush;
}

export interface BuiltMold extends MoldResult {
  cavityVolumeMm3: number;
}

export function computeBlockBounds(
  modelGeometry: THREE.BufferGeometry,
  wallThickness: number,
  topClearance: number,
): { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 } {
  modelGeometry.computeBoundingBox();
  const modelBox = modelGeometry.boundingBox!;
  const min = new THREE.Vector3(
    modelBox.min.x - wallThickness,
    modelBox.min.y - wallThickness,
    modelBox.min.z - wallThickness,
  );
  const max = new THREE.Vector3(
    modelBox.max.x + wallThickness,
    modelBox.max.y + topClearance,
    modelBox.max.z + wallThickness,
  );
  const center = new THREE.Vector3();
  modelBox.getCenter(center);
  return { min, max, center };
}

/**
 * Builds a two- (or four-) part mold around an oriented, bed-sitting model
 * geometry: a solid block, hollowed to the model's shape, with a pour
 * spout, split into printable pieces.
 */
export function buildMold(modelGeometry: THREE.BufferGeometry, options: MoldOptions): BuiltMold {
  modelGeometry.computeBoundingBox();
  const modelBox = modelGeometry.boundingBox!.clone();
  const { min: blockMin, max: blockMax, center: modelCenter } = computeBlockBounds(
    modelGeometry,
    options.wallThickness,
    options.topClearance,
  );

  const evaluator = new Evaluator();

  const blockBrush = boxBrush(blockMin, blockMax);
  const modelBrush = new Brush(modelGeometry);
  modelBrush.updateMatrixWorld(true);

  let solid = evaluator.evaluate(blockBrush, modelBrush, SUBTRACTION);

  const spout = spoutBrush(
    new THREE.Vector3(modelCenter.x, 0, modelCenter.z),
    modelBox.max.y - Math.min(6, (modelBox.max.y - modelBox.min.y) * 0.15),
    blockMax.y,
    options.spoutBottomRadius,
    options.spoutTopRadius,
  );
  solid = evaluator.evaluate(solid, spout, SUBTRACTION);
  solid.updateMatrixWorld(true);

  const splitPlaneX = modelCenter.x + options.seamOffsetX;
  const splitPlaneZ = modelCenter.z + options.seamOffsetZ;
  const pad = 5;

  const quadrants: THREE.Box3[] =
    options.pieces === 2
      ? [
          new THREE.Box3(
            new THREE.Vector3(blockMin.x - pad, blockMin.y - pad, blockMin.z - pad),
            new THREE.Vector3(splitPlaneX, blockMax.y + pad, blockMax.z + pad),
          ),
          new THREE.Box3(
            new THREE.Vector3(splitPlaneX, blockMin.y - pad, blockMin.z - pad),
            new THREE.Vector3(blockMax.x + pad, blockMax.y + pad, blockMax.z + pad),
          ),
        ]
      : [
          new THREE.Box3(
            new THREE.Vector3(blockMin.x - pad, blockMin.y - pad, blockMin.z - pad),
            new THREE.Vector3(splitPlaneX, blockMax.y + pad, splitPlaneZ),
          ),
          new THREE.Box3(
            new THREE.Vector3(splitPlaneX, blockMin.y - pad, blockMin.z - pad),
            new THREE.Vector3(blockMax.x + pad, blockMax.y + pad, splitPlaneZ),
          ),
          new THREE.Box3(
            new THREE.Vector3(blockMin.x - pad, blockMin.y - pad, splitPlaneZ),
            new THREE.Vector3(splitPlaneX, blockMax.y + pad, blockMax.z + pad),
          ),
          new THREE.Box3(
            new THREE.Vector3(splitPlaneX, blockMin.y - pad, splitPlaneZ),
            new THREE.Vector3(blockMax.x + pad, blockMax.y + pad, blockMax.z + pad),
          ),
        ];

  const pieces = quadrants.map((box) => {
    const cutBrush = boxBrush(box.min, box.max);
    const piece = evaluator.evaluate(solid, cutBrush, INTERSECTION);
    const geometry = piece.geometry.clone();
    geometry.computeVertexNormals();
    return geometry;
  });

  return {
    pieces,
    blockSize: new THREE.Vector3().subVectors(blockMax, blockMin),
    blockMin,
    blockMax,
    cavityVolumeMm3: 0,
  };
}
