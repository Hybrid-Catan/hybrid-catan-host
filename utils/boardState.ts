// utils/cvBoardState.ts
import { resourceCards, PlayerToResourceMap } from "@/utils/type";
import { GameState } from "@/utils/type";

// ── Raw shapes from Python ────────────────────────────────────────────────────
export type CVTile = {
    spiralIndex: number;
    row: number; col: number;
    cx: number; cy: number;
    resource: "Pasture" | "Mountain" | "Field" | "Hills" | "Forest" | "Desert" | "Water";
    number: number | null;
};
export type CVPort = {
    cx: number; cy: number; label: string; resource: string;
    row?: number;  col?: number;  cv_edge?: number;
    row2?: number; col2?: number; cv_edge2?: number;
};
export type CVVertex = { id: number; cx: number; cy: number; hexIndex: number; color: string | null };
export type CVEdge = {
    cx: number; cy: number; angle: number; hexIndex: number; color: string | null;
    /** Index into CVBoardState.vertex_colors. -1 if unresolved. */
    vertexA: number;
    /** Index into CVBoardState.vertex_colors. -1 if unresolved. */
    vertexB: number;
};

export type CVBoardState = {
    tile_results: CVTile[];
    port_results: CVPort[];
    robber_tile_index: number | null;
    vertex_colors: CVVertex[];
    edge_colors: CVEdge[];
};

// CV color string → game player color
export const CV_TO_GAME_COLOR: Record<string, string> = {
    orange: "ORANGE", red: "RED", blue: "BLUE", white: "WHITE",
};

// CV resource name → resourceCards key
const CV_TO_RESOURCE: Record<string, keyof resourceCards> = {
    Pasture: "WOOL", Mountain: "ORE", Field: "WHEAT",
    Hills: "BRICK", Forest: "WOOD",
};

export function parseBoardState(state: Record<string, unknown>): CVBoardState {
    const rawTiles = (state.tile_results as Array<Record<string, unknown>>) ?? [];
    const rawPorts = (state.port_results as Array<Record<string, unknown>>) ?? [];
    const rawVertices = (state.vertex_colors as Array<Record<string, unknown>>) ?? [];
    const rawEdges = (state.edge_colors as Array<Record<string, unknown>>) ?? [];

    const tile_results: CVTile[] = rawTiles.map(t => ({
        spiralIndex: t.spiralIndex as number,
        row: t.row as number,
        col: t.col as number,
        cx: t.cx as number,
        cy: t.cy as number,
        resource: t.resource as CVTile["resource"],
        number: (t.number as number | null) ?? null,
    }));

    const port_results: CVPort[] = rawPorts.map(p => ({
        cx: p.cx as number,
        cy: p.cy as number,
        label: p.label as string,
        resource: p.resource as string,
        row:      p.row      != null ? (p.row      as number) : undefined,
        col:      p.col      != null ? (p.col      as number) : undefined,
        cv_edge:  p.cv_edge  != null ? (p.cv_edge  as number) : undefined,
        row2:     p.row2     != null ? (p.row2     as number) : undefined,
        col2:     p.col2     != null ? (p.col2     as number) : undefined,
        cv_edge2: p.cv_edge2 != null ? (p.cv_edge2 as number) : undefined,
    }));

    // CV emits hexIndex as a list (interior vertices/edges are shared across
    // multiple hexes). Any hex in the list anchors the same world position, so
    // we collapse to the first.
    const firstHex = (h: unknown): number =>
        Array.isArray(h) ? (h[0] as number) : (h as number);

    const vertex_colors: CVVertex[] = rawVertices.map((v, i) => ({
        id: (v.id as number) ?? i,
        cx: v.cx as number,
        cy: v.cy as number,
        hexIndex: firstHex(v.hexIndex),
        color: (v.color as string | null) ?? null,
    }));

    const edge_colors: CVEdge[] = rawEdges.map(e => ({
        cx: e.cx as number,
        cy: e.cy as number,
        angle: e.angle as number,
        hexIndex: firstHex(e.hexIndex),
        color: (e.color as string | null) ?? null,
        vertexA: (e.vertexA as number) ?? -1,
        vertexB: (e.vertexB as number) ?? -1,
    }));

    return {
        tile_results,
        port_results,
        robber_tile_index: (state.robber_tile_index as number | null) ?? null,
        vertex_colors,
        edge_colors,
    };
}


