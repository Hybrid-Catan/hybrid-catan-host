import { UUID } from "crypto";
import type { GameState, Player } from "../../../utils/type.ts";

export function setPhaseToSetup1(gameState:GameState)
{
    gameState.status = "IN_PROGRESS";
    gameState.phase = "SETUP_1";

    return gameState;
}

export function setPhaseToSetup2(gameState: GameState): GameState {
    return {
        ...gameState,
        phase: "SETUP_2",
    };
}

export function setPhaseToRoll(gameState: GameState): GameState {
    return {
        ...gameState,
        phase: "ROLL",
    };
}

export function setPhaseToBuffer(gameState: GameState): GameState {
    return {
        ...gameState,
        phase: "BUFFER",
    };
}

export function setPhaseToTrade(gameState: GameState): GameState {
    return {
        ...gameState,
        phase: "TRADE",
    };
}

export function setPhaseToBuild(gameState: GameState): GameState {
    return {
        ...gameState,
        phase: "BUILD",
    };
}

