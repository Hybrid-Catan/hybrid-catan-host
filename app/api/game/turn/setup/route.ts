import { NextResponse } from "next/server";
import { confirmSetupRoad } from "@/backend/gamelogic/turnmanagement/turnmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: Request) {
  try {
    const { gameState } = await req.json();

    const updated = confirmSetupRoad(gameState);

    games.set(updated.gameId, updated);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}