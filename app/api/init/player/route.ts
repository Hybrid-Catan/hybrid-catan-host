import { NextRequest, NextResponse } from "next/server";
import { initPlayer } from "@/backend/gamelogic/initilaisaiton/init";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const { gameId, name, color, sequence } = await req.json();

  if (!gameId || !name || !color || sequence === undefined) {
    return NextResponse.json(
      { success: false, error: "Missing fields" },
      { status: 400 }
    );
  }

  // Fetch authoritative game state from server memory
  const gameState = games.get(gameId);

  if (!gameState) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 }
    );
  }

  if (gameState.players.length >= 4) {
    return NextResponse.json(
      {
        success: false,
        error: "Lobby is full, please join a different room",
      },
      { status: 400 }
    );
  }

  // Prevent duplicate colors
  const colorTaken = gameState.players.some(
    (p: any) => p.color === color
  );

  if (colorTaken) {
    return NextResponse.json(
      {
        success: false,
        error: "COLOR_TAKEN",
      },
      { status: 400 }
    );
  }

  const updated = initPlayer(
    name,
    color,
    sequence,
    gameState
  );

  games.set(updated.gameId, updated);

  console.dir(games, { depth: null });

  return NextResponse.json({
    success: true,
    data: updated,
  });
}