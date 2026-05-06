import { UUID } from "crypto";
import type { GameState, Player } from "../../../utils/type.ts";

export function initGameState(): GameState {
  return {
    gameId: "test-game",
    status: "SETUP",
    players: [],
    phase: "SETUP_1",
    dice: {
      sum: 0
    },
    bank: {
      resourceCards: {
        WOOD: 19,
        BRICK: 19,
        WOOL: 19,
        WHEAT: 19,
        ORE: 19
      },
      developmentCards: {
        KNIGHT: 14,
        MONOPOLY: 2,
        ROAD_BUILDING: 2,
        INVENTION: 2,
        VICTORY_POINT: 5
      }
    },
    robber: {
      tileIndex: -1
    },
    tradeState: {
      trades: []
    },
    winner: {
      playerId: "" as UUID
    }
  };
}

export function initPlayer(
  name: string,
  color: Player["color"],
  sequence: number,
  gameState: GameState
): GameState {
  console.log("New GameState after adding player:");

  console.log("New GameState after adding player:");


  const id = crypto.randomUUID() as UUID;
  console.log("New GameState after adding player:");
  const newPlayer: Player = {
    playerId: id,
    name,
    color,
    sequence,
    victoryPoints: 0,

    resourceCards: {
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

    portsOwned: []
  };

  const players = [...gameState.players];

  const insertIndex = players.findIndex(p => p.sequence > sequence);


  if (insertIndex === -1) {
    players.push(newPlayer);
  } else {
    players.splice(insertIndex, 0, newPlayer);
  }

  return {
    ...gameState,
    players
  };
}
