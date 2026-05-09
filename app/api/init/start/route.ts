import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const { gameState } = await req.json();

  if (!gameState) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  if (gameState.players.length < 3) {
    return NextResponse.json(
      {
        success: false,
        error: "A minimum of 3 players is required to play Catan!",
      },
      { status: 400 }
    );
  }

  const newState = {
    ...gameState,
    phase: "SETUP_1",
    status: "IN_PROGRESS"
  };

  games.set(newState.gameId, newState);

  console.dir(games, { depth: null })

  return NextResponse.json({ success: true, data: newState });
}