import { NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { getPlayerToResourceCardMap } from "@/utils/boardState";

export async function POST(req: Request) {
  const gameState = await req.json();

  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  const sum = d1 + d2;

  const boardState = gameState.cvBoardState;
  console.log("cvBoardState preview:", boardState);

  let newGameState = {
    ...gameState,
    phase: "BUFFER",
    dice: { sum },
  };

  const resourceMap = getPlayerToResourceCardMap(
    sum,
    boardState,
    newGameState
  );

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