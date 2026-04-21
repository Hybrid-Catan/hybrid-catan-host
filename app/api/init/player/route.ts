import { GameState, color } from "../../../../utils/type";
import { NextRequest, NextResponse } from "next/server";
import { initPlayer } from "@/backend/gamelogic/initilaisaiton/init";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { color, sequence, name, gameState }: {
            color: color;
            sequence: number;
            name: string;
            gameState: GameState;
        } = await req.json();

        if (!color || !sequence || !name || !gameState) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        const newGameState: GameState = initPlayer(color, sequence, name, gameState);

        return NextResponse.json(
            { success: true, data: newGameState },
            { status: 200 }
        );

    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}