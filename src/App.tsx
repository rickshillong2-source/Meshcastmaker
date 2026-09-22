import { useEffect, useState } from 'react';
import { getManifold } from './engine/runtime';
import { useSceneStore } from './state/store';
import { LeftPanel } from './ui/LeftPanel';
import { Viewport } from './ui/Viewport';
import { BottomBar } from './ui/BottomBar';

export default function App() {
  const [ready, setReady] = useState(false);
  const setWasm = useSceneStore((s) => s.setWasm);

  useEffect(() => {
    let cancelled = false;
    getManifold().then((wasm) => {
      if (!cancelled) {
        setWasm(wasm);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setWasm]);

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)' }}>
        Loading geometry engine…
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gridTemplateRows: '1fr auto', height: '100%' }}>
      <div style={{ gridColumn: '1', gridRow: '1 / span 2', borderRight: '1px solid var(--border)', background: 'var(--panel)', overflowY: 'auto' }}>
        <LeftPanel />
      </div>
      <div style={{ gridColumn: '2', gridRow: '1', position: 'relative', minHeight: 0 }}>
        <Viewport />
      </div>
      <div style={{ gridColumn: '2', gridRow: '2', borderTop: '1px solid var(--border)', background: 'var(--panel)' }}>
        <BottomBar />
      </div>
    </div>
  );
}
