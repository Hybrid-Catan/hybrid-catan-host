import { NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { CV_TO_GAME_COLOR } from "@/utils/boardState";

export async function POST(req: Request) {
  const gameState = await req.json();
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  const sum = d1 + d2;
  const boardState = gameState.cvBoardState;
  let newGameState = {
    ...gameState,
    phase: "BUFFER",
    dice: { sum },
  };
  const tileMap = new Map<number, any>(
    boardState.tile_results.map((t: any) => [t.spiralIndex, t])
  );
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
    WOOD: number;
    BRICK: number;
    WOOL: number;
    WHEAT: number;
    ORE: number;
  };
  const RESOURCE_MAP: Record<string, keyof Gains | null> = {
    Field: "WOOD",
    Forest: "WOOD",
    Mountain: "ORE",
    Pasture: "WOOL",
    Hill: "BRICK",
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
      const tile = tileMap.get(vertex.hexIndex);
      if (!tile) continue;
      if (tile.number !== sum) continue;
      const resource = RESOURCE_MAP[tile.resource] as keyof Gains | null;
      if (!resource) continue;
      gains[resource] += 1;
      totalGains[resource] += 1;
    }
    resourceMap[player.playerId] = gains;
  }
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