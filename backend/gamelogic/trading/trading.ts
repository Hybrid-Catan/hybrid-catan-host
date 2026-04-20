// trading occurs when a player wants to exchange resources with another player or with the bank. This module will handle the logic for trading, including validating trades, calculating trade ratios, and updating player inventories.
import { GameState, resourcesCards, Player, TradeState, TradeRequest, Trade, Result } from "@/utils/type";
import { checkSenderTradeRequest, checkReceiverTradeRequest } from "../gamerules/tradevalidation";
import { UUID } from "crypto";

export function addTradeToGameState(
  gameState: GameState,
  tradeProposal: TradeRequest
): GameState {
  const newTrade: Trade = {
    sender: tradeProposal.sender,
    receiver: tradeProposal.receiver,
    receivingCards: tradeProposal.receivingCards,
    sendingCards: tradeProposal.sendingCards,
    isActive: true,
    canAccept: true,
    accepted: false,
  };

  return {
    ...gameState, // ensures the newest trade is always at index 0
    tradeState: {
      trades: gameState.tradeState
        ? [newTrade, ...gameState.tradeState.trades]
        : [newTrade],
    },
  };
}

// 1. Trading with player

// A player can propose a trade to another player, specifying the resources they want to give and the resources they want to receive. The receiving player can then accept or reject the trade. If accepted, the resources are exchanged between the two players' inventories. The module will also handle edge cases such as insufficient resources, invalid trade proposals, and ensuring that trades adhere to the game's rules (e.g., trading ratios).
// a. The Sender: check if the the proposing player has enough resources to offer.

// b. Send Trade
// frontend logi (API)

// c. The Receiver: check if the the receiving player has enough resources to complete the offer(mainly the resources asked for should fulfil).
export function fulfillTrade(
  gameState: GameState,
  tradeIndex: number
): GameState {

  const trade = gameState.tradeState.trades[tradeIndex];

  const senderIndex = gameState.players.findIndex(p => p.playerId === trade.sender);
  const receiverIndex = gameState.players.findIndex(p => p.playerId === trade.receiver);

  const sender = gameState.players[senderIndex];
  const receiver = gameState.players[receiverIndex];

  const update = (res: resourcesCards, delta: resourcesCards, give: boolean): resourcesCards => ({
    WOOD: res.WOOD + (give ? -delta.WOOD : delta.WOOD),
    BRICK: res.BRICK + (give ? -delta.BRICK : delta.BRICK),
    WOOL: res.WOOL + (give ? -delta.WOOL : delta.WOOL),
    WHEAT: res.WHEAT + (give ? -delta.WHEAT : delta.WHEAT),
    ORE: res.ORE + (give ? -delta.ORE : delta.ORE),
  });

  const players = gameState.players.map(p => {
    if (p.playerId === sender.playerId) {
      return {
        ...p,
        resourcesCards: update(p.resourcesCards, trade.sendingCards, true),
      };
    }

    if (p.playerId === receiver.playerId) {
      return {
        ...p,
        resourcesCards: update(p.resourcesCards, trade.receivingCards, true),
      };
    }

    return p;
  });

  return {
    ...gameState,
    players,
    tradeState: {
      trades: gameState.tradeState.trades.map((t, i) =>
        i === tradeIndex
          ? { ...t, isActive: false, accepted: true }
          : t
      ),
    },
  };
}

export function deleteTrade(
  gameState: GameState,
  tradeIndex: number
): GameState {

  const trades = [...gameState.tradeState.trades];

  trades.splice(tradeIndex, 1);

  return {
    ...gameState,
    tradeState: {
      trades,
    },
  };
}

export function cancelTrade(
  gameState: GameState,
  tradeIndex: number
): GameState {

  const trades = [...gameState.tradeState.trades];

  trades[tradeIndex] = {
    ...trades[tradeIndex],
    isActive: false,
    accepted: false,
  };

  return {
    ...gameState,
    tradeState: {
      trades,
    },
  };
}
export function clearTrades(gameState: GameState): GameState {
  return {
    ...gameState,
    tradeState: {
      trades: gameState.tradeState.trades.filter(trade => trade.accepted)
    }
  };
}