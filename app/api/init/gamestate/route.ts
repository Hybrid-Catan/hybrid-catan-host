import { GameState, color } from "../../../../utils/type";
import { NextRequest, NextResponse } from "next/server";
import { initGameState, initPlayer } from "@/backend/gamelogic/initilaisaiton/init";
export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const gameState: GameState = initGameState();
        return NextResponse.json(
            { success: true, data: gameState },
            { status: 200 }
        );

    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}