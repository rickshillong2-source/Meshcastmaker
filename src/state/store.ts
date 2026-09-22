import { create } from 'zustand';
import type { ManifoldToplevel } from 'manifold-3d';
import type { PartRecord, CutRecord, SceneSnapshot } from './types';
import type { CutPlane } from '../engine/plane';
import type { ConnectorSpec, ConnectorType, ConnectorSide } from '../engine/connector';
import { cutByPlane } from '../engine/cut';
import { applyConnector as engineApplyConnector, DEFAULT_CLEARANCE_MM, connectorFootprintRadius } from '../engine/connector';
import { cutCrossSection, clampToCrossSection } from '../engine/crossSection';
import { rawMeshToManifold } from '../engine/manifoldConvert';
import { parseSTL } from '../engine/stl';
import { parseOBJ } from '../engine/obj';

export type ToolMode = 'select' | 'cut' | 'connector';

const PART_COLORS = ['#7fb3ff', '#ffb37f', '#8fe08f', '#f2a1c2', '#e0d68f', '#b39ddb', '#80cbc4', '#ef9a9a'];

let nextId = 1;
function makeId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

interface ConnectorDraft {
  type: ConnectorType;
  diameter: number;
  keyHeight: number;
  length: number;
  socketDepth: number;
  clearance: number;
  rotationDeg: number;
  pegOn: ConnectorSide;
}

const DEFAULT_CONNECTOR_DRAFT: ConnectorDraft = {
  type: 'round',
  diameter: 6,
  keyHeight: 4,
  length: 5,
  socketDepth: 6,
  clearance: DEFAULT_CLEARANCE_MM,
  rotationDeg: 0,
  pegOn: 'positive',
};

interface SceneState {
  wasm: ManifoldToplevel | null;
  parts: Record<string, PartRecord>;
  cuts: Record<string, CutRecord>;
  partOrder: string[];
  history: SceneSnapshot[];

  mode: ToolMode;
  activePartId: string | null;
  cutDraft: CutPlane | null;
  cutGizmoMode: 'translate' | 'rotate';
  activeCutId: string | null;
  connectorDraft: ConnectorDraft;
  explodeAmount: number;
  statusMessage: string | null;
  modelVersion: number;

  setWasm: (wasm: ManifoldToplevel) => void;
  loadModel: (file: File) => Promise<void>;
  setMode: (mode: ToolMode) => void;
  setActivePart: (id: string | null) => void;
  startCutAt: (point: [number, number, number], normal: [number, number, number]) => void;
  updateCutDraft: (plane: CutPlane) => void;
  setCutGizmoMode: (mode: 'translate' | 'rotate') => void;
  cancelCut: () => void;
  applyCut: () => void;
  setActiveCut: (id: string | null) => void;
  updateConnectorDraft: (patch: Partial<ConnectorDraft>) => void;
  addConnectorAt: (u: number, v: number) => void;
  togglePartVisibility: (id: string) => void;
  setExplodeAmount: (amount: number) => void;
  undo: () => void;
}

function snapshot(state: SceneState): SceneSnapshot {
  return {
    parts: { ...state.parts },
    cuts: { ...state.cuts },
    partOrder: [...state.partOrder],
  };
}

