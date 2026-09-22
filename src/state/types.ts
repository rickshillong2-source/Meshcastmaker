import type { Manifold } from 'manifold-3d';
import type { CutPlane } from '../engine/plane';
import type { ConnectorSpec } from '../engine/connector';

export interface PartRecord {
  id: string;
  name: string;
  manifold: Manifold;
  visible: boolean;
  color: string;
}

export interface CutRecord {
  id: string;
  name: string;
  plane: CutPlane;
  /** The two currently-live part ids resulting from this cut (positive, negative). */
  partIds: [string, string];
  connectors: ConnectorSpec[];
}

export interface SceneSnapshot {
  parts: Record<string, PartRecord>;
  cuts: Record<string, CutRecord>;
  partOrder: string[];
}
