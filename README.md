# Meshcastmaker

A browser-based two-part mold generator for 3D printing: upload an STL, and it wraps the model in a solid block, hollows out a cavity shaped like the model, adds a pour spout, and splits the block into printable mold pieces (2 for a classic clamshell, 4 for undercuts, or Auto).

## Features

- Drag-and-drop STL upload, or load a procedurally generated example model
- Real boolean CSG mold generation (`three-bvh-csg`) — not a mockup: the cavity and spout are actually carved out of the block
- Casting presets for wax, resin, soap, and plaster, with a live volume/mass estimate
- Scale, up-axis / auto-orient, and seam-position controls
- 2-piece / 4-piece / Auto split, with a live preview of the parting planes before generating
- Interactive 3D viewer: wireframe toggle, fit view, view presets, bed size, and an explode slider
- STL export of the generated mold pieces

## Development

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
```
