import * as THREE from 'three';
import './style.css';
import { Viewer, type ViewPreset } from './scene';
import { renderSidebar, type SidebarExtra } from './sidebar';
import { renderToolbar } from './toolbar';
import { createInitialState, QUICK_START_PRESETS } from './state';
import {
  buildMold,
  computeBlockBounds,
  orientGeometry,
  autoOrientUpAxis,
  autoPieceCount,
  DEFAULT_MOLD_OPTIONS,
  MATERIAL_DENSITY_G_PER_ML,
  AXIS_QUATERNIONS,
  type SplitCount,
} from './mold';
import { parseSTL, exportSTL, countTriangles, computeVolume, downloadBlob } from './stl';
import { buildExampleDuckGeometry } from './duck';

const sidebarEl = document.getElementById('sidebar')!;
const viewportEl = document.getElementById('viewport')!;
const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;

const viewer = new Viewer(canvas);
const state = createInitialState();

let lastMoldPieces: THREE.BufferGeometry[] | null = null;
let helpOpen = false;

// ---- Extra DOM chrome layered over the canvas ----

const toolbarEl = document.createElement('div');
toolbarEl.className = 'viewport-toolbar';
viewportEl.appendChild(toolbarEl);

const calloutEl = document.createElement('div');
calloutEl.className = 'callout';
calloutEl.innerHTML = `
  Example result from our rubber duck. Upload your own model to make yours.
  <br /><button class="btn-ghost" id="callout-upload">Upload your model</button>
`;
viewportEl.appendChild(calloutEl);

const explodeEl = document.createElement('div');
explodeEl.className = 'explode-chip';
explodeEl.innerHTML = `<span>Explode</span><input type="range" id="explode-slider" min="0" max="100" value="0" />`;
viewportEl.appendChild(explodeEl);

const chatFab = document.createElement('button');
chatFab.className = 'chat-fab';
chatFab.innerHTML = '&#128172;';
chatFab.title = 'Tips';
viewportEl.appendChild(chatFab);

const helpPanel = document.createElement('div');
helpPanel.className = 'help-panel';
helpPanel.innerHTML = `
  <h4>Quick tips</h4>
  <ul>
    <li>Rotate with left-drag, pan with right-drag, zoom with scroll.</li>
    <li>Pick an up-axis or hit Auto-orient to minimize print height.</li>
    <li>Use 4 pieces for models with side undercuts (arms, ears, handles).</li>
    <li>The seam slider shifts the parting line off-center to dodge fine detail.</li>
  </ul>
`;
viewportEl.appendChild(helpPanel);

const toastEl = document.createElement('div');
toastEl.className = 'toast';
viewportEl.appendChild(toastEl);
let toastTimer: number | undefined;
function showToast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---- Geometry helpers ----

function computeEffectiveGeometry(): THREE.BufferGeometry | null {
  if (!state.rawGeometry) return null;
  const quaternion = state.customOrientation ?? AXIS_QUATERNIONS[state.upAxis];
  const oriented = orientGeometry(state.rawGeometry, quaternion);
  const scale = state.scalePercent / 100;
  oriented.scale(scale, scale, scale);
  oriented.computeVertexNormals();
  oriented.computeBoundingBox();
  return oriented;
}

function resolvedPieceCount(effective: THREE.BufferGeometry): SplitCount {
  return state.pieces === 'auto' ? autoPieceCount(effective) : state.pieces;
}

function seamRangeMM(effective: THREE.BufferGeometry | null): number {
  if (!effective) return 20;
  effective.computeBoundingBox();
  const size = new THREE.Vector3();
  effective.boundingBox!.getSize(size);
  return Math.max(5, Math.floor(Math.min(size.x, size.z) / 2 - DEFAULT_MOLD_OPTIONS.wallThickness - 2));
}

function invalidateGenerated() {
  state.generatedPieceCount = null;
  lastMoldPieces = null;
  viewer.clearMoldPieces();
}

function updateScenePreview() {
  const effective = computeEffectiveGeometry();
  if (state.generatedPieceCount && lastMoldPieces) {
    viewer.setModelGeometry(null);
    return;
  }
  viewer.setModelGeometry(effective);
  if (!effective) {
    viewer.clearPreviewSplit();
    return;
  }
  const { min, max, center } = computeBlockBounds(
    effective,
    DEFAULT_MOLD_OPTIONS.wallThickness,
    DEFAULT_MOLD_OPTIONS.topClearance,
  );
  const pieces = resolvedPieceCount(effective);
  const splitX = center.x + state.seamOffset;
  const splitZ = pieces === 4 ? center.z + state.seamOffset : null;
  viewer.showPreviewSplit(min, max, splitX, splitZ);
}

