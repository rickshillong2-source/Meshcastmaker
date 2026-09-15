import * as THREE from 'three';
import type { CastMaterial, SplitCount, UpAxis } from './mold';

export type PiecesChoice = SplitCount | 'auto';

export interface AppState {
  rawGeometry: THREE.BufferGeometry | null;
  fileName: string | null;
  fileSizeBytes: number;
  triangleCount: number;
  isExample: boolean;

  material: CastMaterial;
  scalePercent: number;
  lockProportions: boolean;
  seamOffset: number;
  upAxis: UpAxis;
  /** Set when the user picked a face to face down; overrides upAxis until they pick a preset again. */
  customOrientation: THREE.Quaternion | null;
  facePickMode: boolean;
  pieces: PiecesChoice;

  wireframe: boolean;
  bedSize: number;
  explode: number;

  generatedPieceCount: SplitCount | null;
  generating: boolean;
}

export function createInitialState(): AppState {
  return {
    rawGeometry: null,
    fileName: null,
    fileSizeBytes: 0,
    triangleCount: 0,
    isExample: false,

    material: 'wax',
    scalePercent: 100,
    lockProportions: true,
    seamOffset: 0,
    upAxis: 'y',
    customOrientation: null,
    facePickMode: false,
    pieces: 2,

    wireframe: false,
    bedSize: 256,
    explode: 0,

    generatedPieceCount: null,
    generating: false,
  };
}

export const MATERIAL_CAPTIONS: Record<CastMaterial, string> = {
  wax: 'Forgiving to cast. PETG handles hot wax best.',
  resin: 'Cures at room temp. Vent the spout well.',
  soap: 'Cools fast — keep pours quick and steady.',
  plaster: 'Absorbs mold detail; add extra draft angle.',
};

export const QUICK_START_PRESETS: Record<string, Partial<AppState>> = {
  Candle: { material: 'wax', pieces: 2 },
  Soap: { material: 'soap', pieces: 2 },
  'Resin art': { material: 'resin', pieces: 'auto' },
  'Plaster cast': { material: 'plaster', pieces: 4 },
};
