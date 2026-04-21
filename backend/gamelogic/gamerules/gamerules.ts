/**
 * gamerules.ts
 *
 * Contains all rule validation logic for Hybrid Catan.
 * These functions are pure validators — they check whether an action is legal
 * and return a result, but do NOT modify any game state themselves.
 */

import type { GameState, Player } from "../../../utils/type.ts";


// ============================================================
// Resource Costs
// ============================================================

/**
 * Lookup table for the resource cost of each buildable action.
 * Based on official Catan rules.
 * "as const" locks these values so they can't be accidentally changed.
 */
const RESOURCE_COSTS = {
    SETTLEMENT: { WOOD: 1, BRICK: 1, WOOL: 1, WHEAT: 1, ORE: 0 },
    CITY:       { WOOD: 0, BRICK: 0, WOOL: 0, WHEAT: 2, ORE: 3 },
    ROAD:       { WOOD: 1, BRICK: 1, WOOL: 0, WHEAT: 0, ORE: 0 },
    DEV_CARD:   { WOOD: 0, BRICK: 0, WOOL: 1, WHEAT: 1, ORE: 1 },
} as const;

/**
 * A type automatically derived from the keys of RESOURCE_COSTS.
 * Can only be one of: "SETTLEMENT" | "CITY" | "ROAD" | "DEV_CARD"
 */
type BuildAction = keyof typeof RESOURCE_COSTS;


// ============================================================
// Piece Limits
// ============================================================

/**
 * Maximum number of physical pieces each player is allowed to place.
 * Based on official Catan rules.
 */
const PIECE_LIMITS = {
    SETTLEMENT: 5,
    CITY: 4,
    ROAD: 15,
} as const;


// ============================================================
// Validation Result
// ============================================================

/**
 * Standard return type for all rule-checking functions in this file.
 * - valid: true  → the action is allowed
 * - valid: false → the action is not allowed, reason explains why
 * - reason is optional and only included when valid is false
 */
type RuleResult = { valid: boolean; reason?: string };


// ============================================================
// Resource Cost Validation
// ============================================================

/**
 * Checks whether a player has enough resources to perform a given action.
 *
 * @param player - The player attempting the action
 * @param action - The action to check e.g. "SETTLEMENT", "CITY", "ROAD", "DEV_CARD"
 * @returns RuleResult — valid if the player can afford it, invalid with reason if not
 *
 * @example
 * canAfford(player, "SETTLEMENT")
 * // Returns { valid: false, reason: "Insufficient WOOD: need 1, have 0" }
 */
export function canAfford(player: Player, action: BuildAction): RuleResult {
    // Look up the resource cost for this action
    const cost = RESOURCE_COSTS[action];

    // Loop through each resource and its required amount
    // e.g. resource = "WOOD", amount = 1
    for (const [resource, amount] of Object.entries(cost)) {
        const key = resource as keyof typeof player.resourceCards;

        // If the player doesn't have enough of this resource, return invalid immediately
        if (player.resourceCards[key] < amount) {
            return {
                valid: false,
                reason: `Insufficient ${resource}: need ${amount}, have ${player.resourceCards[key]}`,
            };
        }
    }

    // All resource checks passed
    return { valid: true };
}


// ============================================================
// Piece Count Validation
// ============================================================

/**
 * Checks whether a player still has physical pieces remaining to place.
 * Each player has a limited supply: 5 settlements, 4 cities, 15 roads.
 *
 * @param player - The player attempting to place a piece
 * @param action - The piece type to check: "SETTLEMENT", "CITY", or "ROAD"
 * @returns RuleResult — valid if pieces remain, invalid with reason if the limit is reached
 *
 * @example
 * hasPiecesRemaining(player, "SETTLEMENT")
 * // Returns { valid: false, reason: "No settlement pieces remaining (limit: 5)" }
 */
export function hasPiecesRemaining(player: Player, action: "SETTLEMENT" | "CITY" | "ROAD"): RuleResult {
    // Map the action to how many of that piece the player has already placed
    const placed = {
        SETTLEMENT: player.pieces.settlementsPlaced,
        CITY: player.pieces.citiesPlaced,
        ROAD: player.pieces.roadsPlaced,
    }[action];

    // If they've hit or exceeded the limit, they have no pieces left
    if (placed >= PIECE_LIMITS[action]) {
        return {
            valid: false,
            reason: `No ${action.toLowerCase()} pieces remaining (limit: ${PIECE_LIMITS[action]})`,
        };
    }

    return { valid: true };
}


// ============================================================
// Bank Availability
// ============================================================