// ---- Render ----

function render() {
  const effective = computeEffectiveGeometry();
  let modelSizeText: string | null = null;
  let castEstimateText: string | null = null;

  if (effective) {
    effective.computeBoundingBox();
    const size = new THREE.Vector3();
    effective.boundingBox!.getSize(size);
    modelSizeText = `${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)} mm`;

    const volumeMm3 = computeVolume(effective);
    const ml = volumeMm3 / 1000;
    const grams = ml * MATERIAL_DENSITY_G_PER_ML[state.material];
    castEstimateText = `Cast uses ~${ml.toFixed(0)} ml (≈${grams.toFixed(0)} g ${state.material})`;
  }

  const extra: SidebarExtra = {
    modelSizeText,
    seamRangeMM: seamRangeMM(effective),
    castEstimateText,
  };

  renderSidebar(sidebarEl, state, extra, {
    onFile: handleFile,
    onClearFile: handleClearFile,
    onLoadExample: handleLoadExample,
    onQuickStart: handleQuickStart,
    onMaterial: (m) => {
      state.material = m;
      render();
    },
    onScale: (percent) => {
      state.scalePercent = Math.min(500, Math.max(1, percent));
      invalidateGenerated();
      render();
      updateScenePreview();
    },
    onLockProportions: (on) => {
      state.lockProportions = on;
      render();
    },
    onSeamOffset: (mm) => {
      state.seamOffset = mm;
      invalidateGenerated();
      render();
      updateScenePreview();
    },
    onAutoOrient: () => {
      if (!state.rawGeometry) return;
      state.upAxis = autoOrientUpAxis(state.rawGeometry);
      state.customOrientation = null;
      invalidateGenerated();
      render();
      updateScenePreview();
      viewer.fitView();
    },
    onUpAxis: (axis) => {
      state.upAxis = axis;
      state.customOrientation = null;
      invalidateGenerated();
      render();
      updateScenePreview();
      viewer.fitView();
    },
    onFacePickToggle: handleFacePickToggle,
    onPieces: (p) => {
      state.pieces = p;
      invalidateGenerated();
      render();
      updateScenePreview();
    },
    onGenerate: handleGenerate,
    onDownload: downloadMoldPieces,
    onHowItWorks: () => {
      alert(
        'How it works\n\n' +
          '1. Upload a watertight STL.\n' +
          '2. Turbit Organic Cast Maker wraps it in a solid block, hollows out a cavity matching the model, and adds a pour spout.\n' +
          '3. Orient it with X/Y/Z up, Auto-orient, or by clicking a face to set it face-down on the print plate.\n' +
          '4. The block is split into 2 or 4 pieces so it can release from the model and be printed flat.\n' +
          '5. Print the pieces, band or clamp them together, and pour your wax, resin, soap, or plaster through the spout.',
      );
    },
  });

  renderToolbar(toolbarEl, state.wireframe, state.bedSize, {
    onWireframe: () => {
      state.wireframe = !state.wireframe;
      viewer.setWireframe(state.wireframe);
      render();
    },
    onFitView: () => viewer.fitView(),
    onViewPreset: (preset: ViewPreset) => viewer.setViewPreset(preset),
    onBedSize: (size) => {
      state.bedSize = size;
      viewer.setBed(size);
      render();
    },
  });

  (explodeEl.querySelector('#explode-slider') as HTMLInputElement).value = String(state.explode * 100);
}

// ---- Actions ----

function loadGeometry(geometry: THREE.BufferGeometry, fileName: string, sizeBytes: number, isExample: boolean) {
  state.rawGeometry = geometry;
  state.fileName = fileName;
  state.fileSizeBytes = sizeBytes;
  state.triangleCount = countTriangles(geometry);
  state.isExample = isExample;
  state.scalePercent = 100;
  state.seamOffset = 0;
  state.upAxis = 'y';
  state.customOrientation = null;
  setFacePickMode(false);
  invalidateGenerated();
  calloutEl.style.display = 'none';
  render();
  updateScenePreview();
  viewer.fitView();
}

