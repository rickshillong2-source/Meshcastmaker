import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { useSceneStore } from '../state/store';
import { cutByPlane } from '../engine/cut';
import type { CutPlane } from '../engine/plane';
import { manifoldToBufferGeometry } from '../scene/convert';

/** Recomputes the actual cut split shortly after the plane stops moving, and renders both halves. */
export function CutPreview({ manifold, plane }: { manifold: Manifold; plane: CutPlane }) {
  const wasm = useSceneStore((s) => s.wasm);
  const [halves, setHalves] = useState<{ positive: Manifold; negative: Manifold } | null>(null);

  useEffect(() => {
    if (!wasm) return;
    const timer = setTimeout(() => {
      try {
        setHalves(cutByPlane(manifold, plane));
      } catch {
        setHalves(null);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [wasm, manifold, plane.origin[0], plane.origin[1], plane.origin[2], plane.normal[0], plane.normal[1], plane.normal[2]]);

  const posGeom = useMemo(() => (halves && !halves.positive.isEmpty() ? manifoldToBufferGeometry(halves.positive) : null), [halves]);
  const negGeom = useMemo(() => (halves && !halves.negative.isEmpty() ? manifoldToBufferGeometry(halves.negative) : null), [halves]);

  if (!halves) return null;

  return (
    <>
      {posGeom && (
        <mesh geometry={posGeom}>
          <meshStandardMaterial color="#4f9cff" transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}
      {negGeom && (
        <mesh geometry={negGeom}>
          <meshStandardMaterial color="#ff9c4f" transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}
