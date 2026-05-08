import { NextRequest, NextResponse } from "next/server";
import { initGameState } from "@/backend/gamelogic/initilaisaiton/init";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const { gameId } = await req.json();

  if (!gameId) {
    return NextResponse.json(
      { success: false, error: "Missing gameId" },
      { status: 400 }
    );
  }

  // if room already exists, return existing
  if (games.has(gameId)) {
    return NextResponse.json({
      success: true,
      data: games.get(gameId),
    });
  }

  const gameState = initGameState();
  gameState.gameId = gameId;

  games.set(gameId, gameState);

  console.dir(games, { depth: null })

  return NextResponse.json({
    success: true,
    data: gameState,
  });
}