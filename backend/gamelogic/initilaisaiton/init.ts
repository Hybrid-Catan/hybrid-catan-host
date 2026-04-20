import { UUID } from "crypto";
import type { GameState, Player } from "../../../utils/type.ts";

export function createInitialGameState(): GameState {
  return {
    gameId: "test-game",
    status: "SETUP",
    players: [],
    phase: "SETUP_1",
    dice: {
      sum: 0
    },
    bank: {
      resources: {
        WOOD: 19,
        BRICK: 19,
        WOOL: 19,
        WHEAT: 19,
        ORE: 19
      },
      developmentCardsRemaining: 25
    },
    developmentDeck: {
      KNIGHT: 14,
      MONOPOLY: 2,
      ROAD_BUILDING: 2,
      INVENTION: 2,
      VICTORY_POINT: 5
    },
    tradeState: {
      Trades: []
    },
    winner: {
      playerId: "" as any
    }
  };
}

export function initPlayer(
  id: string,
  name: string,
  color: Player["color"],
  sequence: number
): Player {
  return {
    playerId: id as UUID,
    name,
    color,
    sequence,
    victoryPoints: 0,
    resources: {
      WOOD: 0,
      BRICK: 0,
      WOOL: 0,
      WHEAT: 0,
      ORE: 0
    },
    developmentCards: {
      KNIGHT: 0,
      MONOPOLY: 0,
      ROAD_BUILDING: 0,
      INVENTION: 0,
      VICTORY_POINT: 0
    },
    pieces: {
      settlementsPlaced: 0,
      citiesPlaced: 0,
      roadsPlaced: 0
    },
    achievements: {
      hasLongestRoad: false,
      longestRoadLength: 0,
      hasLargestArmy: false,
      armySize: 0
    },
    portsOwned: [],
    turnState: {
      currentPhase: "SETUP_1"
    }
  };
}

export function initialisePlayers(game: GameState) {
  game.players = [
    initPlayer("1", "Alice", "BLUE", 1),
    initPlayer("2", "Bob", "RED", 2)
  ];
}
