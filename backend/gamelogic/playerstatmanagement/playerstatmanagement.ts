import type { GameState, Player } from "../../../utils/type.ts";
import {
  canBuildSettlement,
  canUpgradeToCity,
  canBuildRoad,
  canBuyDevCard,
  calculateVictoryPoints,
  hasPiecesRemaining
} from "../gamerules/gamerules.ts";
import { getTurnPlayerId } from "../turnmanagement/turnmanagement.ts";
import { computeLongestRoad, type RoadEdge } from "./longestRoad.ts";
import { CV_TO_GAME_COLOR } from "../../../utils/boardState.ts";

type Resource = keyof Player["resourceCards"];
type DevCard = keyof Player["developmentCards"];
type Port = Player["portsOwned"][number];

function getCurrentPlayer(gameState: GameState): Player | null {
  const playerId = getTurnPlayerId(gameState);
  return gameState.players.find(p => p.playerId === playerId) ?? null;
}

function spendResources(
  player: Player,
  cost: Partial<Record<Resource, number>>
): boolean {
  for (const [r, amt] of Object.entries(cost)) {
    if (player.resourceCards[r as Resource] < (amt || 0)) {
      return false;
    }
  }
  for (const [r, amt] of Object.entries(cost)) {
    player.resourceCards[r as Resource] -= amt!;
  }
  return true;
}

const SETTLEMENT_COST = {
  WOOD: 1,
  BRICK: 1,
  WOOL: 1,
  WHEAT: 1,
};

const CITY_COST = {
  WHEAT: 2,
  ORE: 3,
};

const ROAD_COST = {
  WOOD: 1,
  BRICK: 1,
};

const DEV_COST = {
  WOOL: 1,
  WHEAT: 1,
  ORE: 1,
};

export function distributeResource(gameState: any, cvBoardState: any) {
  const roll = gameState.dice.sum;
  // Get tiles activated by dice roll
  const activeTiles = cvBoardState.tile_results.filter(
    (tile: any) =>
      tile.number === roll &&
      tile.resource &&
      tile.resource !== "Water" &&
      tile.resource !== "Desert"
  );
  if (!activeTiles.length) {
    return gameState;
  }
  // Map resource types (CV → Game resource)
  const RESOURCE_MAP: Record<string, keyof any> = {
    Field: "WOOD",
    Forest: "WOOD",
    Mountain: "ORE",
    Pasture: "WOOL",
    Hill: "BRICK",
  };
  const bankDeduction = {
    WOOD: 0,
    BRICK: 0,
    WOOL: 0,
    WHEAT: 0,
    ORE: 0,
  };
  // Loop through settlements/cities
  const updatedPlayers = gameState.players.map((player: any) => {
    const updatedResources = { ...player.resources };
    // find all vertices owned by this player
    const ownedVertices = cvBoardState.vertex_colors.filter(
      (v: any) => v.color === player.color
    );
    for (const vertex of ownedVertices) {
      const tile = activeTiles.find(
        (t: any) => t.spiralIndex === vertex.hexIndex
      );
      if (!tile) {
        continue;
      }
      const resourceKey = RESOURCE_MAP[tile.resource];
      if (!resourceKey) {
        continue;
      }
      // settlement = +1 resource (extend later for cities)
      updatedResources[resourceKey] += 1;
    }
    return {
      ...player,
      resources: updatedResources,
    };
  });
  gameState.bank.resourceCards.WOOD -= bankDeduction.WOOD;
  gameState.bank.resourceCards.BRICK -= bankDeduction.BRICK;
  gameState.bank.resourceCards.WOOL -= bankDeduction.WOOL;
  gameState.bank.resourceCards.WHEAT -= bankDeduction.WHEAT;
  gameState.bank.resourceCards.ORE -= bankDeduction.ORE;
  // Return updated game state
  return {
    ...gameState,
    players: updatedPlayers,
  };
}

export function addResource(
  gameState: GameState,
  resource: Resource,
  amount: number
): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  player.resourceCards[resource] += amount;
  return { ...gameState };
}

export function buildSettlement(gameState: GameState): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (gameState.phase === "SETUP_1" || gameState.phase === "SETUP_2") {
    player.pieces.settlementsPlaced += 1;
    player.victoryPoints += 1
    return { ...gameState };
  }
  const pieceCheck = hasPiecesRemaining(player, "SETTLEMENT");
  if (!pieceCheck.valid) {
    throw new Error(pieceCheck.reason);
  }
  const check = canBuildSettlement(player);
  if (!check.valid) {
    return false;
  }
  const cost = { ...SETTLEMENT_COST };
  if (!spendResources(player, cost)) {
    return false;
  }
  gameState.bank.resourceCards.WOOD += cost.WOOD;
  gameState.bank.resourceCards.BRICK += cost.BRICK;
  gameState.bank.resourceCards.WOOL += cost.WOOL;
  gameState.bank.resourceCards.WHEAT += cost.WHEAT;
  player.pieces.settlementsPlaced += 1;
  player.victoryPoints += 1
  return { ...gameState };
}

