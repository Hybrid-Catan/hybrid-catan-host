import type { GameState, Player, resourceCards } from "../../../utils/type";

type RuleResult = { valid: boolean; reason?: string };

const RESOURCE_KEYS: Array<keyof resourceCards> = ["WOOD", "BRICK", "WOOL", "WHEAT", "ORE"];

/** Total resource cards in a hand. */
export function totalCards(cards: resourceCards): number {
    let n = 0;
    for (const k of RESOURCE_KEYS) n += cards[k];
    return n;
}

/**
 * Computes the discard quota per player after a 7 is rolled.
 * Each player with strictly more than 7 cards owes floor(N/2) discards.
 * Returns a map keyed by playerId; empty if nobody owes anything.
 */
export function computePendingDiscards(players: Player[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const p of players) {
        const total = totalCards(p.resourceCards);
        if (total > 7) result[p.playerId] = Math.floor(total / 2);
    }
    return result;
}

/**
 * Validates a player's proposed discard.
 *
 * Rules:
 *  1. Game must be in the DISCARD phase.
 *  2. Player must owe a discard (be present in pendingDiscards).
 *  3. The discard's total card count must exactly match what's owed —
 *     no fewer (cheating), no more (overcommitting).
 *  4. The player must actually have the cards they're discarding.
 *
 * Beginner-friendly reasons.
 */
export function canDiscard(
    gameState: GameState,
    playerId: string,
    discard: Partial<resourceCards>,
): RuleResult {
    if (gameState.phase !== "DISCARD") {
        return { valid: false, reason: "There's nothing to discard right now." };
    }
    const owed = gameState.pendingDiscards?.[playerId];
    if (owed === undefined) {
        return {
            valid: false,
            reason: "You don't need to discard. Only players with more than 7 cards discard when a 7 is rolled.",
        };
    }
    const player = gameState.players.find(p => p.playerId === playerId);
    if (!player) return { valid: false, reason: "Player not found in this game." };

    let discardTotal = 0;
    for (const k of RESOURCE_KEYS) discardTotal += discard[k] ?? 0;

    if (discardTotal !== owed) {
        return {
            valid: false,
            reason: `You need to discard exactly ${owed} cards — you've chosen ${discardTotal}.`,
        };
    }
    for (const k of RESOURCE_KEYS) {
        const want = discard[k] ?? 0;
        if (want < 0) {
            return { valid: false, reason: `Can't discard a negative number of ${k.toLowerCase()}.` };
        }
        if (want > player.resourceCards[k]) {
            return {
                valid: false,
                reason: `You only have ${player.resourceCards[k]} ${k.toLowerCase()} card${player.resourceCards[k] === 1 ? "" : "s"} — can't discard ${want}.`,
            };
        }
    }
    return { valid: true };
}

/**
 * Applies a validated discard: removes cards from the player, returns them to
 * the bank, drops the player from pendingDiscards, and advances phase to
 * ROBBER once the queue is empty.
 *
 * Caller is responsible for calling `canDiscard` first.
 */
export function applyDiscard(
    gameState: GameState,
    playerId: string,
    discard: Partial<resourceCards>,
): GameState {
    const next: GameState = {
        ...gameState,
        players: gameState.players.map(p => {
            if (p.playerId !== playerId) return p;
            const newCards = { ...p.resourceCards };
            for (const k of RESOURCE_KEYS) newCards[k] -= discard[k] ?? 0;
            return { ...p, resourceCards: newCards };
        }),
        bank: {
            ...gameState.bank,
            resourceCards: (() => {
                const newBank = { ...gameState.bank.resourceCards };
                for (const k of RESOURCE_KEYS) newBank[k] += discard[k] ?? 0;
                return newBank;
            })(),
        },
        pendingDiscards: { ...(gameState.pendingDiscards ?? {}) },
    };
    delete next.pendingDiscards![playerId];

    // Once everyone has discarded, the roller (gameState.players[0]) moves the
    // robber.
    if (Object.keys(next.pendingDiscards!).length === 0) {
        next.pendingDiscards = undefined;
        next.phase = "ROBBER";
    }
    return next;
}
