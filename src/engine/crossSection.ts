import * as THREE from 'three';
import type { CrossSection, Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d';
import type { CutPlane } from './plane';
import { planeBasis, planeNormalVec, planeOriginVec } from './plane';

function mat4ToArray(m: THREE.Matrix4): Mat4 {
  return Array.from(m.elements) as Mat4;
}

/** World-space transform mapping the plane's local (u, v, n) frame to world space. */
export function planeLocalToWorldMatrix(plane: CutPlane): THREE.Matrix4 {
  const n = planeNormalVec(plane);
  const { u, v } = planeBasis(n);
  const m = new THREE.Matrix4().makeBasis(u, v, n);
  m.setPosition(planeOriginVec(plane));
  return m;
}

/**
 * The 2D outline of the mesh where it intersects the plane, expressed in the
 * plane's local (u, v) coordinates. Computed by reorienting a copy of the
 * mesh so the cut plane becomes the local Z=0 plane, then slicing near Z=0 -
 * reusing Manifold's own robust slicing rather than hand-rolled polygon math.
 *
 * Manifold.slice() documents that slicing exactly at the top of a solid's
 * bounding box returns empty (only the bottom face is treated as "at" that
 * height). For a manifold that is one half of a planar cut, its flat cap
 * sits exactly at the bounding-box boundary on one side or the other
 * (bottom for the "positive"/normal-facing half, top for the "negative"
 * half) - so slicing at exactly Z=0 silently returns empty for one of the
 * two halves. Slicing at a tiny epsilon instead, and falling back to the
 * opposite sign if that comes back empty, sidesteps the boundary case while
 * still landing effectively on the flat cap.
 */
export function cutCrossSection(manifold: Manifold, plane: CutPlane): CrossSection {
  const worldFromLocal = planeLocalToWorldMatrix(plane);
  const localFromWorld = worldFromLocal.clone().invert();
  const reoriented = manifold.transform(mat4ToArray(localFromWorld));
  const EPS = 1e-3;
  const atPositiveEps = reoriented.slice(EPS);
  if (!atPositiveEps.isEmpty()) return atPositiveEps;
  const atNegativeEps = reoriented.slice(-EPS);
  if (!atNegativeEps.isEmpty()) return atNegativeEps;
  return reoriented.slice(0);
}

/**
 * Shrinks the cross-section inward by `footprintRadius` (using the
 * CrossSection's own polygon-offset op) so that any point remaining inside
 * guarantees a connector footprint of that radius fits entirely within the
 * original cut surface.
 */
export function insetForFootprint(section: CrossSection, footprintRadius: number): CrossSection {
  if (footprintRadius <= 0) return section;
  return section.offset(-footprintRadius, 'Round');
}

/** Whether (u, v) lies inside the cross-section, tested via a tiny-circle intersection. */
export function crossSectionContains(wasm: ManifoldToplevel, section: CrossSection, u: number, v: number): boolean {
  if (section.isEmpty()) return false;
  const probe = wasm.CrossSection.circle(1e-3, 8).translate([u, v]);
  const overlap = section.intersect(probe);
  const contained = !overlap.isEmpty();
  return contained;
}

/** Nearest point to (u, v) lying on the cross-section's contour polylines. */
function nearestPointOnPolygons(polygons: [number, number][][], u: number, v: number): [number, number] {
  let best: [number, number] = [u, v];
  let bestDist = Infinity;
  for (const contour of polygons) {
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i];
      const b = contour[(i + 1) % contour.length];
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const lenSq = abx * abx + aby * aby || 1e-12;
      let t = ((u - a[0]) * abx + (v - a[1]) * aby) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = a[0] + t * abx;
      const py = a[1] + t * aby;
      const dist = (px - u) ** 2 + (py - v) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = [px, py];
      }
    }
  }
  return best;
}

/**
 * Clamps a desired (u, v) connector position so a footprint of the given
 * radius stays entirely within the cut surface. Returns the input unchanged
 * if it already fits.
 */
export function clampToCrossSection(
  wasm: ManifoldToplevel,
  section: CrossSection,
  footprintRadius: number,
  u: number,
  v: number,
): [number, number] {
  const inset = insetForFootprint(section, footprintRadius);
  if (inset.isEmpty()) {
    // Cut surface too small for this footprint anywhere; fall back to its centroid.
    const bounds = section.bounds();
    return [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2];
  }
  if (crossSectionContains(wasm, inset, u, v)) {
    return [u, v];
  }
  const polygons = inset.toPolygons() as unknown as [number, number][][];
  return nearestPointOnPolygons(polygons, u, v);
}
