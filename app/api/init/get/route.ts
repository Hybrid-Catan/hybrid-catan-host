import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const { gameId } = await req.json();

  const gameState = games.get(gameId);

  if (!gameState) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 }
    );
  }

  console.dir(games, { depth: null })

  return NextResponse.json({
    success: true,
    data: gameState,
  });
}