import type { AppState, PiecesChoice } from './state';
import { MATERIAL_CAPTIONS, QUICK_START_PRESETS } from './state';
import type { CastMaterial, UpAxis } from './mold';

export interface SidebarCallbacks {
  onFile: (file: File) => void;
  onClearFile: () => void;
  onLoadExample: () => void;
  onQuickStart: (name: string) => void;
  onMaterial: (m: CastMaterial) => void;
  onScale: (percent: number) => void;
  onLockProportions: (on: boolean) => void;
  onSeamOffset: (mm: number) => void;
  onAutoOrient: () => void;
  onUpAxis: (axis: UpAxis) => void;
  onFacePickToggle: () => void;
  onPieces: (p: PiecesChoice) => void;
  onGenerate: () => void;
  onDownload: () => void;
  onHowItWorks: () => void;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SidebarExtra {
  modelSizeText: string | null;
  seamRangeMM: number;
  castEstimateText: string | null;
}

export function renderSidebar(
  root: HTMLElement,
  state: AppState,
  extra: SidebarExtra,
  cb: SidebarCallbacks,
) {
  const hasFile = !!state.rawGeometry;
  const materials: CastMaterial[] = ['wax', 'resin', 'soap', 'plaster'];
  const materialLabels: Record<CastMaterial, string> = {
    wax: 'Wax',
    resin: 'Resin',
    soap: 'Soap',
    plaster: 'Plaster',
  };

  root.innerHTML = `
    <div class="hero">
      <div class="hero-title">TURBIT ORGANIC CAST MAKER</div>
      <div class="hero-desc">Splits your model into a printable two-part mold with a pour spout, for wax, resin, soap, or plaster.</div>
      <div class="hero-rating"><span class="star">&#9733;</span> <strong>4.5</strong> &middot; 141 ratings</div>
      <button class="btn-ghost" id="how-it-works">&#128214; How it works</button>
    </div>

    <div>
      <div class="section-label">Upload your model <span class="info-dot" title="STL files only, up to 50MB">i</span></div>
      <div class="dropzone ${hasFile ? 'has-file' : ''}" id="dropzone">
        ${
          hasFile
            ? `<button class="clear-btn" id="clear-file">&times;</button>
               <div class="file-name">${state.fileName}</div>
               <div class="file-meta">${fmtBytes(state.fileSizeBytes)} &middot; ${state.triangleCount.toLocaleString()} triangles</div>
               <div class="hint">Click or drop a file to replace it</div>`
            : `<span class="upload-icon">&#8593;</span>
               <div class="file-name">Drop an STL here</div>
               <div class="file-meta">or click to browse</div>`
        }
        <input type="file" id="file-input" accept=".stl" style="display:none" />
      </div>
      <button class="link-btn" id="load-example">Load an example &rarr;</button>
      ${extra.modelSizeText ? `<div class="model-size">Model size ${extra.modelSizeText}</div>` : ''}
    </div>

    <div>
      <div class="section-label">Quick start</div>
      <div class="pill-row">
        ${Object.keys(QUICK_START_PRESETS)
          .map((name) => `<button class="pill" data-quickstart="${name}">${name}</button>`)
          .join('')}
      </div>
    </div>

    <div>
      <div class="section-label">What are you casting?</div>
      <div class="tab-row">
        ${materials
          .map(
            (m) =>
              `<button data-material="${m}" class="${state.material === m ? 'active' : ''}">${materialLabels[m]}</button>`,
          )
          .join('')}
      </div>
      <div class="helper-text">${MATERIAL_CAPTIONS[state.material]}</div>

      <div style="margin-top:16px;">
        <div class="slider-row">
          <label>Scale your model</label>
          <input type="range" id="scale-slider" min="25" max="300" step="1" value="${state.scalePercent}" />
          <div class="num-box"><input type="number" id="scale-input" value="${state.scalePercent}" min="1" max="500" />%</div>
        </div>
      </div>

      <div class="toggle-row">
        <button class="toggle ${state.lockProportions ? '' : 'off'}" id="lock-toggle"></button>
        <span>Lock proportions</span>
      </div>

      ${extra.castEstimateText ? `<div class="cast-estimate">${extra.castEstimateText}</div>` : ''}
    </div>

    <div>
      <div class="section-label">Print orientation</div>
      <div class="helper-text" style="margin-top:-4px;margin-bottom:10px;">Use the sliders to place the seam and the pour hole, then rotate below.</div>
      <div class="slider-row">
        <label>Seam position</label>
        <input type="range" id="seam-slider" min="${-extra.seamRangeMM}" max="${extra.seamRangeMM}" step="1" value="${state.seamOffset}" />
        <div class="seam-value">${state.seamOffset} mm</div>
      </div>
      <button class="link-btn" id="auto-orient" style="margin-top:12px;">Auto-orient for printing</button>
      <div class="tab-row" style="margin-top:10px;">
        <button data-axis="x" class="${!state.customOrientation && state.upAxis === 'x' ? 'active' : ''}">X up</button>
        <button data-axis="y" class="${!state.customOrientation && state.upAxis === 'y' ? 'active' : ''}">Y up</button>
        <button data-axis="z" class="${!state.customOrientation && state.upAxis === 'z' ? 'active' : ''}">Z up</button>
      </div>
      <button class="link-btn ${state.facePickMode ? 'active-pick' : ''}" id="face-pick-btn" ${hasFile ? '' : 'disabled'} style="margin-top:10px;">
        ${state.facePickMode ? 'Click a face on the model…' : 'Or click a face to set it face-down'}
      </button>
      ${state.customOrientation ? '<div class="helper-text" style="margin-top:6px;">Custom orientation set by clicking a face.</div>' : ''}
    </div>

    <div>
      <div class="section-label">Split the mold into <span class="info-dot" title="How many pieces to cut the mold block into">i</span></div>
      <div class="helper-text" style="margin-top:-4px;margin-bottom:10px;">2 is the classic clamshell. Use 4 if your model has undercuts on the sides, so a rigid mold can still release. Auto measures your model and picks for you.</div>
      <div class="tab-row">
        <button data-pieces="2" class="${state.pieces === 2 ? 'active' : ''}">2 pieces</button>
        <button data-pieces="4" class="${state.pieces === 4 ? 'active' : ''}">4 pieces</button>
        <button data-pieces="auto" class="${state.pieces === 'auto' ? 'active' : ''}">Auto</button>
      </div>
    </div>

    <div class="generate-wrap">
      <button class="btn-primary" id="generate-btn" ${hasFile ? '' : 'disabled'}>
        ${state.generating ? 'Generating…' : 'Generate mold'}
      </button>
      ${
        state.generatedPieceCount
          ? `<button class="btn-secondary" id="download-btn">Download ${state.generatedPieceCount} STL piece${state.generatedPieceCount > 1 ? 's' : ''}</button>`
          : ''
      }
    </div>
  `;

  const dropzone = root.querySelector<HTMLElement>('#dropzone')!;
  const fileInput = root.querySelector<HTMLInputElement>('#file-input')!;
  dropzone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'clear-file') return;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) cb.onFile(fileInput.files[0]);
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) cb.onFile(file);
  });
  root.querySelector('#clear-file')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cb.onClearFile();
  });

  root.querySelector('#load-example')?.addEventListener('click', () => cb.onLoadExample());
  root.querySelector('#how-it-works')?.addEventListener('click', () => cb.onHowItWorks());

  root.querySelectorAll<HTMLButtonElement>('[data-quickstart]').forEach((btn) => {
    btn.addEventListener('click', () => cb.onQuickStart(btn.dataset.quickstart!));
  });

  root.querySelectorAll<HTMLButtonElement>('[data-material]').forEach((btn) => {
    btn.addEventListener('click', () => cb.onMaterial(btn.dataset.material as CastMaterial));
  });

  const scaleSlider = root.querySelector<HTMLInputElement>('#scale-slider')!;
  const scaleInput = root.querySelector<HTMLInputElement>('#scale-input')!;
  scaleSlider.addEventListener('input', () => cb.onScale(Number(scaleSlider.value)));
  scaleInput.addEventListener('change', () => cb.onScale(Number(scaleInput.value)));

  root.querySelector('#lock-toggle')?.addEventListener('click', () => cb.onLockProportions(!state.lockProportions));

  const seamSlider = root.querySelector<HTMLInputElement>('#seam-slider')!;
  seamSlider.addEventListener('input', () => cb.onSeamOffset(Number(seamSlider.value)));

  root.querySelector('#auto-orient')?.addEventListener('click', () => cb.onAutoOrient());
  root.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach((btn) => {
    btn.addEventListener('click', () => cb.onUpAxis(btn.dataset.axis as UpAxis));
  });
  root.querySelector('#face-pick-btn')?.addEventListener('click', () => cb.onFacePickToggle());

  root.querySelectorAll<HTMLButtonElement>('[data-pieces]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.pieces!;
      cb.onPieces(val === 'auto' ? 'auto' : ((Number(val) as 2 | 4) as PiecesChoice));
    });
  });

  root.querySelector('#generate-btn')?.addEventListener('click', () => cb.onGenerate());
  root.querySelector('#download-btn')?.addEventListener('click', () => cb.onDownload());
}
