import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '../state/store';

interface CutToolProps {
  initialOrigin: [number, number, number];
  initialNormal: [number, number, number];
  radius: number;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/** The draggable/rotatable cutting-plane widget, similar in spirit to a planar cut tool's gizmo. */
export function CutTool({ initialOrigin, initialNormal, radius, orbitControlsRef }: CutToolProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [ready, setReady] = useState(false);
  const gizmoMode = useSceneStore((s) => s.cutGizmoMode);
  const updateCutDraft = useSceneStore((s) => s.updateCutDraft);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(...initialOrigin);
    const n = new THREE.Vector3(...initialNormal).normalize();
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushChange = () => {
    const group = groupRef.current;
    if (!group) return;
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).normalize();
    updateCutDraft({
      origin: [group.position.x, group.position.y, group.position.z],
      normal: [normal.x, normal.y, normal.z],
    });
  };

  return (
    <>
      <group ref={groupRef}>
        <mesh>
          <circleGeometry args={[radius, 48]} />
          <meshBasicMaterial color="#4f9cff" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), radius * 0.4, 0xff5555]} />
      </group>
      {ready && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={gizmoMode}
          onMouseDown={() => {
            if (orbitControlsRef.current) orbitControlsRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitControlsRef.current) orbitControlsRef.current.enabled = true;
          }}
          onObjectChange={pushChange}
        />
      )}
    </>
  );
}
