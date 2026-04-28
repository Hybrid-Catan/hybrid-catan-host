import { UUID } from "crypto";
import type { GameState, Player } from "../../../utils/type.ts";


export function getTurnPlayerId(gameState: GameState): UUID {
    return gameState.players[0].playerId;
}

export function setPhaseToSetup1(gameState: GameState) {
    gameState.status = "SETUP";
    gameState.phase = "SETUP_1";
    return gameState;
}

export function setPhaseToSetup2(gameState: GameState): GameState {
    gameState.status = "SETUP";
    return {
        ...gameState,
        phase: "SETUP_2",
    };
}

export function setPhaseToRoll(gameState: GameState): GameState {
    gameState.status = "IN_PROGRESS";
    return {
        ...gameState,
        phase: "ROLL",
    };
}

export function setPhaseToBuffer(gameState: GameState): GameState {
    gameState.status = "IN_PROGRESS";
    return {
        ...gameState,
        phase: "BUFFER",
    };
}

export function setPhaseToTrade(gameState: GameState): GameState {
    gameState.status = "IN_PROGRESS";
    return {
        ...gameState,
        phase: "TRADE",
    };
}

export function setPhaseToBuild(gameState: GameState): GameState {
    gameState.status = "IN_PROGRESS";
    return {
        ...gameState,
        phase: "BUILD",
    };
}

export function setNextPlayer(gameState: GameState): { newGameState: GameState } {
    const playersQueue = [...gameState.players];
    const currentPlayer = playersQueue.shift()!;
    playersQueue.push(currentPlayer);

    const newGameState: GameState = {
        ...gameState,
        players: playersQueue,
    };
    return { newGameState };
}


