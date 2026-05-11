import { NextRequest, NextResponse } from "next/server";
import { fulfillTrade } from "@/backend/gamelogic/trading/trading";

export async function POST(req: NextRequest) {
  try {
    const { gameState, tradeIndex } = await req.json();

    if (typeof tradeIndex !== "number") {
      return NextResponse.json(
        { success: false, error: "tradeIndex (number) is required" },
        { status: 400 }
      );
    }

    const newGameState = fulfillTrade(gameState, tradeIndex);

    return NextResponse.json(
      { success: true, data: newGameState },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid request or server error" },
      { status: 500 }
    );
  }
}