/**
 * Checks whether the bank has enough of a specific resource to distribute.
 * Used during the resource distribution phase (after a dice roll).
 *
 * @param gameState - The current game state containing the bank
 * @param resource - The resource type to check e.g. "WOOD", "BRICK"
 * @param amount - How many of that resource need to be distributed
 * @returns RuleResult — valid if the bank has enough, invalid with reason if not
 *
 * @example
 * bankCanDistribute(gameState, "WOOD", 3)
 * // Returns { valid: false, reason: "Bank has insufficient WOOD: need 3, has 1" }
 */
export function bankCanDistribute(
    gameState: GameState,
    resource: keyof GameState["bank"]["resourcesCard"],
    amount: number
): RuleResult {
    if (gameState.bank.resourcesCard[resource] < amount) {
        return {
            valid: false,
            reason: `Bank has insufficient ${resource}: need ${amount}, has ${gameState.bank.resourcesCard[resource]}`,
        };
    }
    return { valid: true };
}

/**
 * Checks whether the bank still has development cards available to purchase.
 *
 * @param gameState - The current game state containing the bank
 * @returns RuleResult — valid if cards remain, invalid if the deck is empty
 */
export function bankHasDevCards(gameState: GameState): RuleResult {
    if (gameState.bank.developmentCard <= 0) {
        return { valid: false, reason: "No development cards remaining in bank" };
    }
    return { valid: true };
}


// ============================================================
// Build Validation
// ============================================================
// Convenience functions that run both the resource cost check and the
// piece limit check in one call. Turn management calls these directly.
// They return early with the failure reason if either check fails.

/**
 * Checks whether a player can build a settlement.
 * Validates both resource cost (1 wood, 1 brick, 1 wool, 1 wheat)
 * and remaining piece count (max 5 settlements).
 *
 * @param player - The player attempting to build
 * @returns RuleResult — valid if both checks pass, invalid with reason if either fails
 */
export function canBuildSettlement(player: Player): RuleResult {
    const affordable = canAfford(player, "SETTLEMENT");
    if (!affordable.valid) return affordable;        // fails here if not enough resources
    return hasPiecesRemaining(player, "SETTLEMENT"); // fails here if no pieces left
}

/**
 * Checks whether a player can upgrade a settlement to a city.
 * Validates resource cost (2 wheat, 3 ore), piece limit (max 4 cities),
 * and that a settlement exists to upgrade.
 * The specific vertex check requires board state from the CV engine.
 *
 * @param player - The player attempting to upgrade
 * @returns RuleResult — valid if all checks pass, invalid with reason if any fail
 */
export function canUpgradeToCity(player: Player): RuleResult {
    const affordable = canAfford(player, "CITY");
    if (!affordable.valid) return affordable;

    const piecesLeft = hasPiecesRemaining(player, "CITY");
    if (!piecesLeft.valid) return piecesLeft;

    // citiesPlaced can never exceed settlementsPlaced since cities replace settlements
    // If they're equal, all settlements have already been upgraded — nothing left to upgrade
    if (player.pieces.settlementsPlaced <= player.pieces.citiesPlaced) {
        return { valid: false, reason: "No settlements available to upgrade to a city" };
    }

    return { valid: true };
}

/**
 * Checks whether a player can build a road.
 * Validates both resource cost (1 wood, 1 brick)
 * and remaining piece count (max 15 roads).
 *
 * @param player - The player attempting to build
 * @returns RuleResult — valid if both checks pass, invalid with reason if either fails
 */
export function canBuildRoad(player: Player): RuleResult {
    const affordable = canAfford(player, "ROAD");
    if (!affordable.valid) return affordable;
    return hasPiecesRemaining(player, "ROAD");
}

/**
 * Checks whether a player can buy a development card.
 * Validates both resource cost (1 wool, 1 wheat, 1 ore)
 * and whether the bank still has development cards remaining.
 *
 * @param player - The player attempting to buy
 * @param gameState - The current game state (needed to check bank stock)
 * @returns RuleResult — valid if both checks pass, invalid with reason if either fails
 */
export function canBuyDevCard(player: Player, gameState: GameState): RuleResult {
    const affordable = canAfford(player, "DEV_CARD");
    if (!affordable.valid) return affordable;
    return bankHasDevCards(gameState);
}


// ============================================================
// Robber
// ============================================================

/**
 * Checks whether a player can steal a resource from a target player.
 * A player cannot steal from someone who has no resources.
 *
 * @param target - The player being stolen from
 * @returns RuleResult — valid if the target has resources, invalid if their hand is empty
 */
export function canStealFrom(target: Player): RuleResult {
    const totalResources = Object.values(target.resourceCards).reduce((sum, amount) => sum + amount, 0);
    if (totalResources === 0) {
        return { valid: false, reason: `${target.name} has no resources to steal` };
    }
    return { valid: true };
}


