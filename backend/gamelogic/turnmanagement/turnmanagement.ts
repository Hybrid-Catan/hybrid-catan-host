import { UUID } from "crypto";
import type { GameState } from "../../../utils/type.ts";

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
        players: [...gameState.players].reverse(),
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

    const currentPlayer = playersQueue.shift()!;
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