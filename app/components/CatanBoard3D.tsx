'use client';
import { useEffect, useRef } from 'react';

// Module-level GLTF promise cache — survives React remounts so models are
// only fetched and parsed once per browser session.
const _gltfCache = new Map<string, Promise<any>>();

// ── Hex math (render/src/hex.js) ──────────────────────────────────────────────
const R            = 1;
const GRID_RADIUS  = 2;
const tileInradius = R * Math.sqrt(3) / 2;

function hexToWorld(q: number, r: number) {
  return { x: R * Math.sqrt(3) * (q + r / 2), z: R * 1.5 * r };
}
function hexVertexWorld(q: number, r: number, v: number) {
  const c = hexToWorld(q, r);
  const a = (v * Math.PI) / 3;
  return { x: c.x + R * Math.sin(a), z: c.z - R * Math.cos(a) };
}
function hexEdgeWorld(q: number, r: number, e: number) {
  const v0 = hexVertexWorld(q, r, e);
  const v1 = hexVertexWorld(q, r, (e + 1) % 6);
  return {
    x: (v0.x + v1.x) / 2,
    z: (v0.z + v1.z) / 2,
    rotation: Math.atan2(v1.x - v0.x, v1.z - v0.z),
  };
}

const coords: [number, number][] = [];
for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++)
  for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++)
    if (Math.abs(q + r) <= GRID_RADIUS) coords.push([q, r]);

const worldPos = coords.map(([q, r]) => hexToWorld(q, r));

// ── Tile config (render/src/main.js TILE_CONFIG) ──────────────────────────────
const TILE_CONFIG = {
  ore:    { url: '/ore.gltf',    color: 0x7A8A8A, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: 0,           tokenOffset: { x: 0, y: 0.1, z: 0.5 } },
  sheep:  { url: '/sheep.gltf',  color: 0x78C850, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: Math.PI / 6, tokenOffset: { x: 0.1, y: 0.1, z: 0.3 } },
  wheat:  { url: '/wheat.gltf',  color: 0xDAA520, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: Math.PI / 6, tokenOffset: { x: -0.42, y: 0.1, z: 0.22 } },
  desert: { url: '/desert.gltf', color: 0xD2B48C, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: 0,           tokenOffset: { x: 0, y: 0.1, z: 0 } },
  wood:   { url: '/wood.gltf',   color: 0x2D6A2D, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: 0,           tokenOffset: { x: 0.2, y: 0.1, z: 0.2 } },
  brick:  { url: '/brick.gltf',  color: 0xA0522D, offset: { x: 0, y: 0, z: 0 }, scale: 1.15, rotation: Math.PI / 6, tokenOffset: { x: 0, y: 0.1, z: -0.5 } },
};

type TileType = keyof typeof TILE_CONFIG;

// CV resource name → render tile type
const CV_TO_TILE: Record<string, TileType> = {
  Mountain: 'ore',
  Pasture:  'sheep',
  Field:    'wheat',
  Desert:   'desert',
  Forest:   'wood',
  Hills:    'brick',
};

// Default layout (render/src/main.js tileTypes), indexed by worldPos order
const DEFAULT_TILES: TileType[] = [
  'wood', 'sheep', 'ore',
  'wheat', 'wood', 'sheep', 'brick',
  'wheat', 'desert', 'ore', 'sheep', 'brick',
  'wood', 'wheat', 'sheep', 'ore',
  'wood', 'brick', 'wheat',
];

// Number token for each worldPos (null = desert, no token). Derived from
// CATAN_SPIRAL_NUMBERS assigned in spiral order over CATAN_SPIRAL_POSITIONS.
const DEFAULT_NUMBERS: (number | null)[] = [
  8, 4, 11, 10, 11, 3, 12, 5, 9, null, 6, 9, 2, 4, 5, 10, 6, 3, 8,
];

// ── Harbour positions (render/src/main.js) ────────────────────────────────────
const HARBOUR_DIST = 0.6; // multiplier on tileInradius — lower = closer to the board edge

