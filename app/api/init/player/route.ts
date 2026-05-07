import { NextRequest, NextResponse } from "next/server";
import { initPlayer } from "@/backend/gamelogic/initilaisaiton/init";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  const { gameState, name, color, sequence } = await req.json();

  if (!gameState || !name || !color || sequence === undefined) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  const updated = initPlayer(name, color, sequence, gameState);

  games.set(updated.gameId, updated);

  return NextResponse.json({ success: true, data: updated });
}