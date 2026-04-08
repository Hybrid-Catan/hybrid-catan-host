import { UUID } from "crypto";
import { GameState, Player } from "../../../utils/type";

const RESOURCE_COSTS = {
    SETTLEMENT: { WOOD: 1, BRICK: 1, WOOL: 1, WHEAT: 1, ORE: 0 },
    CITY:       { WOOD: 0, BRICK: 0, WOOL: 0, WHEAT: 2, ORE: 3 },
    ROAD:       { WOOD: 1, BRICK: 1, WOOL: 0, WHEAT: 0, ORE: 0 },
    DEV_CARD:   { WOOD: 0, BRICK: 0, WOOL: 1, WHEAT: 1, ORE: 1 },
} as const;

type BuildAction = keyof typeof RESOURCE_COSTS;

const PIECE_LIMITS = {
    SETTLEMENT: 5,
    CITY: 4,
    ROAD: 15,
} as const;

type RuleResult = { valid: boolean; reason?: string };

export function canAfford(player: Player, action: BuildAction): RuleResult {
    const cost = RESOURCE_COSTS[action];
    for (const [resource, amount] of Object.entries(cost)) {
        const key = resource as keyof typeof player.resources;
        if (player.resources[key] < amount) {
            return {
                valid: false,
                reason: `Insufficient ${resource}: need ${amount}, have ${player.resources[key]}`,
            };
        }
    }
    return { valid: true };
}

export function hasPiecesRemaining(player: Player, action: "SETTLEMENT" | "CITY" | "ROAD"): RuleResult {
    const placed = {
        SETTLEMENT: player.pieces.settlementsPlaced,
        CITY: player.pieces.citiesPlaced,
        ROAD: player.pieces.roadsPlaced,
    }[action];

    if (placed >= PIECE_LIMITS[action]) {
        return {
            valid: false,
            reason: `No ${action.toLowerCase()} pieces remaining (limit: ${PIECE_LIMITS[action]})`,
        };
    }
    return { valid: true };
}

export function bankCanDistribute(
    gameState: GameState,
    resource: keyof GameState["bank"]["resources"],
    amount: number
): RuleResult {
    if (gameState.bank.resources[resource] < amount) {
        return {
            valid: false,
            reason: `Bank has insufficient ${resource}: need ${amount}, has ${gameState.bank.resources[resource]}`,
        };
    }
    return { valid: true };
}

export function bankHasDevCards(gameState: GameState): RuleResult {
    if (gameState.bank.developmentCardsRemaining <= 0) {
        return { valid: false, reason: "No development cards remaining in bank" };
    }
    return { valid: true };
}

export function calculateVictoryPoints(player: Player): number {
    let vp = 0;
    vp += (player.pieces.settlementsPlaced - player.pieces.citiesPlaced);
    vp += player.pieces.citiesPlaced * 2;
    vp += player.developmentCards.VICTORY_POINT;
    if (player.achievements.hasLongestRoad) vp += 2;
    if (player.achievements.hasLargestArmy) vp += 2;
    return vp;
}

export function checkVictoryCondition(player: Player): RuleResult {
    const vp = calculateVictoryPoints(player);
    if (vp >= 10) {
        return { valid: true, reason: `${player.name} wins with ${vp} victory points` };
    }
    return { valid: false, reason: `${player.name} has ${vp}/10 victory points` };
}

export function canBuildSettlement(player: Player): RuleResult {
    const affordable = canAfford(player, "SETTLEMENT");
    if (!affordable.valid) return affordable;
    return hasPiecesRemaining(player, "SETTLEMENT");
}

export function canBuildCity(player: Player): RuleResult {
    const affordable = canAfford(player, "CITY");
    if (!affordable.valid) return affordable;
    return hasPiecesRemaining(player, "CITY");
}

export function canBuildRoad(player: Player): RuleResult {
    const affordable = canAfford(player, "ROAD");
    if (!affordable.valid) return affordable;
    return hasPiecesRemaining(player, "ROAD");
}

export function canBuyDevCard(player: Player, gameState: GameState): RuleResult {
    const affordable = canAfford(player, "DEV_CARD");
    if (!affordable.valid) return affordable;
    return bankHasDevCards(gameState);
}