function setFacePickMode(on: boolean) {
  state.facePickMode = on;
  if (on) {
    if (state.generatedPieceCount) {
      invalidateGenerated();
      updateScenePreview();
    }
    viewer.setFacePickMode(true, handleFacePicked);
    showToast('Click a face on the model to set it face-down');
  } else {
    viewer.setFacePickMode(false);
  }
}

function handleFacePickToggle() {
  if (!state.rawGeometry) return;
  setFacePickMode(!state.facePickMode);
  render();
}

function handleFacePicked(normal: THREE.Vector3) {
  const current = state.customOrientation ?? AXIS_QUATERNIONS[state.upAxis];
  const delta = new THREE.Quaternion().setFromUnitVectors(normal.clone().normalize(), new THREE.Vector3(0, -1, 0));
  state.customOrientation = delta.multiply(current.clone());
  setFacePickMode(false);
  invalidateGenerated();
  render();
  updateScenePreview();
  viewer.fitView();
  showToast('That face is now facing down');
}

function handleFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const geometry = parseSTL(reader.result as ArrayBuffer);
      loadGeometry(geometry, file.name, file.size, false);
    } catch (err) {
      console.error(err);
      alert('Could not read that file as an STL. Please check the export and try again.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleClearFile() {
  state.rawGeometry = null;
  state.fileName = null;
  state.fileSizeBytes = 0;
  state.triangleCount = 0;
  state.customOrientation = null;
  setFacePickMode(false);
  invalidateGenerated();
  render();
  updateScenePreview();
}

function handleLoadExample() {
  const geometry = buildExampleDuckGeometry();
  loadGeometry(geometry, 'rubber-duck.stl', 535 * 1024, true);
}

function handleQuickStart(name: string) {
  const preset = QUICK_START_PRESETS[name];
  if (!preset) return;
  Object.assign(state, preset);
  invalidateGenerated();
  if (!state.rawGeometry) handleLoadExample();
  render();
  updateScenePreview();
  showToast(`Quick start: ${name}`);
}

function handleGenerate() {
  if (!state.rawGeometry || state.generating) return;
  state.generating = true;
  render();

  window.setTimeout(() => {
    try {
      const effective = computeEffectiveGeometry()!;
      const pieces = resolvedPieceCount(effective);
      const options = {
        ...DEFAULT_MOLD_OPTIONS,
        pieces,
        seamOffsetX: state.seamOffset,
        seamOffsetZ: state.seamOffset,
      };
      const result = buildMold(effective, options);
      lastMoldPieces = result.pieces;
      state.generatedPieceCount = pieces;

      const blockCenter = new THREE.Vector3().addVectors(result.blockMin, result.blockMax).multiplyScalar(0.5);
      viewer.clearPreviewSplit();
      viewer.setModelGeometry(null);
      viewer.setMoldPieces(result.pieces, blockCenter);
      viewer.setWireframe(state.wireframe);
      viewer.setExplode(state.explode);
      viewer.fitView();
      showToast(`Mold generated: ${pieces} pieces`);
    } catch (err) {
      console.error(err);
      alert(
        'Could not generate a mold from this model. Very thin walls or a non-watertight STL can cause this ' +
          '— try simplifying the mesh or increasing scale.',
      );
    } finally {
      state.generating = false;
      render();
    }
  }, 30);
}

function downloadMoldPieces() {
  if (!lastMoldPieces) return;
  lastMoldPieces.forEach((geometry, i) => {
    const mesh = new THREE.Mesh(geometry);
    const blob = exportSTL(mesh, true);
    downloadBlob(blob, `mold-piece-${i + 1}.stl`);
  });
}

// ---- Static chrome wiring ----

calloutEl.querySelector('#callout-upload')?.addEventListener('click', () => {
  sidebarEl.querySelector<HTMLInputElement>('#file-input')?.click();
});

chatFab.addEventListener('click', () => {
  helpOpen = !helpOpen;
  helpPanel.classList.toggle('open', helpOpen);
});

explodeEl.querySelector('#explode-slider')?.addEventListener('input', (e) => {
  state.explode = Number((e.target as HTMLInputElement).value) / 100;
  viewer.setExplode(state.explode);
});

render();
updateScenePreview();
viewer.fitView();
