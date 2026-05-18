import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const gameId = body.gameId ?? body.gameState?.gameId;

  if (!gameId) {
    return NextResponse.json({ success: false, error: "Missing gameId" }, { status: 400 });
  }

  const gameState = games.get(gameId);
  if (!gameState) {
    return NextResponse.json({ success: false, error: "Game not found" }, { status: 404 });
  }

  const newState = {
    ...gameState,
    phase: "SETUP_1",
    status: "IN_PROGRESS"
  };

  games.set(gameId, newState);

  return NextResponse.json({ success: true, data: newState });
}