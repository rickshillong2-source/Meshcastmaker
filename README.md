# Meshcastmaker

A simple browser-based tool for separating humanoid 3D models into printable
parts, with registration pegs/sockets for reassembly. Built for internal use
by a small 3D-printing team.

## Running it

```
npm install
npm run dev
```

Open the printed local URL. Everything runs client-side in the browser (no
backend/server) - geometry processing uses [Manifold](https://github.com/elalish/manifold)
compiled to WebAssembly, which guarantees watertight boolean operations.

## Workflow

1. **Import** an STL or OBJ model (left panel).
2. Select the **Cut** tool, click on the model roughly where a joint should
   be severed to place a cutting plane, then drag the gizmo (Move/Rotate
   toggle, top-left of the viewport) to position and orient it. The two
   halves preview live as you adjust the plane.
3. **Apply Cut**. The part is replaced by the resulting pieces in the parts
   list; each piece is watertight with a properly capped seam.
4. Repeat cuts on any part in the list (click a part to make it active, then
   Cut again).
5. Select the **Connector** tool, choose a cut from the dropdown, configure
   peg type/size/clearance, then click on the highlighted cut surface to drop
   a registration peg + matching socket. Repeat for multiple registration
   points on a large cut.
6. Use **Exploded View** to inspect how pieces fit together, hide/show parts
   individually via their checkboxes.
7. **Export** an individual part as STL from its row, or **Export All Parts**
   for a zip of every part.

## Architecture

- `src/engine/` - pure geometry engine (STL/OBJ IO, Manifold conversion,
  plane cutting, connector construction, cross-section containment). No UI
  dependencies; runnable directly under Node via `tsx` for scripted testing.
- `src/scene/` - three.js-facing glue (Manifold → BufferGeometry, STL/zip
  export triggers).
- `src/state/store.ts` - single zustand store holding parts/cuts/history.
- `src/ui/` - React components (viewport, panels, cut/connector tools).

## Testing

The engine is exercised headlessly (no browser) with Node scripts that build
a procedural test humanoid and validate actual boolean geometry operations:

```
npx tsx scripts/test-cut.ts              # plane cuts through neck/shoulders/hips
npx tsx scripts/test-connector.ts        # peg/socket alignment, containment, multi-peg
npx tsx scripts/test-export-roundtrip.ts # STL/OBJ export -> reimport preserves geometry
```

`scripts/browser-test.mjs` and `scripts/browser-test-2.mjs` drive the actual
UI with Playwright end-to-end (import, cut, connector, undo, exploded view,
export).