const HARBOUR_URLS: Record<string, string> = {
  '3to1': '/3_to_1_harbour.gltf',
  wood:   '/wood_harbour.gltf',
  ore:    '/ore_harbour.gltf',
  wool:   '/wool_harbour.gltf',
  brick:  '/brick_harbour/brick_harbour.gltf',
  wheat:  '/wheat_harbour/wheat_harbour.gltf',
};

const HARBOUR_COLORS: Record<string, number> = {
  '3to1': 0x8B4513,
  wood:   0x2D6A2D,
  ore:    0x7A8A8A,
  wool:   0x78C850,
  brick:  0xC1440E,
  wheat:  0xDAA520,
};

const HARBOURS = [
  { q:  0, r: -2, edge: 5, type: '3to1'  },
  { q: 1, r:  -2, edge: 0, type: 'wheat' },
  { q:  2, r: -1, edge: 0, type: 'ore'   },
  { q:  2, r: 0, edge: 1, type: '3to1'  },
  { q:  1, r:  1, edge: 2, type: 'wool'  },
  { q: -1, r:  2, edge: 2, type: '3to1'  },
  { q: -2, r: 2, edge: 3, type: '3to1'  },
  { q:  -2, r:  1, edge: 4, type: 'brick' },
  { q:  -1, r:  -1, edge: 4, type: 'wood'  },
];

// ── Piece types ───────────────────────────────────────────────────────────────
export type SettlementInfo = { q: number; r: number; v: number; color: number };
export type RoadInfo       = { q: number; r: number; e: number; color: number };
export type HarbourInfo    = { q: number; r: number; edge: number; type: string };

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  className?: string;
  /** Optional CV tile layout (19 entries, worldPos order). Defaults to main.js layout. */
  tileTypes?: TileType[];
  settlements?: SettlementInfo[];
  roads?: RoadInfo[];
  /** worldPos index of the tile the robber is on (0–18). null/undefined hides it. */
  robberWorldIndex?: number | null;
  /** CV-detected harbour positions. Entries here replace the matching type in the default HARBOURS layout. */
  harbourOverrides?: HarbourInfo[];
  /** Number token for each worldPos (19 entries). null = no token (desert). Defaults to standard spiral layout. */
  tileNumbers?: (number | null)[];
};

