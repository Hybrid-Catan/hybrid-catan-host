import { UUID } from "crypto";
import type { GameState, Player, developmentCards } from "../../../utils/type.ts";

export function getTurnPlayerId(gameState: GameState): UUID {
    return gameState.players[0].playerId;
}

export function setPhaseToSetup1(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "SETUP",
        phase: "SETUP_1",
    };
}

export function setPhaseToSetup2(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "SETUP",
        phase: "SETUP_2",
        players: [...gameState.players].sort((a, b) => b.sequence - a.sequence),
    };
}

export function setPhaseToRoll(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "IN_PROGRESS",
        phase: "ROLL",
    };
}

export function setPhaseToBuffer(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "IN_PROGRESS",
        phase: "BUFFER",
    };
}

export function setPhaseToTrade(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "IN_PROGRESS",
        phase: "TRADE",
    };
}

export function setPhaseToBuild(gameState: GameState): GameState {
    return {
        ...gameState,
        status: "IN_PROGRESS",
        phase: "BUILD",
    };
}

export function setNextPlayer(gameState: GameState): GameState {
    const playersQueue = [...gameState.players];
    const currentPlayer = playersQueue.shift();
    if (!currentPlayer) return gameState;
    currentPlayer.newDevelopmentCards = {};
    currentPlayer.devCardPlayedThisTurn = false;
    playersQueue.push(currentPlayer);
    return {
        ...gameState,
        players: playersQueue,
    };
}

export function isLastPlayerInSetup1(gameState: GameState): boolean {
    return (
        gameState.phase === "SETUP_1" &&
        gameState.players[0].sequence === gameState.players.length
    );
}

export function isLastPlayerInSetup2(gameState: GameState): boolean {
    return (
        gameState.phase === "SETUP_2" &&
        gameState.players[0].sequence === 1
    );
}

export function confirmSetupRoad(gameState: GameState): GameState {
    const player = gameState.players[0]
    player.pieces.roadsPlaced += 1

    if (isLastPlayerInSetup1(gameState)) {
        return setPhaseToSetup2(gameState);
    }

    if (isLastPlayerInSetup2(gameState)) {
        return setPhaseToRoll(gameState);
    }

    return setNextPlayer(gameState);
}