// ── Map builders ──────────────────────────────────────────────────────────────

/** Which hex tiles are adjacent to each player's settlements/cities */
export function getPlayerToHexMap(
    state: CVBoardState,
    gameState: GameState
): Record<string, number[]> {
    const result: Record<string, number[]> = {};

    // Deduplicate vertices by (cx, cy) proximity — CV emits shared vertices
    // once per adjacent hex, so the same physical vertex appears up to 3×
    const visited = new Set<string>();

    for (const vertex of state.vertex_colors) {
        if (!vertex.color) continue;
        const key = `${Math.round(vertex.cx / 4)},${Math.round(vertex.cy / 4)}`; // ~4px snap
        if (visited.has(key)) continue;
        visited.add(key);

        const playerColor = CV_TO_GAME_COLOR[vertex.color];
        if (!playerColor) continue;

        const player = gameState.players.find(p => p.color === playerColor);
        if (!player) continue;

        const id = player.playerId;
        if (!result[id]) result[id] = [];

        // Collect all hex indices adjacent to this vertex
        const adjacent = state.vertex_colors
            .filter(v => v.color === vertex.color &&
                Math.abs(v.cx - vertex.cx) < 8 &&
                Math.abs(v.cy - vertex.cy) < 8 &&
                v.hexIndex != null)
            .map(v => v.hexIndex);

        for (const idx of adjacent) {
            if (!result[id].includes(idx)) result[id].push(idx);
        }
    }
    return result;
}


// ── Port layout ───────────────────────────────────────────────────────────────
//
// The standard Catan board has 9 ports spread across 30 perimeter vertices.
// Each port occupies 2 consecutive vertices (the two corners of a coastal hex
// face). Port[0] is anchored at the brick boat's inward vertex.
//
// OFFSETS: the 0-based index of each port's FIRST vertex in the clockwise
// perimeter walk starting from the brick port vertex.
// Fill in the real offsets once you've verified the walk order on a real board.
//
//   offset  resource
//   ──────  ────────
//   0       BRICK   ← anchor (the brick boat itself)
//   3       WOOD
//   6       WOOL
//   9       ANY
//   12      ORE
//   15      ANY
//   18      WHEAT
//   21      ANY
//   24      ANY
//
// Each entry covers that offset AND offset+1 (both vertices of the port face).
const PORT_LAYOUT: Array<{ offset: number; resource: string }> = [
    { offset: 3,  resource: "WOOD"  },
    { offset: 6,  resource: "ANY"  },
    { offset: 9,  resource: "WHEAT"   },
    { offset: 13, resource: "ORE"   },
    { offset: 16, resource: "ANY"   },
    { offset: 19, resource: "WOOL" },
    { offset: 23, resource: "ANY"   },
    { offset: 26, resource: "ANY"   },
    { offset: 29, resource: "BRICK"   },
];

// ── Graph helpers (mirrors computeLongestRoad pattern) ────────────────────────

/** Vertex-id → list of neighbouring vertex-ids, built from CVEdge data. */
function buildVertexAdjacency(edges: CVEdge[]): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (const e of edges) {
        const { vertexA, vertexB } = e;
        if (vertexA < 0 || vertexB < 0 || vertexA === vertexB) continue;
        if (!adj.has(vertexA)) adj.set(vertexA, []);
        if (!adj.has(vertexB)) adj.set(vertexB, []);
        adj.get(vertexA)!.push(vertexB);
        adj.get(vertexB)!.push(vertexA);
    }
    // Deduplicate neighbours (the CV pipeline can emit duplicate edges)
    for (const [v, ns] of adj) adj.set(v, [...new Set(ns)]);
    return adj;
}

/**
 * Returns the set of perimeter vertex IDs.
 * Inner vertices connect to 6 neighbours on a standard hex grid;
 * edge vertices have 3, and corner vertices have 2.
 * Anything with ≤ 3 neighbours is on the perimeter.
 */
