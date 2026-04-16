import type { Player, GameState } from "../../../utils/type.ts";
import { gameStep, startGame } from "../initilaisaiton/init.ts";

import {
  startTurn,
  moveToBuild,
  moveToTrade,
  endTurn,
  addResource,
  buildSettlement,
  buildCity,
  buildRoad,
  buyDevCard,
  playKnight,
  tradePlayers,
  getVictoryPoints,
  updateLargestArmy,
  updateLongestRoad,
  getTradeRatio
} from "./playerstatmanagement.ts";

function log(title: string, data: any) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(data, null, 2));
}

const gameState: GameState = {
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
    developmentCardsRemaining: 10
  },
  developmentDeck: {
    KNIGHT: 5,
    MONOPOLY: 2,
    ROAD_BUILDING: 2,
    INVENTION: 2,
    VICTORY_POINT: 5
  },
  tradeState: {
    Trades: []
  },
  winner: {
    playerId: "0" as any
  }
};

// Fake players
const player1: Player = {
  playerId: "1" as any,
  name: "Alice",
  color: "BLUE",
  victoryPoints: 0,

  resources: {
    WOOD: 3,
    BRICK: 3,
    WOOL: 3,
    WHEAT: 3,
    ORE: 3
  },

  developmentCards: {
    KNIGHT: 1,
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
    longestRoadLength: 5,
    hasLargestArmy: false,
    armySize: 2
  },

  portsOwned: [
    { type: "WOOD", ratio: "2:1" }
  ],

  turnState: {
    currentPhase: "SETUP"
  }
};

const player2: Player = {
  ...player1,
  playerId: "2" as any,
  name: "Bob",
  color: "RED",
  resources: {
    WOOD: 1,
    BRICK: 1,
    WOOL: 1,
    WHEAT: 1,
    ORE: 1
  },
  achievements: {
    hasLongestRoad: false,
    longestRoadLength: 3,
    hasLargestArmy: false,
    armySize: 3
  },
  portsOwned: []
};

gameState.players = [player1, player2];

let devDeck: ("KNIGHT" | "VICTORY_POINT" | "MONOPOLY")[] = [
  "KNIGHT",
  "VICTORY_POINT",
  "MONOPOLY"
];

// Turn flow
startTurn(player1);
moveToTrade(player1);
moveToBuild(player1);

log("Phase after setup", player1.turnState);

// Build settlements/cities
console.log("\nBuild Settlement");
buildSettlement(player1);
log("After settlement", player1);

console.log("\nBuild Road");
buildRoad(player1);
log("After road", player1);

console.log("\nBuild City");
buildCity(player1);
log("After city", player1);

// Resources Test
console.log("\nAdd Resources");
addResource(player1, "WOOD", 2);
log("After adding WOOD", player1.resources);

// Development Cards
console.log("\nBuy Dev Card");
const card = buyDevCard(player1, devDeck, gameState);
console.log("Got card:", card);
log("Dev cards", player1.developmentCards);

console.log("\nPlay Knight");
playKnight(player1);
log("After playing knight", player1.developmentCards);

// Trade
console.log("\nTrade Between Players");
tradePlayers(player1, player2, {
  offer: { WOOD: 2 },
  request: { BRICK: 1 }
});
log("Player1 after trade", player1.resources);
log("Player2 after trade", player2.resources);

// Ports
console.log("\nTrade Ratio");
const ratio = getTradeRatio(player1, "WOOD");
console.log("Trade ratio for WOOD:", ratio);

// Achievements
console.log("\nUpdate Achievements");
updateLargestArmy([player1, player2]);
updateLongestRoad([player1, player2]);

log("Player1 achievements", player1.achievements);
log("Player2 achievements", player2.achievements);

// Victory points
console.log("\nVictory Points");
const vp1 = getVictoryPoints(player1);
const vp2 = getVictoryPoints(player2);

console.log("Player1 VP:", vp1);
console.log("Player2 VP:", vp2);

endTurn(player1);
log("End turn phase", player1.turnState);

console.log("----------");

startGame(gameState);

for (let i = 0; i < 5; i++) {
  console.log(`\n--- TURN ${i + 1} ---`);
  gameStep(gameState);
}
