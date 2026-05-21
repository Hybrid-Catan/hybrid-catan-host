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
export type CVPort = { cx: number; cy: number; label: string; resource: string };
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
    }));

    const vertex_colors: CVVertex[] = rawVertices.map((v, i) => ({
        id: (v.id as number) ?? i,
        cx: v.cx as number,
        cy: v.cy as number,
        hexIndex: v.hexIndex as number,
        color: (v.color as string | null) ?? null,
    }));

    const edge_colors: CVEdge[] = rawEdges.map(e => ({
        cx: e.cx as number,
        cy: e.cy as number,
        angle: e.angle as number,
        hexIndex: e.hexIndex as number,
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

/** Which ports each player owns (settlement on a port vertex) */
export function getPlayerToPortMap(
    state: CVBoardState,
    gameState: GameState
): Record<string, CVPort[]> {
    const result: Record<string, CVPort[]> = {};

    for (const vertex of state.vertex_colors) {
        if (!vertex.color) continue;
        const playerColor = CV_TO_GAME_COLOR[vertex.color];
        const player = gameState.players.find(p => p.color === playerColor);
        if (!player) continue;

        // Check if this vertex is near a port blob
        const nearPort = state.port_results.find(
            p => Math.hypot(p.cx - vertex.cx, p.cy - vertex.cy) < 60
        );
        if (!nearPort) continue;

        const id = player.playerId;
        if (!result[id]) result[id] = [];
        if (!result[id].find(p => p.cx === nearPort.cx)) {
            result[id].push(nearPort);
        }
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