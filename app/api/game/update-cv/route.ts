import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { updatePlayerLongestRoadLengths } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { validateBoardPlacements } from "@/backend/gamelogic/gamerules/gamerules";

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
    // console.dir(games, { depth: null })
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