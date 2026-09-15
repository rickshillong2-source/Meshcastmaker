import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const PIECE_COLORS = [0x3f7fd1, 0xd1622c, 0x4fae6a, 0xb98fd1];

export type ViewPreset = 'iso' | 'top' | 'front' | 'right';

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private bedGroup = new THREE.Group();
  private bedSize = 256;
  private modelMesh: THREE.Mesh | null = null;
  private previewGroup = new THREE.Group();
  private previewObjects: THREE.Object3D[] = [];
  private previewRestPositions: THREE.Vector3[] = [];
  private previewExplodeDirections: THREE.Vector3[] = [];
  private pieceGroup = new THREE.Group();
  private pieceMeshes: THREE.Mesh[] = [];
  private pieceExplodeDirections: THREE.Vector3[] = [];
  private explodeAmount = 0;
  private wireframe = false;

  private facePickActive = false;
  private facePickCallback: ((normal: THREE.Vector3) => void) | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    this.setViewPreset('iso');

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 40, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(150, 300, 200);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-200, 100, -150);
    this.scene.add(fill);

    this.scene.add(this.bedGroup);
    this.scene.add(this.previewGroup);
    this.scene.add(this.pieceGroup);
    this.setBed(this.bedSize);

    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!this.facePickActive || !this.pointerDownPos) return;
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      this.pointerDownPos = null;
      if (Math.hypot(dx, dy) > 5) return;
      this.handleFacePickClick(e);
    });
    this.resize();
    this.animate();
  }

  setFacePickMode(active: boolean, onPick?: (normal: THREE.Vector3) => void) {
    this.facePickActive = active;
    this.facePickCallback = active ? onPick ?? null : null;
    this.renderer.domElement.style.cursor = active ? 'crosshair' : '';
  }

  get isFacePickActive() {
    return this.facePickActive;
  }

  private handleFacePickClick(e: PointerEvent) {
    if (!this.modelMesh) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hits = raycaster.intersectObject(this.modelMesh, false);
    if (hits.length && hits[0].face) {
      this.facePickCallback?.(hits[0].face.normal.clone());
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setBed(sizeMM: number) {
    this.bedSize = sizeMM;
    this.bedGroup.clear();

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeMM, sizeMM),
      new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.9, metalness: 0.1 }),
    );
    plane.rotation.x = -Math.PI / 2;
    this.bedGroup.add(plane);

    const grid = new THREE.GridHelper(sizeMM, 20, 0x3a4a63, 0x24303f);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.9;
    this.bedGroup.add(grid);
  }

  get currentBedSize() {
    return this.bedSize;
  }

  setViewPreset(preset: ViewPreset) {
    const d = this.bedSize || 256;
    const positions: Record<ViewPreset, THREE.Vector3> = {
      iso: new THREE.Vector3(d * 0.78, d * 0.92, d * 0.78),
      top: new THREE.Vector3(0.01, d * 1.6, 0.01),
      front: new THREE.Vector3(0, d * 0.55, d * 1.5),
      right: new THREE.Vector3(d * 1.5, d * 0.55, 0),
    };
    this.camera.position.copy(positions[preset]);
    this.camera.lookAt(0, 40, 0);
    if (this.controls) this.controls.target.set(0, 40, 0);
  }

  setModelGeometry(geometry: THREE.BufferGeometry | null) {
    if (this.modelMesh) {
      this.scene.remove(this.modelMesh);
      this.modelMesh.geometry.dispose();
      (this.modelMesh.material as THREE.Material).dispose();
      this.modelMesh = null;
    }
    if (!geometry) return;
    const material = new THREE.MeshStandardMaterial({
      color: 0xe6c9a3,
      roughness: 0.55,
      metalness: 0.05,
      wireframe: this.wireframe,
    });
    this.modelMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.modelMesh);
  }

  setModelVisible(visible: boolean) {
    if (this.modelMesh) this.modelMesh.visible = visible;
  }

  showPreviewSplit(
    blockMin: THREE.Vector3,
    blockMax: THREE.Vector3,
    splitX: number,
    splitZ: number | null,
  ) {
    this.previewGroup.clear();
    this.previewObjects = [];
    this.previewRestPositions = [];
    this.previewExplodeDirections = [];
    const blockCenter = new THREE.Vector3().addVectors(blockMin, blockMax).multiplyScalar(0.5);
    const regions: [THREE.Vector3, THREE.Vector3, number][] = [];
    if (splitZ === null) {
      regions.push([blockMin, new THREE.Vector3(splitX, blockMax.y, blockMax.z), 0]);
      regions.push([new THREE.Vector3(splitX, blockMin.y, blockMin.z), blockMax, 1]);
    } else {
      regions.push([blockMin, new THREE.Vector3(splitX, blockMax.y, splitZ), 0]);
      regions.push([new THREE.Vector3(splitX, blockMin.y, blockMin.z), new THREE.Vector3(blockMax.x, blockMax.y, splitZ), 1]);
      regions.push([new THREE.Vector3(blockMin.x, blockMin.y, splitZ), new THREE.Vector3(splitX, blockMax.y, blockMax.z), 2]);
      regions.push([new THREE.Vector3(splitX, blockMin.y, splitZ), blockMax, 3]);
    }

    for (const [min, max, i] of regions) {
      const size = new THREE.Vector3().subVectors(max, min);
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mat = new THREE.MeshBasicMaterial({
        color: PIECE_COLORS[i],
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const group = new THREE.Group();
      group.position.copy(center);
      this.previewGroup.add(group);

      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: PIECE_COLORS[i], transparent: true, opacity: 0.85 }),
      );
      group.add(edges);

      this.previewObjects.push(group);
      this.previewRestPositions.push(center.clone());
      const dir = new THREE.Vector3(center.x - blockCenter.x, 0, center.z - blockCenter.z);
      if (dir.lengthSq() < 1e-6) dir.set(i % 2 === 0 ? -1 : 1, 0, 0);
      dir.normalize();
      this.previewExplodeDirections.push(dir);
    }

    this.applyExplode();
  }

  clearPreviewSplit() {
    this.previewGroup.clear();
    this.previewObjects = [];
    this.previewRestPositions = [];
    this.previewExplodeDirections = [];
  }

  setMoldPieces(geometries: THREE.BufferGeometry[], blockCenter: THREE.Vector3) {
    this.pieceGroup.clear();
    this.pieceMeshes = [];
    this.pieceExplodeDirections = [];

    geometries.forEach((geometry, i) => {
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox!.getCenter(center);
      const material = new THREE.MeshStandardMaterial({
        color: PIECE_COLORS[i % PIECE_COLORS.length],
        roughness: 0.6,
        metalness: 0.05,
        wireframe: this.wireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);
      this.pieceGroup.add(mesh);
      this.pieceMeshes.push(mesh);
      const dir = new THREE.Vector3(center.x - blockCenter.x, 0, center.z - blockCenter.z);
      if (dir.lengthSq() < 1e-6) dir.set(i % 2 === 0 ? -1 : 1, 0, 0);
      dir.normalize();
      this.pieceExplodeDirections.push(dir);
    });

    this.applyExplode();
  }

  setExplode(amount01: number) {
    this.explodeAmount = amount01;
    this.applyExplode();
  }

  private applyExplode() {
    const distance = 60 * this.explodeAmount;
    this.pieceMeshes.forEach((mesh, i) => {
      const dir = this.pieceExplodeDirections[i];
      mesh.position.set(dir.x * distance, 0, dir.z * distance);
    });
    this.previewObjects.forEach((obj, i) => {
      const dir = this.previewExplodeDirections[i];
      const rest = this.previewRestPositions[i];
      obj.position.set(rest.x + dir.x * distance, rest.y, rest.z + dir.z * distance);
    });
  }

  clearMoldPieces() {
    this.pieceGroup.clear();
    this.pieceMeshes = [];
    this.pieceExplodeDirections = [];
  }

  get moldPieceMeshes() {
    return this.pieceMeshes;
  }

  setWireframe(on: boolean) {
    this.wireframe = on;
    if (this.modelMesh) (this.modelMesh.material as THREE.MeshStandardMaterial).wireframe = on;
    this.pieceMeshes.forEach((m) => ((m.material as THREE.MeshStandardMaterial).wireframe = on));
  }

  fitView() {
    const box = new THREE.Box3();
    let hasContent = false;
    if (this.modelMesh && this.modelMesh.visible) {
      box.expandByObject(this.modelMesh);
      hasContent = true;
    }
    if (this.pieceMeshes.length) {
      this.pieceMeshes.forEach((m) => box.expandByObject(m));
      hasContent = true;
    }
    if (!hasContent) {
      const bed = this.bedSize;
      box.setFromCenterAndSize(new THREE.Vector3(0, bed * 0.15, 0), new THREE.Vector3(bed, bed * 0.3, bed));
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 40);
    const distance = hasContent ? maxDim * 1.8 : maxDim * 2.3;
    const dir = new THREE.Vector3(0.78, 0.92, 0.78).normalize();
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.controls.target.copy(center);
    this.camera.near = Math.max(0.1, distance / 100);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
  }
}