export default function CatanBoard3D({ className, tileTypes, settlements, roads, robberWorldIndex, harbourOverrides, tileNumbers }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const updatePiecesRef = useRef<((s: SettlementInfo[], r: RoadInfo[], rob: number | null | undefined) => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animId   = 0;
    let cleanup  = () => {};

    (async () => {
      const [THREE, { OrbitControls }, { GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      if (disposed) return;

      // ── Scene ────────────────────────────────────────────────────────────────
      const W = container.clientWidth  || 800;
      const H = container.clientHeight || 600;

      THREE.Cache.enabled = true;

      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping      = THREE.NoToneMapping;
      container.appendChild(renderer.domElement);

      let needsRender = true;
      const requestRender = () => { needsRender = true; };
      requestRenderRef.current = requestRender;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 100);
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.addEventListener('change', requestRender);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(5, 10, 7);
      scene.add(dirLight);
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));

      // ── Board base (render/src/board.js) ─────────────────────────────────────
      const BASE_HEIGHT  = 0.4;
      const baseInradius = Math.max(...worldPos.map(p => Math.abs(p.z))) + R + 1;
      const baseL        = baseInradius * 2 / Math.sqrt(3);
      const boardGeo     = new THREE.CylinderGeometry(baseL, baseL, BASE_HEIGHT, 6);
      boardGeo.rotateY(Math.PI / 2);

      // Apply board UVs so the decal texture maps correctly
      const halfW = baseL, halfH2 = baseL * Math.sqrt(3) / 2;
      const pos   = boardGeo.attributes.position;
      const uv    = boardGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) + halfW) / (2 * halfW), 1 - (pos.getZ(i) + halfH2) / (2 * halfH2));
      }
      uv.needsUpdate = true;

      const boardMesh = new THREE.Mesh(boardGeo, new THREE.MeshBasicMaterial({ color: 0x5c3a1e }));
      boardMesh.position.y = -(BASE_HEIGHT / 2 + 0.05);
      scene.add(boardMesh);

      new THREE.TextureLoader().load('/background.png', (tex) => {
        if (disposed) return;
        (boardMesh as any).material = new THREE.MeshBasicMaterial({ map: tex });
        requestRender();
      });

      // ── addObject (render/src/objects.js) ────────────────────────────────────
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/draco/');
      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);
      await MeshoptDecoder.ready;
      gltfLoader.setMeshoptDecoder(MeshoptDecoder);

      // Load a GLTF once; return the cached promise on subsequent calls.
      function loadGltf(url: string): Promise<any> {
        if (!_gltfCache.has(url)) {
          _gltfCache.set(url, new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej)));
        }
        return _gltfCache.get(url)!;
      }

      // Dispose all GPU resources owned by an object subtree.
      function disposeMeshes(obj: any) {
        obj.traverse((child: any) => {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => m?.dispose());
        });
      }

      // Shared piece geometries — allocated once, reused across all updatePieces calls.
      const sharedGeo = {
        body:       new THREE.BoxGeometry(0.3, 0.3, 0.3),
        roof:       new THREE.ConeGeometry(0.25, 0.25, 4),
        road:       new THREE.BoxGeometry(0.15, 0.15, R),
        robberBase: new THREE.CylinderGeometry(0.18, 0.22, 0.15, 16),
        robberHead: new THREE.SphereGeometry(0.16, 16, 12),
      };

      function addObject({ type, position, color = null, scale = 1, url = '', rotation = 0 }: {
        type: string;
        position: { x: number; y?: number; z: number };
        color?: number | null;
        scale?: number;
        url?: string;
        rotation?: number;
      }) {
        if (type === 'gltf') {
          const wrapper = new THREE.Group();
          wrapper.position.set(position.x, position.y ?? 0, position.z);
          wrapper.rotation.y = rotation;
          scene.add(wrapper);
          loadGltf(url).then((gltf: any) => {
            if (disposed) return;
            const model = gltf.scene.clone(true);
            if (color !== null) {
              // GLTF tiles ship with PBR baseColorFactor ≈ [0.85,0.85,0.85] (grey).
              // Setting material.color alone gets crushed by the factor + tone
              // mapping. Swap in a fresh MeshStandardMaterial so the resource
              // colour reads cleanly.
              model.traverse((c: any) => {
                if (c.isMesh) {
                  c.material = new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.7,
                    metalness: 0.05,
                  });
                }
              });
            }
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            const sz  = new THREE.Vector3(); box.getSize(sz);
            const ctr = new THREE.Vector3(); box.getCenter(ctr);
            model.position.set(model.position.x - ctr.x, model.position.y - box.min.y, model.position.z - ctr.z);
            const maxH = Math.max(sz.x, sz.z) / 2;
            wrapper.scale.setScalar((maxH > 0 ? tileInradius / maxH : 1) * scale);
            wrapper.add(model);
            requestRender();
          });
          return wrapper;
        }

        if (type === 'settlement') {
          const mat  = new THREE.MeshStandardMaterial({ color: color ?? 0xffffff });
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.25, 4), mat);
          body.position.y = 0.15;
          roof.position.y = 0.425;
          roof.rotation.y = Math.PI / 4;
          const g = new THREE.Group();
          g.add(body, roof);
          g.scale.setScalar(scale);
          g.position.set(position.x, position.y ?? 0, position.z);
          g.rotation.y = rotation;
          scene.add(g);
          return g;
        }

        // beam / generic primitive
        const geo = type === 'beam'
          ? new THREE.BoxGeometry(0.15, 0.15, R)
          : new THREE.BoxGeometry(0.5, 0.5, 0.5);
        geo.computeBoundingBox();
        const halfH = (geo.boundingBox!.max.y - geo.boundingBox!.min.y) / 2;
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color ?? 0xffffff }));
        mesh.position.set(position.x, (position.y ?? 0) + halfH * scale, position.z);
        mesh.scale.setScalar(scale);
        mesh.rotation.y = rotation;
        scene.add(mesh);
        return mesh;
      }

      // ── Tiles (render/src/main.js) ────────────────────────────────────────────
      const layout = tileTypes ?? DEFAULT_TILES;
      worldPos.forEach(({ x, z }, i) => {
        const type = layout[i] ?? 'ore';
        const cfg  = TILE_CONFIG[type];
        addObject({
          type: 'gltf', url: cfg.url, color: cfg.color,
          position: { x: x + cfg.offset.x, y: cfg.offset.y, z: z + cfg.offset.z },
          scale: cfg.scale, rotation: cfg.rotation,
        });
      });

      // ── Number tokens ────────────────────────────────────────────────────────
      const numbers  = tileNumbers ?? DEFAULT_NUMBERS;
      const tokenGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16);
      const sideMat  = new THREE.MeshBasicMaterial({ color: 0xc4a030 });
      // Cache top-face textures by number value — at most 10 unique digits.
      const texCache = new Map<number, any>();
      function getTopMat(num: number) {
        if (texCache.has(num)) return texCache.get(num)!;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#f5e2a0';
        ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a5c1e'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = (num === 6 || num === 8) ? '#cc1111' : '#1a1005';
        ctx.font = 'bold 62px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(num), 64, 64);
        const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
        texCache.set(num, mat);
        return mat;
      }
      worldPos.forEach(({ x, z }, i) => {
        const num = numbers[i];
        if (num == null) return;
        const tileType    = layout[i] ?? 'ore';
        const tokenOffset = TILE_CONFIG[tileType].tokenOffset;
        // CylinderGeometry groups: 0=side, 1=top cap, 2=bottom cap
        const token = new THREE.Mesh(tokenGeo, [sideMat, getTopMat(num), sideMat]);
        token.position.set(x + tokenOffset.x, tokenOffset.y, z + tokenOffset.z);
        scene.add(token);
      });

      // ── Harbours ─────────────────────────────────────────────────────────────
      // If CV detected the brick harbour at a different position than the default,
      // the whole board is rotated. Find how many 60° CCW steps map the default
      // brick position to the detected one, then rotate ALL harbours by that amount.
      function rotateHex60CCW(q: number, r: number): [number, number] {
        return [-r, q + r];
      }
      function applyRotation(q: number, r: number, edge: number, steps: number) {
        let cq = q, cr = r, ce = edge;
        const n = ((steps % 6) + 6) % 6;
        for (let i = 0; i < n; i++) { [cq, cr] = rotateHex60CCW(cq, cr); ce = (ce + 1) % 6; }
        return { q: cq, r: cr, edge: ce };
      }
      const defaultBrick   = HARBOURS.find(h => h.type === 'brick')!;
      const brickCandidates = (harbourOverrides ?? []).filter(h => h.type === 'brick');
      let rotSteps = 0;
      outer: for (const candidate of brickCandidates) {
        for (let n = 0; n < 6; n++) {
          const t = applyRotation(defaultBrick.q, defaultBrick.r, defaultBrick.edge, n);
          if (t.q === candidate.q && t.r === candidate.r && t.edge === candidate.edge) {
            rotSteps = n; break outer;
          }
        }
      }
      const activeHarbours = HARBOURS.map(h => ({ ...applyRotation(h.q, h.r, h.edge, rotSteps), type: h.type }));
      activeHarbours.forEach(({ q, r, edge, type }) => {
        const ctr = hexToWorld(q, r);
        const ep  = hexEdgeWorld(q, r, edge);
        const dx  = ep.x - ctr.x, dz = ep.z - ctr.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        addObject({
          type: 'gltf',
          url:  HARBOUR_URLS[type] ?? '/3_to_1_harbour.gltf',
          color: HARBOUR_COLORS[type] ?? 0x8B4513,
          position: { x: ep.x + (dx / len) * tileInradius * HARBOUR_DIST, y: 0, z: ep.z + (dz / len) * tileInradius * HARBOUR_DIST },
          scale: 0.7,
          rotation: Math.atan2(dx / len, dz / len),
        });
      });

      // ── Pieces (settlements + roads) ─────────────────────────────────────────
      const piecesGroup = new THREE.Group();
      scene.add(piecesGroup);

      function updatePieces(
        newSettlements: SettlementInfo[],
        newRoads: RoadInfo[],
        newRobberWorldIndex: number | null | undefined,
      ) {
        while (piecesGroup.children.length > 0) {
          const child = piecesGroup.children[0];
          piecesGroup.remove(child);
          disposeMeshes(child);
        }

        for (const { q: sQ, r: sR, v, color } of newSettlements) {
          const pos  = hexVertexWorld(sQ, sR, v);
          const mat  = new THREE.MeshStandardMaterial({ color });
          const body = new THREE.Mesh(sharedGeo.body, mat);
          const roof = new THREE.Mesh(sharedGeo.roof, mat);
          body.position.y = 0.15;
          roof.position.y = 0.425;
          roof.rotation.y = Math.PI / 4;
          const g = new THREE.Group();
          g.add(body, roof);
          g.scale.setScalar(0.7);
          g.position.set(pos.x, 0, pos.z);
          piecesGroup.add(g);
        }

        for (const { q: rQ, r: rR, e, color } of newRoads) {
          const pos  = hexEdgeWorld(rQ, rR, e);
          const mesh = new THREE.Mesh(sharedGeo.road, new THREE.MeshStandardMaterial({ color }));
          // Lift the road so it sits on top of the tile surface — at y=0 the
          // bottom half is below the base and gets clipped by tile geometry.
          mesh.position.set(pos.x, 0.12, pos.z);
          mesh.rotation.y = pos.rotation;
          piecesGroup.add(mesh);
        }

        if (
          typeof newRobberWorldIndex === 'number' &&
          newRobberWorldIndex >= 0 &&
          newRobberWorldIndex < worldPos.length
        ) {
          const rPos      = worldPos[newRobberWorldIndex];
          const tileType  = layout[newRobberWorldIndex] ?? 'ore';
          const tOff      = TILE_CONFIG[tileType].tokenOffset;
          const TOKEN_TOP = tOff.y + 0.04; // tokenOffset.y is centre; +half-height to reach top face
          const mat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.2 });
          const base = new THREE.Mesh(sharedGeo.robberBase, mat);
          const head = new THREE.Mesh(sharedGeo.robberHead, mat);
          base.position.y = 0.075;
          head.position.y = 0.28;
          const g = new THREE.Group();
          g.add(base, head);
          g.position.set(rPos.x + tOff.x, TOKEN_TOP, rPos.z + tOff.z);
          piecesGroup.add(g);
        }

        requestRender();
      }

      updatePiecesRef.current = updatePieces;
      updatePieces(settlements ?? [], roads ?? [], robberWorldIndex);

      // ── Resize observer ───────────────────────────────────────────────────────
      const ro = new ResizeObserver(() => {
        if (disposed) return;
        const W = container.clientWidth, H = container.clientHeight;
        if (!W || !H) return;
        renderer.setSize(W, H);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        requestRender();
      });
      ro.observe(container);

      const onVisChange = () => {
        if (!document.hidden) requestRender();
      };
      document.addEventListener('visibilitychange', onVisChange);

      function animate() {
        animId = requestAnimationFrame(animate);
        if (document.hidden) return;
        if (!needsRender) return;
        needsRender = false;
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      cleanup = () => {
        updatePiecesRef.current = null;
        requestRenderRef.current = null;
        cancelAnimationFrame(animId);
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVisChange);
        controls.removeEventListener('change', requestRender);
        controls.dispose();
        dracoLoader.dispose();
        // Dispose all scene GPU resources
        scene.traverse((obj: any) => {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => m?.dispose());
        });
        // Dispose shared piece geometries
        Object.values(sharedGeo).forEach(g => g.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [tileTypes]);

  useEffect(() => {
    updatePiecesRef.current?.(settlements ?? [], roads ?? [], robberWorldIndex);
  }, [settlements, roads, robberWorldIndex]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}

export { CV_TO_TILE };
export type { TileType };
