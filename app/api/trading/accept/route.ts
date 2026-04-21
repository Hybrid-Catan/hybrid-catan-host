// app/api/trade/route.ts

import { addTradeToGameState, cancelTrade, clearTrades, deleteTrade, fulfillTrade } from "@/backend/gamelogic/trading/trading";
import { checkReceiverTradeRequest, isTradeActive, checkSenderTradeRequest } from "@/backend/gamelogic/gamerules/tradevalidation";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { gameState, tradeRequest } = await req.json();

        if (!checkSenderTradeRequest(tradeRequest, gameState)) {
            return new Error("Sender does not have enough resources.");
        }
        const updatedGameState = addTradeToGameState(gameState, tradeRequest);

        if (!checkReceiverTradeRequest(tradeRequest, gameState)) {
            updatedGameState.tradeState.trades[0].canAccept = false;
        }

        return NextResponse.json(updatedGameState, { status: 200 });

    } catch (error) {
        return NextResponse.json(
            { error: "Invalid request or server error" },
            { status: 500 }
        );
    }
}