export function buildCity(gameState: GameState): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  const pieceCheck = hasPiecesRemaining(player, "CITY");
  if (!pieceCheck.valid) {
    throw new Error(pieceCheck.reason);
  }
  const check = canUpgradeToCity(player);
  if (!check.valid) {
    console.log("shit")
    return false;
  }
  const cost = { ...CITY_COST };
  if (!spendResources(player, cost)) {
    return false;
  }
  gameState.bank.resourceCards.WHEAT += cost.WHEAT;
  gameState.bank.resourceCards.ORE += cost.ORE;
  player.pieces.settlementsPlaced -= 1;
  player.pieces.citiesPlaced += 1;
  player.victoryPoints += 1
  return { ...gameState };
}

export function buildRoad(gameState: GameState): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (gameState.phase === "SETUP_1" || gameState.phase === "SETUP_2") {
    player.pieces.roadsPlaced += 1;
    return { ...gameState };
  }
  const pieceCheck = hasPiecesRemaining(player, "ROAD");
  if (!pieceCheck.valid) {
    throw new Error(pieceCheck.reason);
  }
  const check = canBuildRoad(player);
  if (!check.valid) {
    return false;
  }
  if (gameState.pendingFreeRoads > 0) {
    player.pieces.roadsPlaced += 1;
    gameState.pendingFreeRoads -= 1;
    if (gameState.pendingFreeRoads === 0) {
      gameState.phase = "BUFFER";
    }
    return { ...gameState };
  }
  const cost = { ...ROAD_COST };
  if (!spendResources(player, cost)) {
    return false;
  }
  gameState.bank.resourceCards.WOOD += cost.WOOD;
  gameState.bank.resourceCards.BRICK += cost.BRICK;
  player.pieces.roadsPlaced += 1;
  return { ...gameState };
}

export function buyDevCard(gameState: GameState) {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return { success: false, error: "No current player" };
  }
  const check = canBuyDevCard(player, gameState);
  if (!check.valid) {
    return false;
  }
  const cost = { ...DEV_COST };
  if (!spendResources(player, cost)) {
    return false;
  }
  gameState.bank.resourceCards.WOOD += cost.WHEAT;
  gameState.bank.resourceCards.BRICK += cost.ORE;
  gameState.bank.resourceCards.WOOL += cost.WOOL;
  const bank = gameState.bank.developmentCards;
  const cardTypes = Object.keys(bank) as DevCard[];
  const total = cardTypes.reduce((sum, c) => sum + bank[c], 0);
  if (total === 0) {
    return { success: false, error: "No dev cards left" };
  }
  let roll = Math.floor(Math.random() * total);
  let card: DevCard | undefined;
  for (const c of cardTypes) {
    if (roll < bank[c]) {
      card = c;
      break;
    }
    roll -= bank[c];
  }
  if (!card) {
    return { success: false, error: "No dev cards left" };
  }
  bank[card] -= 1;
  player.developmentCards[card] += 1;
  player.newDevelopmentCards[card] =
    (player.newDevelopmentCards[card] ?? 0) + 1;
  return { ...gameState };
}

export function playKnight(gameState: GameState): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (player.playerId !== player.playerId) {
    return false;
  }
  if (player.devCardPlayedThisTurn) {
    return false;
  }
  if (player.developmentCards.KNIGHT <= 0) {
    return false;
  }
  if ((player.newDevelopmentCards.KNIGHT ?? 0) > 0) {
    return false;
  }
  player.developmentCards.KNIGHT -= 1;
  player.achievements.armySize += 1;
  updateLargestArmy(gameState);
  player.devCardPlayedThisTurn = true;
  // Knight play means the player must now move the robber. The state machine
  // sits in ROBBER until /api/game/robber/place resolves it.
  gameState.phase = "ROBBER";
  return { ...gameState };
}

export function playRoadBuilding(gameState: GameState): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (player.playerId !== player.playerId) {
    return false;
  }
  if (player.devCardPlayedThisTurn) {
    return false;
  }
  if (player.developmentCards.ROAD_BUILDING <= 0) {
    return false;
  }
  const roadsRemaining = 15 - player.pieces.roadsPlaced;
  if (roadsRemaining <= 0) {
    return false;
  }
  player.developmentCards.ROAD_BUILDING -= 1;
  gameState.pendingFreeRoads = Math.min(2, roadsRemaining);
  gameState.phase = "ROAD_BUILDING";
  player.devCardPlayedThisTurn = true;
  return { ...gameState };
}

export function playMonopoly(
  gameState: GameState,
  resource: Resource
): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (player.playerId !== player.playerId) {
    return false;
  }
  if (player.devCardPlayedThisTurn) {
    return false;
  }
  if (player.developmentCards.MONOPOLY <= 0) {
    return false;
  }
  player.developmentCards.MONOPOLY -= 1;
  let total = 0;
  for (const p of gameState.players) {
    if (p.playerId === player.playerId) {
      continue;
    }
    total += p.resourceCards[resource];
    p.resourceCards[resource] = 0;
  }
  player.resourceCards[resource] += total;
  player.devCardPlayedThisTurn = true;
  return { ...gameState };
}

