import { NextRequest, NextResponse } from "next/server";
import { setPhaseToBuffer } from "@/backend/gamelogic/turnmanagement/turnmanagment";
import { games } from "@/app/lib/games";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const newGameState = setPhaseToBuffer(gameState);
        games.set(newGameState.gameId, newGameState);
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