import { UUID } from "crypto";
import { CVBoardState } from "./boardState";


/**
 * The turn phase state machine for a single player's turn.
 * - SETUP_1 / SETUP_2: initial placement rounds before the main game.
 * - ROLL: player must roll the dice before any other action.
 * - BUFFER: post-roll window where the player may trade or build.
 * - TRADE: active trade negotiation is in progress.
 * - BUILD: player is placing roads, settlements, cities, or buying dev cards.
 * - END: player signals end of turn; control passes to the next player.
 */
export type phase = "SETUP_1" | "SETUP_2" | "ROLL" | "BUFFER" | "TRADE" | "BUILD" | "DISCARD" | "ROBBER" | "END";

/**
 * Resource types
 */
export type ResourceType =
    | "WOOD"
    | "BRICK"
    | "WOOL"
    | "WHEAT"
    | "ORE";

/**
 * Development card types
 */
export type DevelopmentCardType =
    | "KNIGHT"
    | "MONOPOLY"
    | "ROAD_BUILDING"
    | "INVENTION"
    | "VICTORY_POINT";

/**
 * The result of a dice roll for the current turn.
 * sum ranges from 2–12; a sum of 7 triggers robber movement.
 */
export type dice = {
    sum: number;
};

export type resourceCards = {
    "WOOD": number,
    "BRICK": number,
    "WOOL": number,
    "WHEAT": number,
    "ORE": number
}

export type trade = {
    "sender": UUID,
    "receiver": UUID,
    "receivingCards": resourceCards,
    "sendingCards": resourceCards,
    "isActive": boolean,
    "canAccept": boolean,
    "accepted": boolean
}

export type developmentCards = {
    "KNIGHT": number,
    "MONOPOLY": number,
    "ROAD_BUILDING": number,
    "INVENTION": number,
    "VICTORY_POINT": number
}

export type color = "BLUE" | "RED" | "WHITE" | "ORANGE";

/**
 * A rules-engine complaint about a piece the CV detected on the board.
 * `position` carries the offending vertex (settlements) or edge endpoints
 * (roads) so the UI can highlight the spot if it wants to. `reason` is a
 * beginner-friendly explanation suitable for showing in a tutor panel.
 */
export type BoardWarning = {
    type: "SETTLEMENT" | "ROAD";
    playerColor: color;
    position: { vertexId: number } | { vertexA: number; vertexB: number };
    reason: string;
};

/**
 * Represents a single player and all their in-game state.
 * Players are stored in turn order in GameState.players —
 * the first element is always the active player.
 */
export type Player = {
    "sequence": number,
    "playerId": UUID,
    "name": string,
    "color": "BLUE" | "RED" | "WHITE" | "ORANGE",
    "victoryPoints": number,
    "resourceCards": resourceCards,
    "developmentCards": Record<DevelopmentCardType, number>,
    "newDevelopmentCards": Partial<Record<DevelopmentCardType, number>>,
    "devCardPlayedThisTurn": boolean,
    "pieces": {
        "settlementsPlaced": number,
        "citiesPlaced": number,
        "roadsPlaced": number,
    },
    "achievements": {
        "hasLongestRoad": boolean,
        "longestRoadLength": number,
        "hasLargestArmy": boolean,
        "armySize": number,
    },
    "portsOwned": {
        "type": "WOOD" | "BRICK" | "WOOL" | "WHEAT" | "ORE" | "THREE_TO_ONE";
        "ratio": "2:1" | "3:1";
    }[];
}

/**
 * The root game state object. Single source of truth for the entire game.
 * players is ordered by turn — index 0 is the current active player.
 * After a turn ends, the active player is moved to the back of the array.
 * tradeState is null when no trade is in progress, and winner is null until
 * a player reaches the victory point threshold.
 */
export type GameState = {
    "gameId": string,
    "status": "SETUP" | "IN_PROGRESS" | "FINISHED",
    "players": Player[],// in queue
    "phase": "INIT" | "SETUP_1" | "SETUP_2" | "ROLL" | "BUFFER" | "TRADE" | "BUILD" | "ROAD_BUILDING" | "DISCARD" | "ROBBER" | "END",
    "dice": {
        "sum": number
    },
    "robber": {
        tileIndex: number;
    },
    "bank": {
        "resourceCards": resourceCards,
        "developmentCards": developmentCards,
    },
    "tradeState": {
        trades: trade[];
    },
    "pendingFreeRoads": number,
    "largestArmyPlayerId"?: string,
    "winner": {
        "playerId": UUID,
    }
    "cvBoardState": CVBoardState;
    /** Rule violations the CV pipeline detected. Populated by validateBoardPlacements. */
    "validationWarnings"?: BoardWarning[];
    /**
     * After a 7 is rolled, players with more than 7 cards must discard half.
     * Maps playerId → number of cards still owed. Cleared once each player
     * submits their discard. The game stays in the DISCARD phase until this
     * map is empty, then transitions to ROBBER.
     */
    "pendingDiscards"?: Record<string, number>;
    /**
     * After the robber moves to a tile with multiple stealable opponents,
     * the active player must pick which one to steal from. Holds those
     * playerIds; cleared once /api/game/robber/steal resolves the choice.
     */
    "pendingStealCandidates"?: string[];
}
export type PlayerToResourceMap = {
    [playerId: string]: resourceCards;
}