export function playInvention(
  gameState: GameState,
  resource1: Resource,
  resource2: Resource
): GameState | false {
  const player = getCurrentPlayer(gameState);
  if (!player) {
    return false;
  }
  if (player.devCardPlayedThisTurn) {
    return false;
  }
  if (player.developmentCards.INVENTION <= 0) {
    return false;
  }
  player.developmentCards.INVENTION -= 1;
  player.resourceCards[resource1] += 1;
  player.resourceCards[resource2] += 1;
  player.devCardPlayedThisTurn = true;
  return { ...gameState };
}

export function resolveTrade(gameState: GameState): GameState | false {
  const trade = gameState.tradeState.trades.find(t => t.isActive);
  if (!trade) {
    return false;
  }
  const sender = gameState.players.find(p => p.playerId === trade.sender);
  const receiver = gameState.players.find(p => p.playerId === trade.receiver);
  if (!sender || !receiver) {
    return false;
  }
  for (const [r, amt] of Object.entries(trade.sendingCards)) {
    sender.resourceCards[r as Resource] -= amt!;
    receiver.resourceCards[r as Resource] += amt!;
  }
  for (const [r, amt] of Object.entries(trade.receivingCards)) {
    receiver.resourceCards[r as Resource] -= amt!;
    sender.resourceCards[r as Resource] += amt!;
  }
  trade.accepted = true;
  trade.isActive = false;
  return { ...gameState };
}

export function getTradeRatio(player: Player, resource: Resource): number {
  const specific = player.portsOwned.find((p: Port) => p.type === resource);
  if (specific) {
    return 2;
  }
  const generic = player.portsOwned.find(
    (p: Port) => p.type === "THREE_TO_ONE"
  );
  if (generic) {
    return 3;
  }
  return 4;
}

export function updateLargestArmy(gameState: GameState): GameState {
  let max = 0;
  let owner: Player | null = null;
  for (const p of gameState.players) {
    if (
      p.achievements.armySize >= 3 &&
      p.achievements.armySize > max
    ) {
      max = p.achievements.armySize;
      owner = p;
    }
  }
  for (const p of gameState.players) {
    const alreadyHas = p.achievements.hasLargestArmy;
    p.achievements.hasLargestArmy = p === owner;
    if (p === owner && !alreadyHas) {
      p.victoryPoints += 2;
    }
    if (p !== owner && alreadyHas) {
      p.victoryPoints -= 2;
    }
  }
  return { ...gameState };
}

export function updateLongestRoad(gameState: GameState): GameState {
  let max = 0;
  let owner: Player | null = null;
  for (const p of gameState.players) {
    if (
      p.achievements.longestRoadLength >= 5 &&
      p.achievements.longestRoadLength > max
    ) {
      max = p.achievements.longestRoadLength;
      owner = p;
    }
  }
  for (const p of gameState.players) {
    const alreadyHas = p.achievements.hasLongestRoad;
    p.achievements.hasLongestRoad = p === owner;
    if (p === owner && !alreadyHas) {
      p.victoryPoints += 2;
    }
    if (p !== owner && alreadyHas) {
      p.victoryPoints -= 2;
    }
  }
  return { ...gameState };
}

/**
 * Recomputes `longestRoadLength` for every player using the current CV board
 * state, then runs `updateLongestRoad` to grant/revoke the achievement + VP.
 *
 * Call this whenever the CV board state changes (new road detected) or after
 * a road-building action mutates the game state.
 */
export function updatePlayerLongestRoadLengths(gameState: GameState): GameState {
  const cv = gameState.cvBoardState;
  if (!cv) return updateLongestRoad(gameState);

  // Group player-coloured edges by game color.
  const roadsByColor = new Map<string, RoadEdge[]>();
  for (const edge of cv.edge_colors ?? []) {
    if (!edge.color) continue;
    const gameColor = CV_TO_GAME_COLOR[edge.color];
    if (!gameColor) continue;
    if (edge.vertexA < 0 || edge.vertexB < 0) continue;
    if (!roadsByColor.has(gameColor)) roadsByColor.set(gameColor, []);
    roadsByColor.get(gameColor)!.push({ vertexA: edge.vertexA, vertexB: edge.vertexB });
  }

  // Vertex ID → owner game color (first seen wins).
  const vertexOwner = new Map<number, string>();
  for (const v of cv.vertex_colors ?? []) {
    if (!v.color) continue;
    const gameColor = CV_TO_GAME_COLOR[v.color];
    if (!gameColor) continue;
    if (!vertexOwner.has(v.id)) vertexOwner.set(v.id, gameColor);
  }

  for (const player of gameState.players) {
    const roads = roadsByColor.get(player.color) ?? [];
    const blocked = new Set<number>();
    for (const [vid, ownerColor] of vertexOwner) {
      if (ownerColor !== player.color) blocked.add(vid);
    }
    player.achievements.longestRoadLength = computeLongestRoad(roads, blocked);
  }

  return updateLongestRoad(gameState);
}

export function getVictoryPoints(player: Player): number {
  return calculateVictoryPoints(player);
}
