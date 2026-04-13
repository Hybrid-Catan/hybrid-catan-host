import { UUID } from "crypto";
export type resources = {
    WOOD: number;
    BRICK: number;
    WOOL: number;
    WHEAT: number;
    ORE: number;
};
export type developmentCards = {
    KNIGHT: number;
    MONOPOLY: number;
    ROAD_BUILDING: number;
    INVENTION: number;
    VICTORY_POINT: number;
};

export type Trade = {
    player1: UUID;
    player2: UUID;
    resources: {
        WOOD: number;
        BRICK: number;
        WOOL: number;
        WHEAT: number;
        ORE: number;
    };
    isActive: boolean;
    accepted: boolean;
};

export type TradeState = {
    trades: Trade[];
};

export type Player = {
    playerId: UUID;
    name: string;
    color: "BLUE" | "RED" | "WHITE" | "ORANGE";
    victoryPoints: number;
    resources: resources;

    developmentCards: developmentCards;
    pieces: {
        settlementsPlaced: number;
        citiesPlaced: number;
        roadsPlaced: number;
    };
    achievements: {
        hasLongestRoad: boolean;
        longestRoadLength: number;
        hasLargestArmy: boolean;
        armySize: number;
    };
    portsOwned: {
        type: "WOOD" | "BRICK" | "WOOL" | "WHEAT" | "ORE" | "THREE_TO_ONE";
        ratio: "2:1" | "3:1";
    }[];
    turnState: {
        currentPhase: "SETUP" | "ROLL" | "TRADE" | "BUILD" | "END";
    };
};

export type GameState = {
    gameId: string;
    status: "SETUP" | "IN_PROGRESS" | "FINISHED";
    players: Player[];
    phase: "SETUP_1" | "SETUP_2" | "ROLL" | "BUFFER" | "TRADE" | "BUILD" | "END";
    dice: {
        sum: number;
    };
    bank: {
        resourses: resources;
        developmentCards: developmentCards;
    };
    tradeState: TradeState | null;
    winner: {
        playerId: UUID;
    } | null;
};