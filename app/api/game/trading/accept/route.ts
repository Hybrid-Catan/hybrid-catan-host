import { NextRequest, NextResponse } from "next/server";
import { fulfillTrade } from "@/backend/gamelogic/trading/trading";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  try {
    const { gameState, tradeIndex } = await req.json();

    if (typeof tradeIndex !== "number") {
      return NextResponse.json(
        { success: false, error: "tradeIndex (number) is required" },
        { status: 400 }
      );
    }

    const trade = gameState.tradeState.trades[tradeIndex];
    const senderBefore = { ...gameState.players.find((p: any) => p.playerId === trade.sender)!.resourceCards };
    const receiverBefore = { ...gameState.players.find((p: any) => p.playerId === trade.receiver)!.resourceCards };

    const newGameState = fulfillTrade(gameState, tradeIndex);

    const senderAfter = newGameState.players.find((p: any) => p.playerId === trade.sender)!.resourceCards;
    const receiverAfter = newGameState.players.find((p: any) => p.playerId === trade.receiver)!.resourceCards;
    const deltas: Record<string, any> = {
      [trade.sender]: {
        WOOD: senderAfter.WOOD - senderBefore.WOOD,
        BRICK: senderAfter.BRICK - senderBefore.BRICK,
        WOOL: senderAfter.WOOL - senderBefore.WOOL,
        WHEAT: senderAfter.WHEAT - senderBefore.WHEAT,
        ORE: senderAfter.ORE - senderBefore.ORE,
      },
      [trade.receiver]: {
        WOOD: receiverAfter.WOOD - receiverBefore.WOOD,
        BRICK: receiverAfter.BRICK - receiverBefore.BRICK,
        WOOL: receiverAfter.WOOL - receiverBefore.WOOL,
        WHEAT: receiverAfter.WHEAT - receiverBefore.WHEAT,
        ORE: receiverAfter.ORE - receiverBefore.ORE,
      },
    };

    games.set(newGameState.gameId, newGameState);

    return NextResponse.json(
      { success: true, data: newGameState, deltas },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid request or server error" },
      { status: 500 }
    );
  }
}
