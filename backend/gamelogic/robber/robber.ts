import { GameState, Player } from "@/utils/type";
import { getRobberStealTargets } from "../gamerules/gamerules";

export type PlaceRobberResult = {
    gameState: GameState;
    stolenFrom: Player | null;
    stolenResource: keyof Player["resourceCards"] | null;
};

/**
 * Moves the robber to `robberPosition` and resolves the steal.
 *
 * Steal logic (Catan rules):
 *  - The active player (gameState.players[0]) chooses a target from the
 *    opponents who have at least one settlement/city on a vertex adjacent to
 *    the new robber tile AND have at least one resource card to take.
 *  - If `targetPlayerId` is provided and valid, that player is used.
 *  - If `targetPlayerId` is null/invalid but only one valid target exists,
 *    that target is used.
 *  - If no valid target exists, the robber moves but nothing is stolen.
 *  - The stolen resource is chosen randomly from the target's hand
 *    (Catan rule: target is taken at random because the hand is hidden).
 *
 * Caller is responsible for validating with `canPlaceRobber` first.
 */
export function placeRobber(
    gameState: GameState,
    robberPosition: number,
    targetPlayerId?: string | null,
): PlaceRobberResult {
    const newGameState: GameState = {
        ...gameState,
        robber: { tileIndex: robberPosition },
    };

    const currentPlayer = newGameState.players[0];
    const candidates = getRobberStealTargets(newGameState, robberPosition, currentPlayer);

    let target: Player | null = null;
    if (targetPlayerId) {
        target = candidates.find(p => p.playerId === targetPlayerId) ?? null;
    }
    if (!target && candidates.length === 1) {
        target = candidates[0];
    }

    let stolenResource: keyof Player["resourceCards"] | null = null;
    if (target) {
        const available = (Object.entries(target.resourceCards) as Array<
            [keyof Player["resourceCards"], number]
        >).filter(([, count]) => count > 0);
        if (available.length > 0) {
            const pick = available[Math.floor(Math.random() * available.length)];
            stolenResource = pick[0];
            target.resourceCards[stolenResource] -= 1;
            currentPlayer.resourceCards[stolenResource] += 1;
        }
    }

    newGameState.phase = "BUFFER";

    return { gameState: newGameState, stolenFrom: target, stolenResource };
}