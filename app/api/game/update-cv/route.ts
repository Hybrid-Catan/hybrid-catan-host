import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { updatePlayerLongestRoadLengths } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { validateBoardPlacements } from "@/backend/gamelogic/gamerules/gamerules";
import { findDesertTileIndex } from "@/backend/gamelogic/robber/robber";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, cvBoardState } = body;
    const game = games.get(gameId);
    if (!game) {
      return NextResponse.json({
        success: false,
        error: "Game not found",
      });
    }
    game.cvBoardState = cvBoardState;
    // Seed the robber on the desert once CV finds it. Only fires while the
    // robber hasn't been placed yet (sentinel -1); once the game has moved
    // the robber for real we never overwrite from CV.
    if ((game.robber?.tileIndex ?? -1) < 0) {
        const desert = findDesertTileIndex(cvBoardState);
        if (desert !== null) {
            game.robber = { tileIndex: desert };
        }
    }
    updatePlayerLongestRoadLengths(game);
    game.validationWarnings = validateBoardPlacements(game);
    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
    });
  }
}