import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

let modulePromise: Promise<ManifoldToplevel> | null = null;

/**
 * Loads (once) and returns the Manifold WASM module. Safe to call from
 * Node scripts and from the browser bundle alike.
 */
export function getManifold(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}
