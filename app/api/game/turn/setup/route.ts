import { NextResponse } from "next/server";
import { confirmSetupRoad } from "@/backend/gamelogic/turnmanagement/turnmanagement";
import { canConfirmSetup } from "@/backend/gamelogic/gamerules/gamerules";
import { games } from "@/app/lib/games";

export async function POST(req: Request) {
  try {
    const { gameState } = await req.json();

    // Use the host's authoritative copy so the CV state is up to date — the
    // posted gameState comes from a phone poll and might be a few seconds old.
    const game = games.get(gameState.gameId) ?? gameState;

    const check = canConfirmSetup(game);
    if (!check.valid) {
      return NextResponse.json(
        { success: false, error: check.reason ?? "Setup turn not complete." },
        { status: 400 },
      );
    }

    const updated = confirmSetupRoad(game);

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