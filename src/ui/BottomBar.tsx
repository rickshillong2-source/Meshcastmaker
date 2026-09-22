import { useSceneStore } from '../state/store';
import { exportAllPartsZip } from '../scene/export';

export function BottomBar() {
  const mode = useSceneStore((s) => s.mode);
  const cutDraft = useSceneStore((s) => s.cutDraft);
  const applyCut = useSceneStore((s) => s.applyCut);
  const cancelCut = useSceneStore((s) => s.cancelCut);
  const history = useSceneStore((s) => s.history);
  const undo = useSceneStore((s) => s.undo);
  const explodeAmount = useSceneStore((s) => s.explodeAmount);
  const setExplodeAmount = useSceneStore((s) => s.setExplodeAmount);
  const parts = useSceneStore((s) => s.parts);
  const partOrder = useSceneStore((s) => s.partOrder);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'cut' && cutDraft && (
          <>
            <button className="primary" onClick={applyCut}>
              Apply Cut
            </button>
            <button onClick={cancelCut}>Cancel</button>
          </>
        )}
        <button disabled={history.length === 0} onClick={undo}>
          Undo
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Exploded view</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(explodeAmount * 100)}
          onChange={(e) => setExplodeAmount(Number(e.target.value) / 100)}
          style={{ flex: 1, maxWidth: 260 }}
        />
      </div>

      <button
        className="primary"
        disabled={partOrder.length === 0}
        onClick={() => exportAllPartsZip(partOrder.map((id) => parts[id]).filter(Boolean))}
      >
        Export All Parts
      </button>
    </div>
  );
}
