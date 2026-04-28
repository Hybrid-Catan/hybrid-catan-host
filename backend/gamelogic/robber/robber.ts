import { GameState, color } from "@/utils/type";

export function placeRobber(
    gameState: GameState,
    robberPosition: number
): GameState {

    // 1. Move robber
    let newGameState: GameState = {
        ...gameState,
        robber: {
            tileIndex: robberPosition
        }
    };

    // 2. OPTIONAL: steal logic (simplified)
    // Assume first player is current player
    const currentPlayer = newGameState.players[0];

    // Find players to steal from (you’ll later base this on board + settlements)
    const possibleTargets = newGameState.players.filter(
        (p) => p.playerId !== currentPlayer.playerId
    );

    if (possibleTargets.length > 0) {
        const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

        // Get available resource types
        const resources = Object.entries(target.resourceCards)
            .filter(([_, count]) => count > 0);

        if (resources.length > 0) {
            const [resourceType] = resources[Math.floor(Math.random() * resources.length)];

            // Transfer 1 resource
            target.resourceCards[resourceType as keyof typeof target.resourceCards] -= 1;
            currentPlayer.resourceCards[resourceType as keyof typeof currentPlayer.resourceCards] += 1;
        }
    }

    // 3. Move phase forward (usually to BUFFER)
    newGameState.phase = "BUFFER";

    return newGameState;
}