import { GameState, color } from "../../../../utils/type";
import { NextRequest, NextResponse } from "next/server";
import { initPlayer } from "@/backend/gamelogic/initilaisaiton/init";

const MAX_PLAYERS = 4;

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { color, sequence, name, gameState }: {
            color: color;
            sequence: number;
            name: string;
            gameState: GameState;
        } = await req.json();

        if (!color || sequence === undefined || sequence === null || !name || !gameState) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        if (gameState.players.length >= MAX_PLAYERS) {
            return NextResponse.json(
                { success: false, error: "Lobby is full (max 4 players)" },
                { status: 400 }
            );
        }

        const takenColors = gameState.players.map(p => p.color);
        if (takenColors.includes(color)) {
            return NextResponse.json(
                { success: false, error: "Color already taken" },
                { status: 400 }
            );
        }

        const newGameState: GameState = initPlayer(name, color, sequence, gameState);
        console.log("New GameState after adding player:", newGameState);
        return NextResponse.json(
            { success: true, data: newGameState },
            { status: 200 }
        );

    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error + " + error },
            { status: 500 }
        );
    }
}