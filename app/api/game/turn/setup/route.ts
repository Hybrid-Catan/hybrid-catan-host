import type { GameState } from "@/utils/type";
import {
    setNextPlayer,
    setPhaseToSetup2,
    setPhaseToRoll,
    isLastPlayerInSetup1,
    isLastPlayerInSetup2,
} from "@/backend/gamelogic/turnmanagement/turnmanagement";

export function confirmSetupRoad(gameState: GameState): GameState {

    if (isLastPlayerInSetup1(gameState)) {
        return setPhaseToSetup2(gameState);
    }

    if (isLastPlayerInSetup2(gameState)) {
        return setPhaseToRoll(gameState);
    }

    return setNextPlayer(gameState);
}