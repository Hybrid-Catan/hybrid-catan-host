import { GameState, TradeRequest } from "../../../utils/type";
import { addTradeToGameState, fulfillTrade } from "../../../backend/gamelogic/trading/trading";
import { checkReceiverTradeRequest, isTradeActive, checkSenderTradeRequest } from "@/backend/gamelogic/gamerules/tradevalidation";

function addTradeRequest(gameState: GameState, tradeRequest: TradeRequest): GameState | Error {
    if (!checkSenderTradeRequest(tradeRequest, gameState)) {
        return new Error("Sender does not have enough resources.");
    }
    const updatedGameState = addTradeToGameState(gameState, tradeRequest);

    if (!checkReceiverTradeRequest(tradeRequest, gameState)) {
        updatedGameState.tradeState.trades[0].canAccept = false;
    }
    return updatedGameState;
}

function acceptTradeRequest(gameState: GameState, tradeIndex: number): GameState | Error {
    if (isTradeActive(gameState, tradeIndex)) {
        return new Error("Trade is not active.");
    }
    return fulfillTrade(gameState, tradeIndex);
}

function clearTradeRequest(gameState: GameState, tradeIndex: number): GameState {
    // clear all trades which are accepted: false after turn
}