function findPerimeterVertices(adj: Map<number, number[]>): Set<number> {
    const perimeter = new Set<number>();
    for (const [v, ns] of adj) {
        if (ns.length <= 3) perimeter.add(v);
    }
    return perimeter;
}

/**
 * Walk the perimeter clockwise starting from `startId`, returning the ordered
 * list of perimeter vertex IDs (length 30 for a standard board).
 *
 * Strategy: at each step, among the current vertex's perimeter neighbours,
 * pick the one that keeps us turning clockwise. "Clockwise" relative to the
 * board centre is determined by the sign of the cross product
 *   (prev→cur) × (cur→next)
 * being negative (right turn) in a y-down image coordinate system.
 */
function walkPerimeterClockwise(
    startId: number,
    adj: Map<number, number[]>,
    perimeter: Set<number>,
    vertexById: Map<number, CVVertex>,
    centerX: number,
    centerY: number,
): number[] {
    const order: number[] = [startId];
    const visited = new Set<number>([startId]);

    // For the very first step we have no "previous" vertex, so we pick the
    // perimeter neighbour that is most clockwise relative to the board centre.
    const firstNeighbours = (adj.get(startId) ?? []).filter(n => perimeter.has(n));
    if (firstNeighbours.length === 0) return order;

    // Angle of start vertex relative to centre
    const sv = vertexById.get(startId)!;
    const startAngle = Math.atan2(sv.cy - centerY, sv.cx - centerX);

    // Pick the neighbour whose angle is just clockwise (slightly greater, mod 2π)
    let prev = startId;
    let cur = firstNeighbours.reduce((best, n) => {
        const nv = vertexById.get(n)!;
        const bv = vertexById.get(best)!;
        const aN = (Math.atan2(nv.cy - centerY, nv.cx - centerX) - startAngle + 2 * Math.PI) % (2 * Math.PI);
        const aB = (Math.atan2(bv.cy - centerY, bv.cx - centerX) - startAngle + 2 * Math.PI) % (2 * Math.PI);
        // We want the smallest positive angular step clockwise
        return aN < aB ? n : best;
    });
    order.push(cur);
    visited.add(cur);

    // Continue around the ring: at each step, among unvisited perimeter
    // neighbours, choose the one making the most clockwise turn.
    while (order.length < 30) {
        const pv = vertexById.get(prev)!;
        const cv = vertexById.get(cur)!;
        const dx = cv.cx - pv.cx;
        const dy = cv.cy - pv.cy;

        const candidates = (adj.get(cur) ?? []).filter(
            n => perimeter.has(n) && !visited.has(n)
        );
        if (candidates.length === 0) break;

        // Pick the candidate that produces the most clockwise turn.
        // Cross product (prev→cur) × (cur→next) < 0 means right turn (CW, y-down).
        // Among multiple candidates, maximise that rightward-ness.
        const next = candidates.reduce((best, n) => {
            const nv = vertexById.get(n)!;
            const bv = vertexById.get(best)!;
            const crossN = dx * (nv.cy - cv.cy) - dy * (nv.cx - cv.cx);
            const crossB = dx * (bv.cy - cv.cy) - dy * (bv.cx - cv.cx);
            // More negative cross = more clockwise in y-down coords
            return crossN < crossB ? n : best;
        });

        order.push(next);
        visited.add(next);
        prev = cur;
        cur = next;
    }

    return order;
}

/**
 * Infers port ownership from a single reliable brick-boat detection.
 *
 * Replaces the geometry-probe approach in `getPlayerToPortMap`. Instead of
 * checking each vertex against every port blob, we:
 *   1. Build the vertex adjacency graph from edge_colors.
 *   2. Identify the 30 perimeter vertices (degree ≤ 3).
 *   3. Anchor on the brick port: find the perimeter vertex closest to board
 *      centre among those near the detected brick boat.
 *   4. Walk clockwise to produce an ordered list of 30 perimeter vertices.
 *   5. Project PORT_LAYOUT offsets onto that list to get per-port vertex pairs.
 *   6. For each port, check whether any player has a settlement on either vertex.
 *
 * @param brickBoatCx   Pixel x of the detected brick boat centre.
 * @param brickBoatCy   Pixel y of the detected brick boat centre.
 * @param state         CV board state (vertex_colors + edge_colors required).
 * @param gameState     Current game state for player lookup.
 */
