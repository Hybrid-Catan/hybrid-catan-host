import { NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { CV_TO_GAME_COLOR } from "@/utils/boardState";
import { computePendingDiscards } from "@/backend/gamelogic/robber/discard";

export async function POST(req: Request) {
  const gameState = await req.json();
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  const sum = d1 + d2;
  const boardState = gameState.cvBoardState;

  // A roll of 7 short-circuits resource distribution and starts the
  // discard → robber-move sequence. Players with >7 cards must discard half.
  if (sum === 7) {
    const pendingDiscards = computePendingDiscards(gameState.players);
    const anyOwes = Object.keys(pendingDiscards).length > 0;
    const after = {
      ...gameState,
      dice: { sum, d1, d2 },
      phase: anyOwes ? "DISCARD" : "ROBBER",
      pendingDiscards: anyOwes ? pendingDiscards : undefined,
    };
    if (after.gameId) games.set(after.gameId, after);
    return NextResponse.json({
      gameState: after,
      dice: [d1, d2],
      resourceMap: {},
      pendingDiscards,
    });
  }

  let newGameState = {
    ...gameState,
    phase: "BUFFER",
    dice: { sum, d1, d2 },
  };
  const tileMap = new Map<number, any>(
    boardState.tile_results
      .filter((t: any) => typeof t.spiralIndex === "number")
      .map((t: any) => [t.spiralIndex, t])
  );
  // console.log("tileMap:", tileMap);
  const verticesByPlayer = new Map<string, any[]>();
  for (const v of boardState.vertex_colors) {
    if (!v.color) continue;
    const normalizedColor = CV_TO_GAME_COLOR[v.color.toLowerCase()];
    if (!normalizedColor) continue;
    if (!verticesByPlayer.has(normalizedColor)) {
      verticesByPlayer.set(normalizedColor, []);
    }
    verticesByPlayer.get(normalizedColor)!.push(v);
  }
  type Gains = {
    WHEAT: number;
    WOOD: number;
    ORE: number;
    WOOL: number;
    BRICK: number;
  };
  const RESOURCE_MAP: Record<string, keyof Gains | null> = {
    Field: "WHEAT",
    Forest: "WOOD",
    Mountain: "ORE",
    Pasture: "WOOL",
    Hills: "BRICK",
    Desert: null,
    Water: null,
  };
  const resourceMap: Record<string, any> = {};
  const totalGains = {
    WOOD: 0,
    BRICK: 0,
    WOOL: 0,
    WHEAT: 0,
    ORE: 0,
  };
  for (const player of newGameState.players) {
    const ownedVertices = verticesByPlayer.get(player.color) || [];
    const gains: Gains = {
      WOOD: 0,
      BRICK: 0,
      WOOL: 0,
      WHEAT: 0,
      ORE: 0,
    };
    for (const vertex of ownedVertices) {
      const hexes: number[] = Array.isArray(vertex.hexIndices)
        ? vertex.hexIndices
        : Array.isArray(vertex.hexIndex)
          ? vertex.hexIndex
          : typeof vertex.hexIndex === "number"
            ? [vertex.hexIndex]
            : [];

      for (const hexIndex of hexes) {
        const tile = tileMap.get(hexIndex);
        if (!tile) continue;
        if (tile.number !== sum) continue;
        const resource = RESOURCE_MAP[tile.resource] as keyof Gains | null;
        if (!resource) continue;
        gains[resource] += 1;
        totalGains[resource] += 1;
      }
    }
    resourceMap[String(player.playerId)] = gains;
  }
  console.log(resourceMap)
  const bank = { ...newGameState.bank.resourceCards };
  for (const key of Object.keys(totalGains) as (keyof typeof totalGains)[]) {
    bank[key] -= totalGains[key];
    if (bank[key] < 0) bank[key] = 0;
  }
  newGameState.bank = {
    ...newGameState.bank,
    resourceCards: bank,
  };
  newGameState.players = newGameState.players.map((player: any) => {
    const gains = resourceMap[player.playerId];
    if (!gains) return player;
    return {
      ...player,
      resourceCards: {
        WOOD: player.resourceCards.WOOD + gains.WOOD,
        BRICK: player.resourceCards.BRICK + gains.BRICK,
        WOOL: player.resourceCards.WOOL + gains.WOOL,
        WHEAT: player.resourceCards.WHEAT + gains.WHEAT,
        ORE: player.resourceCards.ORE + gains.ORE,
      },
    };
  });
  if (newGameState.gameId) {
    games.set(newGameState.gameId, newGameState);
  }
  return NextResponse.json({
    gameState: newGameState,
    dice: [d1, d2],
    resourceMap,
  });
}