import { GameState, Player } from "@/utils/type";
import type { CVBoardState } from "@/utils/boardState";
import { getRobberStealTargets } from "../gamerules/gamerules";

/**
 * Finds the spiralIndex of the desert tile in the CV board state.
 * The robber starts on the desert in Catan, so this is used to seed the
 * robber's initial position once CV has detected the board.
 *
 * Returns null if CV hasn't found any tiles yet or there's no desert.
 */
export function findDesertTileIndex(cv: CVBoardState | undefined): number | null {
    if (!cv?.tile_results) return null;
    for (const t of cv.tile_results) {
        if (t.resource === "Desert" && typeof t.spiralIndex === "number") {
            return t.spiralIndex;
        }
    }
    return null;
}

/**
 * Applies a CV-detected robber movement to the game state.
 *
 * Called from /api/game/update-cv when CV reports the robber on a new tile
 * during the ROBBER phase. The physical-board move is the authoritative
 * input — the player commits the move by *picking up and placing the pawn*
 * rather than tapping a tile button.
 *
 * Steal handling:
 *   - 0 candidates: robber moves, no steal, phase → BUFFER.
 *   - 1 candidate:  auto-steal a random resource, phase → BUFFER.
 *   - 2+ candidates: phase stays in ROBBER and pendingStealCandidates is
 *                    populated so the active player can pick a target via
 *                    /api/game/robber/steal.
 */
export function applyDetectedRobberMove(
    gameState: GameState,
    newTileIdx: number,
): { gameState: GameState; stolenFrom: Player | null; stolenResource: keyof Player["resourceCards"] | null; awaitingChoice: boolean } {
    gameState.robber = { tileIndex: newTileIdx };
    const currentPlayer = gameState.players[0];
    const candidates = getRobberStealTargets(gameState, newTileIdx, currentPlayer);

    if (candidates.length === 0) {
        gameState.phase = "BUFFER";
        gameState.pendingStealCandidates = undefined;
        return { gameState, stolenFrom: null, stolenResource: null, awaitingChoice: false };
    }

    if (candidates.length === 1) {
        const target = candidates[0];
        const stolen = stealRandomCard(currentPlayer, target);
        gameState.phase = "BUFFER";
        gameState.pendingStealCandidates = undefined;
        return { gameState, stolenFrom: target, stolenResource: stolen, awaitingChoice: false };
    }

    // 2+ candidates — wait for the player to pick via /api/game/robber/steal
    gameState.pendingStealCandidates = candidates.map(p => p.playerId);
    return { gameState, stolenFrom: null, stolenResource: null, awaitingChoice: true };
}

/**
 * Resolves a pending steal-target choice. Called by /api/game/robber/steal.
 * Validates that targetPlayerId is in pendingStealCandidates, steals a random
 * card, transitions phase → BUFFER, clears pendingStealCandidates.
 */
export function resolveStealChoice(
    gameState: GameState,
    targetPlayerId: string,
): { valid: boolean; reason?: string; stolenFrom?: Player; stolenResource?: keyof Player["resourceCards"] | null } {
    if (gameState.phase !== "ROBBER") {
        return { valid: false, reason: "There's no robber move waiting to resolve." };
    }
    const candidates = gameState.pendingStealCandidates ?? [];
    if (!candidates.includes(targetPlayerId)) {
        return { valid: false, reason: "That player isn't a valid target — pick one of the candidates the robber's tile shows." };
    }
    const target = gameState.players.find(p => p.playerId === targetPlayerId);
    if (!target) {
        return { valid: false, reason: "Target player not found." };
    }
    const currentPlayer = gameState.players[0];
    const stolen = stealRandomCard(currentPlayer, target);
    gameState.phase = "BUFFER";
    gameState.pendingStealCandidates = undefined;
    return { valid: true, stolenFrom: target, stolenResource: stolen };
}

/** Steals one random resource (from those the target holds) into currentPlayer's hand. */
function stealRandomCard(currentPlayer: Player, target: Player): keyof Player["resourceCards"] | null {
    const available = (Object.entries(target.resourceCards) as Array<
        [keyof Player["resourceCards"], number]
    >).filter(([, count]) => count > 0);
    if (available.length === 0) return null;
    const pick = available[Math.floor(Math.random() * available.length)];
    const key = pick[0];
    target.resourceCards[key] -= 1;
    currentPlayer.resourceCards[key] += 1;
    return key;
}

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