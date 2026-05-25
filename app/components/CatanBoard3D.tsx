'use client';
import { useEffect, useRef } from 'react';

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
  ore:    { url: '/ore.gltf',          color: 0x7A8A8A, offset: { x: 0,     y: 0,  z: 0     }, scale: 1.15,    rotation: 0           },
  sheep:  { url: '/sheep.gltf',        color: 0x78C850, offset: { x: 0,  y: 0,   z: 0  }, scale: 1.15, rotation: Math.PI / 6 },
  wheat:  { url: '/wheat.gltf',        color: 0xDAA520, offset: { x: 0, y: 0,  z: 0 }, scale: 1.15, rotation: Math.PI / 6 },
  desert: { url: '/desert.gltf',       color: 0xD2B48C, offset: { x: 0,     y: 0,  z: 0  }, scale: 1.15,  rotation: 0           },
  wood:   { url: '/wood.gltf',         color: 0x2D6A2D, offset: { x: 0,     y: 0, z: 0 }, scale: 1.15,  rotation: 0           },
  brick:  { url: '/brick.gltf',        color: 0xC1440E, offset: { x: 0,  y: 0, z: 0 }, scale: 1.15, rotation: Math.PI / 6 },
} as const;

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

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  className?: string;
  /** Optional CV tile layout (19 entries, worldPos order). Defaults to main.js layout. */
  tileTypes?: TileType[];
  settlements?: SettlementInfo[];
  roads?: RoadInfo[];
  /** worldPos index of the tile the robber is on (0–18). null/undefined hides it. */
  robberWorldIndex?: number | null;
  harbourScale?: number;
};

export default function CatanBoard3D({ className, tileTypes, settlements, roads, robberWorldIndex }: Props) {
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

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping      = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
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
          gltfLoader.load(url, (gltf: any) => {
            if (disposed) return;
            const model = gltf.scene;
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

      // ── Harbours ─────────────────────────────────────────────────────────────
      HARBOURS.forEach(({ q, r, edge, type }) => {
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
        while (piecesGroup.children.length > 0) piecesGroup.remove(piecesGroup.children[0]);

        for (const { q: sQ, r: sR, v, color } of newSettlements) {
          const pos = hexVertexWorld(sQ, sR, v);
          const mat  = new THREE.MeshStandardMaterial({ color });
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.25, 4), mat);
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
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.15, R),
            new THREE.MeshStandardMaterial({ color }),
          );
          mesh.position.set(pos.x, 0, pos.z);
          mesh.rotation.y = pos.rotation;
          piecesGroup.add(mesh);
        }

        if (
          typeof newRobberWorldIndex === 'number' &&
          newRobberWorldIndex >= 0 &&
          newRobberWorldIndex < worldPos.length
        ) {
          const rPos = worldPos[newRobberWorldIndex];
          const mat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.2 });
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.15, 16), mat);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat);
          base.position.y = 0.075;
          head.position.y = 0.28;
          const g = new THREE.Group();
          g.add(base, head);
          g.position.set(rPos.x, 0, rPos.z);
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
