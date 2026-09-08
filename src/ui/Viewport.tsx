import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '../state/store';
import { PartMesh } from './PartMesh';
import { CutTool } from './CutTool';
import { CutPreview } from './CutPreview';
import { worldPointToPlaneUV } from '../engine/plane';

const EXPLODE_MAX_FRACTION = 0.5;

function useExplodeOffsets() {
  const parts = useSceneStore((s) => s.parts);
  const partOrder = useSceneStore((s) => s.partOrder);
  const explodeAmount = useSceneStore((s) => s.explodeAmount);

  return useMemo(() => {
    const offsets: Record<string, [number, number, number]> = {};
    if (partOrder.length === 0) return { offsets, diagonal: 100, center: [0, 0, 0] as [number, number, number] };

    const centers: Record<string, THREE.Vector3> = {};
    const overallMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const overallMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const id of partOrder) {
      const bb = parts[id].manifold.boundingBox();
      const min = new THREE.Vector3(...bb.min);
      const max = new THREE.Vector3(...bb.max);
      centers[id] = min.clone().add(max).multiplyScalar(0.5);
      overallMin.min(min);
      overallMax.max(max);
    }
    const overallCenter = overallMin.clone().add(overallMax).multiplyScalar(0.5);
    const diagonal = overallMin.distanceTo(overallMax) || 100;

    for (const id of partOrder) {
      const dir = centers[id].clone().sub(overallCenter);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar(explodeAmount * diagonal * EXPLODE_MAX_FRACTION);
      offsets[id] = [dir.x, dir.y, dir.z];
    }
    return { offsets, diagonal, center: [overallCenter.x, overallCenter.y, overallCenter.z] as [number, number, number] };
  }, [parts, partOrder, explodeAmount]);
}

/** Frames the camera on the model each time a fresh model is imported. */
function CameraRig({ center, diagonal, resetKey }: { center: [number, number, number]; diagonal: number; resetKey: number }) {
  const { camera } = useThree();

  useEffect(() => {
    if (resetKey === 0) return;
    const d = diagonal || 100;
    camera.position.set(center[0] + d, center[1] + d * 0.6, center[2] + d);
    camera.lookAt(center[0], center[1], center[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return null;
}

export function Viewport() {
  const parts = useSceneStore((s) => s.parts);
  const partOrder = useSceneStore((s) => s.partOrder);
  const mode = useSceneStore((s) => s.mode);
  const activePartId = useSceneStore((s) => s.activePartId);
  const cutDraft = useSceneStore((s) => s.cutDraft);
  const startCutAt = useSceneStore((s) => s.startCutAt);
  const cuts = useSceneStore((s) => s.cuts);
  const activeCutId = useSceneStore((s) => s.activeCutId);
  const addConnectorAt = useSceneStore((s) => s.addConnectorAt);
  const setCutGizmoMode = useSceneStore((s) => s.setCutGizmoMode);
  const cutGizmoMode = useSceneStore((s) => s.cutGizmoMode);

  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const { offsets, diagonal, center } = useExplodeOffsets();
  const modelVersion = useSceneStore((s) => s.modelVersion);

  const activeCut = activeCutId ? cuts[activeCutId] : null;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [diagonal || 100, diagonal * 0.6 || 60, diagonal || 100], fov: 45 }} shadows>
        <color attach="background" args={['#1b1d23']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[100, 150, 100]} intensity={0.9} castShadow />
        <directionalLight position={[-100, 60, -100]} intensity={0.3} />
        <CameraRig center={center} diagonal={diagonal} resetKey={modelVersion} />

        {partOrder.map((id) => {
          const part = parts[id];
          if (!part) return null;
          const offset = offsets[id] ?? [0, 0, 0];

          const isCuttableTarget = mode === 'cut' && id === activePartId && !cutDraft;
          const isConnectorTarget = mode === 'connector' && !!activeCut && activeCut.partIds.includes(id);
          const hideBecauseCutPreview = mode === 'cut' && id === activePartId && !!cutDraft;

          if (hideBecauseCutPreview) return null;

          return (
            <PartMesh
              key={id}
              part={part}
              offset={offset}
              interactive={isCuttableTarget || isConnectorTarget}
              highlighted={id === activePartId || isConnectorTarget}
              onSurfaceClick={(point, normal) => {
                if (isCuttableTarget) {
                  startCutAt(point, normal);
                } else if (isConnectorTarget && activeCut) {
                  const trueWorldPoint: [number, number, number] = [
                    point[0] - offset[0],
                    point[1] - offset[1],
                    point[2] - offset[2],
                  ];
                  const [u, v] = worldPointToPlaneUV(activeCut.plane, trueWorldPoint);
                  addConnectorAt(u, v);
                }
              }}
            />
          );
        })}

        {mode === 'cut' && cutDraft && activePartId && parts[activePartId] && (
          <>
            <CutTool
              initialOrigin={cutDraft.origin}
              initialNormal={cutDraft.normal}
              radius={diagonal * 0.6}
              orbitControlsRef={orbitRef}
            />
            <CutPreview manifold={parts[activePartId].manifold} plane={cutDraft} />
          </>
        )}

        <OrbitControls ref={orbitRef} makeDefault target={center} />
      </Canvas>

      {mode === 'cut' && cutDraft && (
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <button className={cutGizmoMode === 'translate' ? 'primary' : ''} onClick={() => setCutGizmoMode('translate')}>
            Move
          </button>
          <button className={cutGizmoMode === 'rotate' ? 'primary' : ''} onClick={() => setCutGizmoMode('rotate')}>
            Rotate
          </button>
        </div>
      )}

      {partOrder.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', pointerEvents: 'none' }}>
          Import an STL or OBJ model to get started.
        </div>
      )}
    </div>
  );
}
