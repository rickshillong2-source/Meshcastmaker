import { useRef } from 'react';
import { useSceneStore } from '../state/store';
import { exportPartSTL } from '../scene/export';

export function LeftPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const parts = useSceneStore((s) => s.parts);
  const partOrder = useSceneStore((s) => s.partOrder);
  const cuts = useSceneStore((s) => s.cuts);
  const mode = useSceneStore((s) => s.mode);
  const setMode = useSceneStore((s) => s.setMode);
  const activePartId = useSceneStore((s) => s.activePartId);
  const setActivePart = useSceneStore((s) => s.setActivePart);
  const activeCutId = useSceneStore((s) => s.activeCutId);
  const setActiveCut = useSceneStore((s) => s.setActiveCut);
  const togglePartVisibility = useSceneStore((s) => s.togglePartVisibility);
  const loadModel = useSceneStore((s) => s.loadModel);
  const connectorDraft = useSceneStore((s) => s.connectorDraft);
  const updateConnectorDraft = useSceneStore((s) => s.updateConnectorDraft);
  const statusMessage = useSceneStore((s) => s.statusMessage);

  const hasParts = partOrder.length > 0;
  const cutList = Object.values(cuts);
  const activeCut = activeCutId ? cuts[activeCutId] : null;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <h3>Model</h3>
        <input
          ref={fileInput}
          type="file"
          accept=".stl,.obj"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadModel(file);
            e.target.value = '';
          }}
        />
        <button style={{ width: '100%' }} onClick={() => fileInput.current?.click()}>
          Import STL / OBJ
        </button>
      </section>

      <section>
        <h3>Tool</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ flex: 1 }} disabled={!hasParts} className={mode === 'select' ? 'primary' : ''} onClick={() => setMode('select')}>
            Select
          </button>
          <button style={{ flex: 1 }} disabled={!activePartId} className={mode === 'cut' ? 'primary' : ''} onClick={() => setMode('cut')}>
            Cut
          </button>
          <button style={{ flex: 1 }} disabled={cutList.length === 0} className={mode === 'connector' ? 'primary' : ''} onClick={() => setMode('connector')}>
            Connector
          </button>
        </div>
        {mode === 'cut' && (
          <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>
            Click on the selected part to place a cutting plane, then drag the gizmo to position/rotate it.
          </p>
        )}
      </section>

      {mode === 'connector' && (
        <section>
          <h3>Connector</h3>
          <label>Cut surface</label>
          <select value={activeCutId ?? ''} onChange={(e) => setActiveCut(e.target.value || null)}>
            <option value="" disabled>
              Choose a cut…
            </option>
            {cutList.map((cut) => (
              <option key={cut.id} value={cut.id}>
                {cut.name}
              </option>
            ))}
          </select>

          {activeCut && (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={{ flex: 1 }} className={connectorDraft.type === 'round' ? 'primary' : ''} onClick={() => updateConnectorDraft({ type: 'round' })}>
                  Round peg
                </button>
                <button style={{ flex: 1 }} className={connectorDraft.type === 'keyed' ? 'primary' : ''} onClick={() => updateConnectorDraft({ type: 'keyed' })}>
                  Keyed peg
                </button>
              </div>

              <div style={{ marginTop: 8 }}>
                <label>Peg lives on</label>
                <select value={connectorDraft.pegOn} onChange={(e) => updateConnectorDraft({ pegOn: e.target.value as 'positive' | 'negative' })}>
                  <option value="positive">{parts[activeCut.partIds[0]]?.name ?? 'Piece A'}</option>
                  <option value="negative">{parts[activeCut.partIds[1]]?.name ?? 'Piece B'}</option>
                </select>
              </div>

              <NumberField label={connectorDraft.type === 'round' ? 'Peg diameter (mm)' : 'Peg width (mm)'} value={connectorDraft.diameter} min={1} step={0.5} onChange={(v) => updateConnectorDraft({ diameter: v })} />
              {connectorDraft.type === 'keyed' && (
                <NumberField label="Peg height (mm)" value={connectorDraft.keyHeight} min={1} step={0.5} onChange={(v) => updateConnectorDraft({ keyHeight: v })} />
              )}
              <NumberField label="Peg length (mm)" value={connectorDraft.length} min={0.5} step={0.5} onChange={(v) => updateConnectorDraft({ length: v })} />
              <NumberField label="Socket depth (mm)" value={connectorDraft.socketDepth} min={0.5} step={0.5} onChange={(v) => updateConnectorDraft({ socketDepth: v })} />
              <NumberField label="Clearance (mm)" value={connectorDraft.clearance} min={0} step={0.05} onChange={(v) => updateConnectorDraft({ clearance: v })} />
              <NumberField label="Rotation (deg)" value={connectorDraft.rotationDeg} min={-180} max={180} step={5} onChange={(v) => updateConnectorDraft({ rotationDeg: v })} />

              <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>Click on the highlighted cut surface in the viewport to add a connector there. Repeat to add more.</p>

              {activeCut.connectors.length > 0 && (
                <p style={{ color: 'var(--text-dim)' }}>{activeCut.connectors.length} connector(s) on this cut.</p>
              )}
            </>
          )}
        </section>
      )}

      <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <h3>Parts ({partOrder.length})</h3>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {partOrder.map((id) => {
            const part = parts[id];
            if (!part) return null;
            return (
              <div
                key={id}
                onClick={() => setActivePart(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: activePartId === id ? 'var(--panel-2)' : 'transparent',
                  border: activePartId === id ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={part.visible}
                  onChange={(e) => {
                    e.stopPropagation();
                    togglePartVisibility(id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: part.color, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{part.name}</span>
                <button
                  style={{ padding: '2px 6px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    exportPartSTL(part);
                  }}
                >
                  STL
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {statusMessage && (
        <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, color: 'var(--text-dim)', fontSize: 12 }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <label>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </div>
  );
}
