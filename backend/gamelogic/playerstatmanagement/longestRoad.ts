/**
 * Longest Road computation — pure graph DFS.
 *
 * Edges are passed in with their two endpoint vertex IDs (assigned by the CV
 * pipeline; see model.py's vertex_list / edge_list dedup). No geometry here.
 *
 * Catan blocking rule: an opponent's settlement/city on a vertex breaks the
 * chain at that vertex — you can end a road there but cannot pass through.
 * Your own buildings do NOT block, so callers should pass a `blockedVertices`
 * set containing only OPPONENT-occupied vertex IDs.
 */

export type RoadEdge = { vertexA: number; vertexB: number };

/**
 * Returns the length of the longest continuous chain of roads.
 *
 * @param roads             Player's roads as {vertexA, vertexB} edge IDs.
 *                          Edges with vertexA/B < 0 are skipped.
 * @param blockedVertices   Vertex IDs occupied by OPPONENTS. Chains cannot
 *                          pass through these (but can end at them).
 */
export function computeLongestRoad(
    roads: RoadEdge[],
    blockedVertices: Set<number> = new Set(),
): number {
    if (roads.length === 0) return 0;

    const adj = new Map<number, Array<{ edge: number; other: number }>>();
    for (let i = 0; i < roads.length; i++) {
        const { vertexA, vertexB } = roads[i];
        if (vertexA < 0 || vertexB < 0 || vertexA === vertexB) continue;
        if (!adj.has(vertexA)) adj.set(vertexA, []);
        if (!adj.has(vertexB)) adj.set(vertexB, []);
        adj.get(vertexA)!.push({ edge: i, other: vertexB });
        adj.get(vertexB)!.push({ edge: i, other: vertexA });
    }

    let max = 0;
    const visited = new Array(roads.length).fill(false);

    const dfs = (v: number, depth: number) => {
        if (depth > max) max = depth;
        const neighbors = adj.get(v) ?? [];
        for (const { edge, other } of neighbors) {
            if (visited[edge]) continue;
            visited[edge] = true;
            // Opponent at `other` — segment ends there: count the edge, don't extend.
            if (blockedVertices.has(other)) {
                if (depth + 1 > max) max = depth + 1;
            } else {
                dfs(other, depth + 1);
            }
            visited[edge] = false;
        }
    };

    for (const v of adj.keys()) {
        dfs(v, 0);
    }
    return max;
}
