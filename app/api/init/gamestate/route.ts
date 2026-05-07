import { NextRequest, NextResponse } from "next/server";
import { initGameState } from "@/backend/gamelogic/initilaisaiton/init";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  try {
    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing gameId",
        },
        {
          status: 400,
        }
      );
    }

    const gameState = initGameState();

    gameState.gameId = gameId;

    games.set(gameId, gameState);

    return NextResponse.json({
      success: true,
      data: gameState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}