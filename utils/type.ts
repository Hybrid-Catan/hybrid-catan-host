type UUID = string;

/**
 * The turn phase state machine for a single player's turn.
 * - SETUP_1 / SETUP_2: initial placement rounds before the main game.
 * - ROLL: player must roll the dice before any other action.
 * - BUFFER: post-roll window where the player may trade or build.
 * - TRADE: active trade negotiation is in progress.
 * - BUILD: player is placing roads, settlements, cities, or buying dev cards.
 * - END: player signals end of turn; control passes to the next player.
 */
export type phase = "SETUP_1" | "SETUP_2" | "ROLL" | "BUFFER" | "TRADE" | "BUILD" | "END";

/**
 * The result of a dice roll for the current turn.
 * sum ranges from 2–12; a sum of 7 triggers robber movement.
 */
export type dice = {
    sum: number;
};

export type resourceCard = {
    "WOOD": number,
    "BRICK": number,
    "WOOL": number,
    "WHEAT": number,
    "ORE": number
}

export type trade = {
    "sender": UUID,
    "receiver": UUID,
    "receivingCards": resourceCard,
    "sendingCards": resourceCard,
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
    "resourceCards": resourceCard,
    "developmentCards": developmentCards,
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
    "phase": "SETUP_1" | "SETUP_2" | "ROLL" | "TRADE" | "BUILD" | "END",
    "dice": {
        "sum": number
    },
    "bank": {
        "resourcesCard": resourceCard,
        "developmentCard": number
    },
    "tradeState": {
        trades: trade[];
    },
    "winner": {
        "playerId": UUID,
    }
}