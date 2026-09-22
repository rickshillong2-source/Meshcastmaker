import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { PartRecord } from '../state/types';
import { manifoldToBufferGeometry } from '../scene/convert';

interface PartMeshProps {
  part: PartRecord;
  offset: [number, number, number];
  interactive?: boolean;
  highlighted?: boolean;
  opacity?: number;
  onSurfaceClick?: (point: [number, number, number], normal: [number, number, number]) => void;
}

export function PartMesh({ part, offset, interactive, highlighted, opacity = 1, onSurfaceClick }: PartMeshProps) {
  const geometry = useMemo(() => manifoldToBufferGeometry(part.manifold), [part.manifold]);

  if (!part.visible) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || !onSurfaceClick) return;
    e.stopPropagation();
    const normal = e.face
      ? e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    onSurfaceClick([e.point.x, e.point.y, e.point.z], [normal.x, normal.y, normal.z]);
  };

  return (
    <mesh geometry={geometry} position={offset} onClick={handleClick} castShadow receiveShadow>
      <meshStandardMaterial
        color={part.color}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={highlighted ? new THREE.Color(part.color) : new THREE.Color(0, 0, 0)}
        emissiveIntensity={highlighted ? 0.25 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