export function getPlayerToPortMap(
    brickBoatCx: number,
    brickBoatCy: number,
    state: CVBoardState,
    gameState: GameState,
): Record<string, CVPort[]> {
    const result: Record<string, CVPort[]> = {};

    // ── 1. Build graph ────────────────────────────────────────────────────────
    const adj = buildVertexAdjacency(state.edge_colors);
    const perimeter = findPerimeterVertices(adj);

    const vertexById = new Map<number, CVVertex>(
        state.vertex_colors.map(v => [v.id, v])
    );

    // ── 2. Board centre (average of all vertex positions) ────────────────────
    const allV = state.vertex_colors;
    const centerX = allV.reduce((s, v) => s + v.cx, 0) / allV.length;
    const centerY = allV.reduce((s, v) => s + v.cy, 0) / allV.length;

    // ── 3. Anchor: perimeter vertex nearest to brick boat AND nearest to centre
    //      Among all perimeter vertices within BOAT_RADIUS px of the boat,
    //      pick the one closest to the board centre (the "inward" one).
    const BOAT_RADIUS = 80; // px — tune if needed
    const boatCandidates = [...perimeter]
        .filter(id => {
            const v = vertexById.get(id);
            return v && Math.hypot(v.cx - brickBoatCx, v.cy - brickBoatCy) < BOAT_RADIUS;
        })
        .sort((a, b) => {
            const va = vertexById.get(a)!;
            const vb = vertexById.get(b)!;
            return Math.hypot(va.cx - centerX, va.cy - centerY)
                 - Math.hypot(vb.cx - centerX, vb.cy - centerY);
        });

    if (boatCandidates.length === 0) {
        console.warn("[portDetection] No perimeter vertex found near brick boat — returning empty port map.");
        return result;
    }

    const anchorId = boatCandidates[0]; // closest to centre → inward vertex

    // ── 4. Walk perimeter clockwise from anchor ───────────────────────────────
    const perimeterOrder = walkPerimeterClockwise(
        anchorId, adj, perimeter, vertexById, centerX, centerY
    );

    if (perimeterOrder.length < 2) {
        console.warn("[portDetection] Perimeter walk too short — check edge_colors data.");
        return result;
    }

    // ── 5. Build synthetic CVPort objects from layout offsets ─────────────────
    //      Each port covers two consecutive vertices (offset and offset+1).
    const syntheticPorts: Array<{ port: CVPort; vertexIds: [number, number] }> = [];

    for (const { offset, resource } of PORT_LAYOUT) {
        const idA = perimeterOrder[offset % perimeterOrder.length];
        const idB = perimeterOrder[(offset + 1) % perimeterOrder.length];
        const vA  = vertexById.get(idA);
        const vB  = vertexById.get(idB);
        if (!vA || !vB) continue;

        const port: CVPort = {
            cx:       (vA.cx + vB.cx) / 2,
            cy:       (vA.cy + vB.cy) / 2,
            label:    resource === "ANY" ? "3:1" : `2:1 ${resource}`,
            resource,
        };
        syntheticPorts.push({ port, vertexIds: [idA, idB] });
    }

    // ── 6. Match player settlements to port vertices ──────────────────────────
    const portVertexSet = new Map<number, CVPort>(); // vertexId → port
    for (const { port, vertexIds } of syntheticPorts) {
        portVertexSet.set(vertexIds[0], port);
        portVertexSet.set(vertexIds[1], port);
    }

    const visitedPortPlayer = new Set<string>(); // prevent duplicate entries

    for (const vertex of state.vertex_colors) {
        if (!vertex.color) continue;
        const port = portVertexSet.get(vertex.id);
        if (!port) continue;

        const playerColor = CV_TO_GAME_COLOR[vertex.color];
        const player = gameState.players.find(p => p.color === playerColor);
        if (!player) continue;

        const dedupKey = `${player.playerId}:${port.cx},${port.cy}`;
        if (visitedPortPlayer.has(dedupKey)) continue;
        visitedPortPlayer.add(dedupKey);

        if (!result[player.playerId]) result[player.playerId] = [];
        result[player.playerId].push(port);
    }

    return result;
}