// ============================================================
// Victory Condition
// ============================================================

/**
 * Calculates a player's total victory points from all sources:
 * - Settlements (1 VP each)
 * - Cities (2 VP each, upgraded from settlements)
 * - Victory Point development cards
 * - Longest Road bonus (2 VP)
 * - Largest Army bonus (2 VP)
 *
 * @param player - The player to calculate VP for
 * @returns The player's total victory points as a number
 *
 * @example
 * calculateVictoryPoints(player) // Returns 7
 */
export function calculateVictoryPoints(player: Player): number {
    let vp = 0;

    // Cities are upgraded from settlements, so we subtract citiesPlaced
    // from settlementsPlaced to avoid counting upgraded spots twice.
    // Example: 3 settlements placed, 1 upgraded to a city
    //   → (3 - 1) = 2 remaining settlements × 1 VP = 2 VP
    //   → 1 city × 2 VP = 2 VP
    //   → total from buildings = 4 VP
    vp += (player.pieces.settlementsPlaced - player.pieces.citiesPlaced);
    vp += player.pieces.citiesPlaced * 2;

    // VP development cards are kept secret and only revealed when a player wins
    vp += player.developmentCards.VICTORY_POINT;

    // Longest Road: awarded to the player with the longest continuous road (min 5)
    // Only one player can hold this bonus at a time
    if (player.achievements.hasLongestRoad) vp += 2;

    // Largest Army: awarded to the player who has played the most Knight cards (min 3)
    // Only one player can hold this bonus at a time
    if (player.achievements.hasLargestArmy) vp += 2;

    return vp;
}

/**
 * Checks whether a player has reached 10 victory points and won the game.
 *
 * @param player - The player to check
 * @returns RuleResult — valid: true if the player has won, with their VP count in the reason
 *
 * @example
 * checkVictoryCondition(player)
 * // Returns { valid: true, reason: "Alice wins with 10 victory points" }
 * // or      { valid: false, reason: "Alice has 7/10 victory points" }
 */
export function checkVictoryCondition(player: Player): RuleResult {
    const vp = calculateVictoryPoints(player);
    if (vp >= 10) {
        return { valid: true, reason: `${player.name} wins with ${vp} victory points` };
    }
    return { valid: false, reason: `${player.name} has ${vp}/10 victory points` };
}

/**
 * Checks whether a player can claim the Largest Army bonus.
 * Requires at least 3 knights played, and more than the current holder.
 *
 * @param player - The player attempting to claim Largest Army
 * @param gameState - The current game state (used to find the current holder's army size)
 * @returns RuleResult — valid if the player qualifies, invalid with reason if not
 */
export function canClaimLargestArmy(player: Player, gameState: GameState): RuleResult {
    // Must have played at least 3 knight cards
    if (player.achievements.armySize < 3) {
        return {
            valid: false,
            reason: `Army size too small: need at least 3 knights, have ${player.achievements.armySize}`,
        };
    }

    // Find the current Largest Army holder (if any)
    const currentHolder = gameState.players.find(p => p.achievements.hasLargestArmy);

    // If someone already holds it, this player must have strictly more knights
    if (currentHolder && player.achievements.armySize <= currentHolder.achievements.armySize) {
        return {
            valid: false,
            reason: `Must have more knights than current holder (${currentHolder.name} has ${currentHolder.achievements.armySize})`,
        };
    }

    return { valid: true };
}

/**
 * Checks whether a player can claim the Longest Road bonus.
 * Requires at least 5 connected roads, and a longer road than the current holder.
 * Note: actual road length calculation requires board state from the CV engine.
 *
 * @param claimedLength - The road length being claimed (calculated by CV/board logic)
 * @param gameState - The current game state (used to find the current holder's road length)
 * @returns RuleResult — valid if the player qualifies, invalid with reason if not
 */
export function canClaimLongestRoad(claimedLength: number, gameState: GameState): RuleResult {
    // Must have at least 5 connected roads
    if (claimedLength < 5) {
        return {
            valid: false,
            reason: `Road too short: need at least 5 connected roads, have ${claimedLength}`,
        };
    }

    // Find the current Longest Road holder (if any)
    const currentHolder = gameState.players.find(p => p.achievements.hasLongestRoad);

    // If someone already holds it, this player must have strictly more roads
    if (currentHolder && claimedLength <= currentHolder.achievements.longestRoadLength) {
        return {
            valid: false,
            reason: `Road not long enough: must beat current holder (${currentHolder.name} has ${currentHolder.achievements.longestRoadLength})`,
        };
    }

    return { valid: true };
}
