import type { ViewPreset } from './scene';

export interface ToolbarCallbacks {
  onWireframe: () => void;
  onFitView: () => void;
  onViewPreset: (preset: ViewPreset) => void;
  onBedSize: (size: number) => void;
}

const VIEW_LABELS: Record<ViewPreset, string> = {
  iso: 'Isometric',
  top: 'Top',
  front: 'Front',
  right: 'Right',
};

const BED_SIZES = [180, 220, 256, 300];

export function renderToolbar(
  root: HTMLElement,
  wireframe: boolean,
  bedSize: number,
  cb: ToolbarCallbacks,
) {
  root.innerHTML = `
    <button class="toolbar-btn ${wireframe ? 'active' : ''}" id="wireframe-btn">Wireframe</button>
    <button class="toolbar-btn" id="fit-view-btn">Fit view</button>
    <div class="dropdown-wrap" id="view-wrap">
      <button class="toolbar-btn" id="view-btn">View &#9662;</button>
      <div class="dropdown-menu" id="view-menu">
        ${Object.entries(VIEW_LABELS)
          .map(([k, label]) => `<button data-view="${k}">${label}</button>`)
          .join('')}
      </div>
    </div>
    <div class="dropdown-wrap" id="bed-wrap">
      <button class="toolbar-btn" id="bed-btn">Bed &#9662;</button>
      <div class="dropdown-menu" id="bed-menu">
        ${BED_SIZES.map(
          (s) => `<button data-bed="${s}" class="${s === bedSize ? 'active' : ''}">${s} &times; ${s} mm</button>`,
        ).join('')}
      </div>
    </div>
    <button class="toolbar-btn icon" id="shortcuts-btn" title="Keyboard shortcuts">&#9000;</button>
  `;

  root.querySelector('#wireframe-btn')?.addEventListener('click', () => cb.onWireframe());
  root.querySelector('#fit-view-btn')?.addEventListener('click', () => cb.onFitView());

  const closeAllMenus = () => {
    root.querySelectorAll('.dropdown-menu').forEach((m) => m.classList.remove('open'));
  };

  root.querySelector('#view-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = root.querySelector('#view-menu')!;
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) menu.classList.add('open');
  });
  root.querySelector('#bed-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = root.querySelector('#bed-menu')!;
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) menu.classList.add('open');
  });

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cb.onViewPreset(btn.dataset.view as ViewPreset);
      closeAllMenus();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-bed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cb.onBedSize(Number(btn.dataset.bed));
      closeAllMenus();
    });
  });

  root.querySelector('#shortcuts-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alert(
      'Keyboard shortcuts\n\nLeft drag: Orbit\nRight drag / two-finger drag: Pan\nScroll / pinch: Zoom\nW: Toggle wireframe\nF: Fit view',
    );
  });

  if (!(window as any).__meshcast_menu_listener) {
    (window as any).__meshcast_menu_listener = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-menu').forEach((m) => m.classList.remove('open'));
    });
  }
}