/** Current robber tile index (0-based spiral order) */
export function getRobberLocationMap(state: CVBoardState): number {
    return state.robber_tile_index ?? 0;
}

/** How many settlements and cities each player has on each tile vertex */
export function getHouseToPlayerMap(
    state: CVBoardState,
    gameState: GameState
): Record<string, { settlements: number; cities: number }> {
    const result: Record<string, { settlements: number; cities: number }> = {};

    for (const player of gameState.players) {
        result[player.playerId] = {
            settlements: player.pieces.settlementsPlaced,
            cities: player.pieces.citiesPlaced,
        };
    }
    return result;
}

/**
 * Returns the IDs of vertices directly connected to `vertexId` by an edge.
 * Uses the CV-emitted vertexA/vertexB pointers — no geometry.
 */
export function getAdjacentVertices(vertexId: number, edges: CVEdge[]): number[] {
    const result: number[] = [];
    for (const e of edges) {
        if (e.vertexA === vertexId && e.vertexB >= 0) result.push(e.vertexB);
        else if (e.vertexB === vertexId && e.vertexA >= 0) result.push(e.vertexA);
    }
    return result;
}

/** Returns every edge that touches `vertexId`. */
export function getEdgesAtVertex(vertexId: number, edges: CVEdge[]): CVEdge[] {
    return edges.filter(e => e.vertexA === vertexId || e.vertexB === vertexId);
}

/** Which roads (edges) each player owns */
export function getRoadToPlayerMap(
    state: CVBoardState,
    gameState: GameState
): Record<string, Array<{ cx: number; cy: number; angle: number }>> {
    const result: Record<string, Array<{ cx: number; cy: number; angle: number }>> = {};

    const visited = new Set<string>();
    for (const edge of state.edge_colors) {
        if (!edge.color) continue;
        const key = `${Math.round(edge.cx / 4)},${Math.round(edge.cy / 4)}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const playerColor = CV_TO_GAME_COLOR[edge.color];
        const player = gameState.players.find(p => p.color === playerColor);
        if (!player) continue;

        const id = player.playerId;
        if (!result[id]) result[id] = [];
        result[id].push({ cx: edge.cx, cy: edge.cy, angle: edge.angle });
    }
    return result;
}

/**
 * Returns resources each player should receive for a given dice roll.
 * Respects the robber: blocked tile produces nothing.
 */
export function getPlayerToResourceCardMap(
    diceRoll: number,
    state: CVBoardState,
    gameState: GameState
): PlayerToResourceMap {
    const result: PlayerToResourceMap = {};
    const robberIdx = state.robber_tile_index;

    // Build tile number → tile
    const byNumber = new Map<number, CVTile[]>();
    for (const tile of state.tile_results) {
        if (tile.number == null) continue;
        const arr = byNumber.get(tile.number) ?? [];
        arr.push(tile);
        byNumber.set(tile.number, arr);
    }

    const activeTiles = byNumber.get(diceRoll) ?? [];

    // For each active tile, find adjacent player vertices
    for (const tile of activeTiles) {
        if (tile.spiralIndex === robberIdx) continue; // robber blocks
        const resourceKey = CV_TO_RESOURCE[tile.resource];
        if (!resourceKey) continue;

        const adjacentVertices = state.vertex_colors.filter(
            v => v.hexIndex === tile.spiralIndex && v.color != null
        );

        for (const vertex of adjacentVertices) {
            const playerColor = CV_TO_GAME_COLOR[vertex.color!];
            const player = gameState.players.find(p => p.color === playerColor);
            if (!player) continue;

            if (!result[player.playerId]) {
                result[player.playerId] = {
                    WOOD: 0, BRICK: 0, WOOL: 0, WHEAT: 0, ORE: 0
                };
            }
            // Cities produce 2, settlements produce 1
            const isCity = player.pieces.citiesPlaced > 0; // refine with house map if needed
            result[player.playerId][resourceKey] += isCity ? 2 : 1;
        }
    }
    return result;
}