export const useSceneStore = create<SceneState>((set, get) => ({
  wasm: null,
  parts: {},
  cuts: {},
  partOrder: [],
  history: [],

  mode: 'select',
  activePartId: null,
  cutDraft: null,
  cutGizmoMode: 'translate',
  activeCutId: null,
  connectorDraft: { ...DEFAULT_CONNECTOR_DRAFT },
  explodeAmount: 0,
  statusMessage: null,
  modelVersion: 0,

  setWasm: (wasm) => set({ wasm }),

  loadModel: async (file) => {
    const { wasm } = get();
    if (!wasm) return;
    const buffer = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    const raw = lower.endsWith('.obj') ? parseOBJ(new TextDecoder().decode(buffer)) : parseSTL(buffer);
    if (raw.indices.length === 0) {
      set({ statusMessage: `Could not read any geometry from ${file.name}.` });
      return;
    }
    let manifold;
    try {
      manifold = rawMeshToManifold(wasm, raw);
    } catch (err) {
      set({ statusMessage: `Import failed: the mesh is not a valid closed (manifold) solid. (${(err as Error).message})` });
      return;
    }
    if (manifold.isEmpty() || manifold.status() !== 'NoError') {
      set({ statusMessage: `Import failed: "${file.name}" is not a watertight solid (status: ${manifold.status()}). Repair it in another tool and try again.` });
      return;
    }
    const id = makeId('part');
    const name = file.name.replace(/\.(stl|obj)$/i, '');
    const part: PartRecord = { id, name, manifold, visible: true, color: PART_COLORS[0] };
    set({
      parts: { [id]: part },
      cuts: {},
      partOrder: [id],
      history: [],
      activePartId: id,
      mode: 'select',
      cutDraft: null,
      activeCutId: null,
      explodeAmount: 0,
      statusMessage: null,
      modelVersion: get().modelVersion + 1,
    });
  },

  setMode: (mode) => set({ mode, cutDraft: null }),

  setActivePart: (id) => set({ activePartId: id }),

  startCutAt: (point, normal) => {
    set({ cutDraft: { origin: point, normal }, mode: 'cut' });
  },

  updateCutDraft: (plane) => set({ cutDraft: plane }),

  setCutGizmoMode: (cutGizmoMode) => set({ cutGizmoMode }),

  cancelCut: () => set({ cutDraft: null }),

  applyCut: () => {
    const state = get();
    const { wasm, activePartId, cutDraft, parts } = state;
    if (!wasm || !activePartId || !cutDraft) return;
    const target = parts[activePartId];
    if (!target) return;

    const history = [...state.history, snapshot(state)];

    const { positive, negative } = cutByPlane(target.manifold, cutDraft);
    // A plane that just grazes the mesh can leave a numerically degenerate,
    // near-zero-volume sliver as one of the decomposed pieces (a boolean-op
    // artifact, not a real printable fragment) - drop those before they
    // pollute the parts list.
    const MIN_PIECE_VOLUME = 1e-3;
    const posPieces = positive.isEmpty() ? [] : positive.decompose().filter((p) => p.volume() > MIN_PIECE_VOLUME);
    const negPieces = negative.isEmpty() ? [] : negative.decompose().filter((p) => p.volume() > MIN_PIECE_VOLUME);

    if (posPieces.length === 0 || negPieces.length === 0) {
      set({ statusMessage: 'That cut misses the part entirely - move the plane so it actually crosses the model.' });
      return;
    }

    const newParts = { ...parts };
    delete newParts[activePartId];
    const newPartOrder = state.partOrder.filter((id) => id !== activePartId);

    const usedColors = new Set(Object.values(newParts).map((p) => p.color));
    const nextColor = () => PART_COLORS.find((c) => !usedColors.has(c)) ?? PART_COLORS[newPartOrder.length % PART_COLORS.length];

    const posIds: string[] = [];
    posPieces.forEach((piece, i) => {
      const id = makeId('part');
      const color = nextColor();
      usedColors.add(color);
      newParts[id] = { id, name: `${target.name} (cut ${i + 1})`, manifold: piece, visible: true, color };
      newPartOrder.push(id);
      posIds.push(id);
    });
    const negIds: string[] = [];
    negPieces.forEach((piece, i) => {
      const id = makeId('part');
      const color = nextColor();
      usedColors.add(color);
      newParts[id] = { id, name: `${target.name} (cut ${i + 1 + posPieces.length})`, manifold: piece, visible: true, color };
      newPartOrder.push(id);
      negIds.push(id);
    });

    const newCuts = { ...state.cuts };
    // Invalidate any cut records that referenced the part we just re-cut.
    for (const [cid, cut] of Object.entries(newCuts)) {
      if (cut.partIds.includes(activePartId)) delete newCuts[cid];
    }

    let newCutId: string | null = null;
    if (posIds.length === 1 && negIds.length === 1) {
      newCutId = makeId('cut');
      newCuts[newCutId] = {
        id: newCutId,
        name: `Cut ${Object.keys(newCuts).length + 1}`,
        plane: cutDraft,
        partIds: [posIds[0], negIds[0]],
        connectors: [],
      };
    }

    set({
      parts: newParts,
      partOrder: newPartOrder,
      cuts: newCuts,
      history,
      activePartId: posIds[0] ?? negIds[0] ?? null,
      cutDraft: null,
      mode: 'select',
      activeCutId: newCutId,
      statusMessage:
        posPieces.length + negPieces.length > 2
          ? `Cut produced ${posPieces.length + negPieces.length} pieces - the plane crossed the model in more than one place.`
          : null,
    });
  },

  setActiveCut: (id) => set({ activeCutId: id }),

  updateConnectorDraft: (patch) => set((s) => ({ connectorDraft: { ...s.connectorDraft, ...patch } })),

  addConnectorAt: (u, v) => {
    const state = get();
    const { wasm, activeCutId, cuts, parts, connectorDraft } = state;
    if (!wasm || !activeCutId) return;
    const cut = cuts[activeCutId];
    if (!cut) return;
    const [posId, negId] = cut.partIds;
    const posPart = parts[posId];
    const negPart = parts[negId];
    if (!posPart || !negPart) return;

    const history = [...state.history, snapshot(state)];

    // Clamp against whichever side receives the socket (the cavity is the
    // limiting geometry - it must not poke through the cut surface's edge).
    const matingManifold = connectorDraft.pegOn === 'positive' ? negPart.manifold : posPart.manifold;
    const section = cutCrossSection(matingManifold, cut.plane);
    const spec: ConnectorSpec = {
      id: makeId('conn'),
      type: connectorDraft.type,
      position: [u, v],
      rotationDeg: connectorDraft.rotationDeg,
      diameter: connectorDraft.diameter,
      keyHeight: connectorDraft.keyHeight,
      length: connectorDraft.length,
      socketDepth: connectorDraft.socketDepth,
      clearance: connectorDraft.clearance,
      pegOn: connectorDraft.pegOn,
    };
    const footprint = connectorFootprintRadius(spec);
    const [cu, cv] = clampToCrossSection(wasm, section, footprint, u, v);
    spec.position = [cu, cv];

    const result = engineApplyConnector(wasm, cut.plane, spec, posPart.manifold, negPart.manifold);

    set({
      parts: {
        ...parts,
        [posId]: { ...posPart, manifold: result.positive },
        [negId]: { ...negPart, manifold: result.negative },
      },
      cuts: {
        ...cuts,
        [activeCutId]: { ...cut, connectors: [...cut.connectors, spec] },
      },
      history,
      statusMessage: null,
    });
  },

  togglePartVisibility: (id) =>
    set((s) => ({
      parts: { ...s.parts, [id]: { ...s.parts[id], visible: !s.parts[id].visible } },
    })),

  setExplodeAmount: (amount) => set({ explodeAmount: amount }),

  undo: () => {
    const state = get();
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    set({
      parts: prev.parts,
      cuts: prev.cuts,
      partOrder: prev.partOrder,
      history: state.history.slice(0, -1),
      cutDraft: null,
      mode: 'select',
      activePartId: state.activePartId && prev.parts[state.activePartId] ? state.activePartId : (prev.partOrder[0] ?? null),
      activeCutId: state.activeCutId && prev.cuts[state.activeCutId] ? state.activeCutId : null,
    });
  },
}));

if (import.meta.env.DEV) {
  (window as unknown as { __sceneStore: typeof useSceneStore }).__sceneStore = useSceneStore;
}
