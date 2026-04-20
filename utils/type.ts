import { UUID } from "crypto";

/**
 * Represents the five resource card types in Catan.
 * Used by players, the bank, and trade offers to track resource quantities.
 */
export type resourcesCards = {
    WOOD: number;
    BRICK: number;
    WOOL: number;
    WHEAT: number;
    ORE: number;
};

/**
 * Represents the five development card types a player can hold.
 * Quantities are tracked per card type rather than as a flat list.
 */
export type developmentCards = {
    KNIGHT: number;
    MONOPOLY: number;
    ROAD_BUILDING: number;
    INVENTION: number;
    VICTORY_POINT: number;
};

/**
 * Tracks how many of each piece type a player has placed on the board.
 * Used to enforce placement limits (5 settlements, 4 cities, 15 roads per player).
 */
export type pieces = {
    settlementsPlaced: number;
    citiesPlaced: number;
    roadsPlaced: number;
};

/**
 * Represents a single port owned by a player.
 * The port type determines which resource gets a favourable trade ratio with the bank.
 * Resource-specific ports grant 2:1; THREE_TO_ONE grants 3:1 on any resource.
 */
export type portsOwned = {
    type: "WOOD" | "BRICK" | "WOOL" | "WHEAT" | "ORE" | "THREE_TO_ONE";
};

/**
 * Tracks a player's special achievement statuses.
 * Longest Road (5+ roads) and Largest Army (3+ knights) each grant 2 bonus victory points.
 */
export type achievements = {
    hasLongestRoad: boolean;
    longestRoadLength: number;
    hasLargestArmy: boolean;
    armySize: number;
};

/**
 * Represents a single trade offer between two players.
 * The resourcesCards field encodes the net delta from player1's perspective —
 * positive values are what player1 gives, negative values are what player1 receives.
 * isActive is true while the offer is pending; accepted reflects the target's response.
 */
export type Trade = {
    sender: UUID;
    receiver: UUID;
    sendingCards: resourcesCards;
    receivingCards: resourcesCards;
    isActive: boolean;
    canAccept: boolean;
    accepted: boolean;
};

/**
 * Holds all trade offers active during the current turn's trade phase.
 * Cleared to null once the turn moves past TRADE/BUFFER back to the next player.
 */
export type TradeState = {
    trades: Trade[];
};

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

/**
 * Represents a single player and all their in-game state.
 * Players are stored in turn order in GameState.players —
 * the first element is always the active player.
 */
export type Player = {
    playerId: UUID;
    name: string;
    color: "BLUE" | "RED" | "WHITE" | "ORANGE";
    victoryPoints: number;
    resourcesCards: resourcesCards;
    developmentCards: developmentCards;
    pieces: pieces;
    achievements: achievements;
    portsOwned: portsOwned;
};

/**
 * The root game state object. Single source of truth for the entire game.
 * players is ordered by turn — index 0 is the current active player.
 * After a turn ends, the active player is moved to the back of the array.
 * tradeState is null when no trade is in progress, and winner is null until
 * a player reaches the victory point threshold.
 */
export type GameState = {
    gameId: string;
    status: "SETUP" | "IN_PROGRESS" | "FINISHED";
    players: Player[];
    phase: phase;
    dice: dice;
    bank: {
        bankId: UUID;
        resourcesCards: resourcesCards;
        developmentCards: developmentCards;
    };
    tradeState: TradeState;
    winner: UUID | null;
};

export type TradeRequest = {
    sender: UUID;
    receiver: UUID;
    sendingCards: resourcesCards;
    receivingCards: resourcesCards;
};

export type Result =
    | { success: true; data: any }
    | { success: false; error: string };