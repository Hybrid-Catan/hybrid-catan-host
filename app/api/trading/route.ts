import { GameState, TradeRequest } from "../../../utils/type";
import { addTradeToGameState, cancelTrade, clearTrades, deleteTrade, fulfillTrade } from "../../../backend/gamelogic/trading/trading";
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

function rejectTradeRequest(gameState: GameState, tradeIndex: number): GameState | Error {
    // if the reciever rejects the trade, we simply mark the trade as inactive and accepted: false
    return cancelTrade(gameState, tradeIndex);
}

function cancelTradeRequest(gameState: GameState, tradeIndex: number): GameState | Error {
    // if the sender cancels the trade, we simply mark the trade as inactive and accepted: false
    return cancelTrade(gameState, tradeIndex);
}

function counterTradeRequest(gameState: GameState, tradeIndex: number, newTradeRequest: TradeRequest): GameState | Error {
    // if the reciever counter the trade, we update the trade with new sending and receiving cards, and mark it as active and accepted: false
    // we also need to check if the sender has enough resources to offer the counter trade
    if (!checkSenderTradeRequest(newTradeRequest, gameState)) {
        return new Error("Sender does not have enough resources.");
    }
    let updatedGameState = addTradeToGameState(gameState, newTradeRequest);

    if (!checkReceiverTradeRequest(newTradeRequest, gameState)) {
        updatedGameState.tradeState.trades[0].canAccept = false;
    }

    updatedGameState = deleteTrade(updatedGameState, tradeIndex);

    return updatedGameState;
}

function clearTradeRequest(gameState: GameState, tradeIndex: number): GameState {
    // clear all trades which are accepted:false after the turn ends
    return clearTrades(gameState);
}