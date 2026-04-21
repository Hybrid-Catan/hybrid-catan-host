import { UUID } from "crypto";
import type { GameState, Player } from "../../../utils/type.ts";

export function startGame(gameState:GameState)
{
    gameState.phase = "SETUP_1";
    gameState.status = "SETUP";

    return gameState;
}
