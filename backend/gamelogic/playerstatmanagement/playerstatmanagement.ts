import type { Player } from "../../../utils/type.ts";
import {
  canBuildSettlement,
  canUpgradeToCity,
  canBuildRoad,
  canBuyDevCard,
  calculateVictoryPoints
} from "../gamerules/gamerules.ts";

type Resource = keyof Player["resources"];
type DevCard = keyof Player["developmentCards"];
type Phase = Player["turnState"]["currentPhase"];
type Port = Player["portsOwned"][number];

export function setPhase(player: Player, phase: Phase) {
  player.turnState.currentPhase = phase;
}

export function addResource(
  player: Player,
  resource: Resource,
  amount: number
) {
  player.resources[resource] += amount;
}

export function spendResources(
  player: Player,
  cost: Partial<Record<Resource, number>>
): boolean {
  for (const [r, amt] of Object.entries(cost)) {
    if (player.resources[r as Resource] < (amt || 0)) return false;
  }
  Object.entries(cost).forEach(([r, amt]) => {
    player.resources[r as Resource] -= amt!;
  });
  return true;
}

const SETTLEMENT_COST = {
  WOOD: 1,
  BRICK: 1,
  WOOL: 1,
  WHEAT: 1,
};

export function buildSettlement(player: Player): boolean {
  const check = canBuildSettlement(player);
  if (!check.valid) {
    return false;
  }
  spendResources(player, SETTLEMENT_COST);
  player.pieces.settlementsPlaced += 1;
  return true;
}

const CITY_COST = {
  WHEAT: 2,
  ORE: 3,
};

export function buildCity(player: Player): boolean {
  const check = canUpgradeToCity(player);
  if (!check.valid) {
    return false;
  }
  spendResources(player, CITY_COST);
  player.pieces.settlementsPlaced -= 1;
  player.pieces.citiesPlaced += 1;
  return true;
}

const ROAD_COST = {
  WOOD: 1,
  BRICK: 1,
};

export function buildRoad(player: Player): boolean {
  const check = canBuildRoad(player);
  if (!check.valid) {
    return false;
  }
  spendResources(player, ROAD_COST);
  player.pieces.roadsPlaced += 1;
  return true;
}

const DEV_COST = {
  WOOL: 1,
  WHEAT: 1,
  ORE: 1,
};

export function buyDevCard(
  player: Player,
  deck: DevCard[],
  gameState: any
): DevCard | null {
  const check = canBuyDevCard(player, gameState);
  if (!check.valid) {
    return null;
  }
  spendResources(player, DEV_COST);
  const card = deck.pop();
  if (!card) {
    return null;
  }
  player.developmentCards[card] += 1;
  return card;
}

export function playKnight(player: Player): boolean {
  if (player.developmentCards.KNIGHT <= 0) {
    return false;
  }
  player.developmentCards.KNIGHT -= 1;
  player.achievements.armySize += 1;
  return true;
}

type Trade = {
  offer: Partial<Record<Resource, number>>;
  request: Partial<Record<Resource, number>>;
};

export function tradePlayers(
  p1: Player,
  p2: Player,
  trade: Trade
): boolean {
  if (!spendResources(p1, trade.offer)) {
    return false;
  }
  if (!spendResources(p2, trade.request)) {
    Object.entries(trade.offer).forEach(([r, amt]) => {
      p1.resources[r as Resource] += amt!;
    });
    return false;
  }
  Object.entries(trade.offer).forEach(([r, amt]) => {
    p2.resources[r as Resource] += amt!;
  });
  Object.entries(trade.request).forEach(([r, amt]) => {
    p1.resources[r as Resource] += amt!;
  });
  return true;
}

export function getTradeRatio(
  player: Player,
  resource: Resource
): number {
  const specific = player.portsOwned.find(
    (p: Port) => p.type === resource
  );
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

export function updateLargestArmy(players: Player[]) {
  let max = 0;
  let owner: Player | null = null;
  players.forEach(p => {
    if (p.achievements.armySize > max && p.achievements.armySize >= 3) {
      max = p.achievements.armySize;
      owner = p;
    }
  });
  players.forEach(p => {
    p.achievements.hasLargestArmy = p === owner;
  });
}

export function updateLongestRoad(players: Player[]) {
  let max = 0;
  let owner: Player | null = null;
  players.forEach(p => {
    if (
      p.achievements.longestRoadLength > max &&
      p.achievements.longestRoadLength >= 5
    ) {
      max = p.achievements.longestRoadLength;
      owner = p;
    }
  });
  players.forEach(p => {
    p.achievements.hasLongestRoad = p === owner;
  });
}

export function getVictoryPoints(player: Player): number {
  return calculateVictoryPoints(player);
}

export function startTurn(player: Player) {
  setPhase(player, "ROLL");
}

export function moveToTrade(player: Player) {
  setPhase(player, "TRADE");
}

export function moveToBuild(player: Player) {
  setPhase(player, "BUILD");
}

export function endTurn(player: Player) {
  setPhase(player, "END");
}
