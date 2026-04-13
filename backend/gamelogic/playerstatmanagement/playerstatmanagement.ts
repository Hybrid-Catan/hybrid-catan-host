import type { Player } from "../../../utils/type.ts";

type Resource = keyof Player["resources"];
type DevCard = keyof Player["developmentCards"];
type Phase = Player["turnState"]["currentPhase"];

// Sets the phase for each player
export function setPhase(player: Player, phase: Phase) {
  player.turnState.currentPhase = phase;
}

// Gives the player resources
export function addResource(
  player: Player,
  resource: Resource,
  amount: number
) {
  player.resources[resource] += amount;
}

// Checks if the player can afford to build
export function canAfford(
  player: Player,
  cost: Partial<Record<Resource, number>>
): boolean {
  return Object.entries(cost).every(
    ([r, amt]) => player.resources[r as Resource] >= (amt || 0)
  );
}

// If the player can afford to build, spend those resources
export function spendResources(
  player: Player,
  cost: Partial<Record<Resource, number>>
): boolean {
  if (!canAfford(player, cost)) {
    return false;
  }
  Object.entries(cost).forEach(([r, amt]) => {
    player.resources[r as Resource] -= amt!;
  });
  return true;
}

// Cost to build a settlement
const SETTLEMENT_COST = {
  WOOD: 1,
  BRICK: 1,
  WOOL: 1,
  WHEAT: 1,
};

// Builds a settlement if the player can afford it
export function buildSettlement(player: Player): boolean {
  if (!spendResources(player, SETTLEMENT_COST)) {
    return false;
  }
  player.pieces.settlementsPlaced += 1;
  player.victoryPoints += 1;
  return true;
}

// Cost to build a city
const CITY_COST = {
  WHEAT: 2,
  ORE: 3,
};

// Builds a city if the player can afford it
export function buildCity(player: Player): boolean {
  if (!spendResources(player, CITY_COST)) {
    return false;
  }
  player.pieces.settlementsPlaced -= 1;
  player.pieces.citiesPlaced += 1;
  player.victoryPoints += 1; // upgrade gives +1 extra victory point
  return true;
}

// Cost to build a road
const ROAD_COST = {
  WOOD: 1,
  BRICK: 1,
};

// Builds a road if the player can afford it
export function buildRoad(player: Player): boolean {
  if (!spendResources(player, ROAD_COST)) {
    return false;
  }
  player.pieces.roadsPlaced += 1;
  return true;
}

// Cost to buy a development card
const DEV_COST = {
  WOOL: 1,
  WHEAT: 1,
  ORE: 1,
};

// Buys a development card if the player can afford it
export function buyDevCard(
  player: Player,
  deck: DevCard[]
): DevCard | null {
  if (!spendResources(player, DEV_COST)) {
    return null;
  }
  const card = deck.pop();
  if (!card) {
    return null;
  }
  player.developmentCards[card] += 1;
  return card;
}

// Allows the player to play a knight card
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

// Sucessfully trades agreed resources between players
export function tradePlayers(
  p1: Player,
  p2: Player,
  trade: Trade
): boolean {
  if (!canAfford(p1, trade.offer)) {
    return false;
  }
  if (!canAfford(p2, trade.request)) {
    return false;
  }
  spendResources(p1, trade.offer);
  spendResources(p2, trade.request);
  Object.entries(trade.offer).forEach(([r, amt]) => {
    p2.resources[r as Resource] += amt!;
  });
  Object.entries(trade.request).forEach(([r, amt]) => {
    p1.resources[r as Resource] += amt!;
  });
  return true;
}

// Resource trading ratio used for ports and supply bank
export function getTradeRatio(
  player: Player,
  resource: Resource
): number {
  const port = player.portsOwned.find(
    (p: any) => p.type === resource || p.type === "THREE_TO_ONE"
  );
  if (!port) {
    return 4;
  }
  return port.ratio === "2:1" ? 2 : 3;
}

// Checks for the player who played the most knights
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

// Checks for the player who build the longest road
export function updateLongestRoad(players: Player[]) {
  let max = 0;
  let owner: Player | null = null;
  players.forEach(p => {
    if (p.achievements.longestRoadLength > max && p.achievements.longestRoadLength >= 5) {
      max = p.achievements.longestRoadLength;
      owner = p;
    }
  });
  players.forEach(p => {
    p.achievements.hasLongestRoad = p === owner;
  });
}

// Calculates Victory Points each player currently has
export function calculateVP(player: Player): number {
  let vp = 0;
  vp += player.pieces.settlementsPlaced;
  vp += player.pieces.citiesPlaced * 2;
  vp += player.developmentCards.VICTORY_POINT;
  if (player.achievements.hasLargestArmy) {
    vp += 2;
  }
  if (player.achievements.hasLongestRoad) {
    vp += 2;
  }
  return vp;
}

// Begin turn (rolling the dice)
export function startTurn(player: Player) {
  setPhase(player, "ROLL");
}

// Move on to the trading phase (after rolling the dice)
export function moveToTrade(player: Player) {
  setPhase(player, "TRADE");
}

// Move on to the trading phase (after the trading phase)
export function moveToBuild(player: Player) {
  setPhase(player, "BUILD");
}

// Ends the player's current turn
export function endTurn(player: Player) {
  setPhase(player, "END");
}
