import { NextRequest, NextResponse } from "next/server";
import { bankTrade } from "@/backend/gamelogic/trading/trading";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest) {
  try {
    const { gameState, senderId, give, get } = await req.json();

    const sender = gameState.players.find((p: any) => p.playerId === senderId);
    if (!sender) {
      return NextResponse.json({ success: false, error: "Sender not found" }, { status: 400 });
    }
    if (sender.resourceCards[give] < 4) {
      return NextResponse.json({ success: false, error: `Not enough ${give}` }, { status: 400 });
    }
    if (gameState.bank.resourceCards[get] < 1) {
      return NextResponse.json({ success: false, error: `Bank has no ${get}` }, { status: 400 });
    }

    const before = { ...sender.resourceCards };
    const newGameState = bankTrade(gameState, senderId, give, get);
    const after = newGameState.players.find((p: any) => p.playerId === senderId)!.resourceCards;
    const resourceDelta = {
      WOOD: after.WOOD - before.WOOD,
      BRICK: after.BRICK - before.BRICK,
      WOOL: after.WOOL - before.WOOL,
      WHEAT: after.WHEAT - before.WHEAT,
      ORE: after.ORE - before.ORE,
    };
    games.set(newGameState.gameId, newGameState);

    return NextResponse.json({ success: true, data: newGameState, resourceDelta });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 500 });
  }
}
