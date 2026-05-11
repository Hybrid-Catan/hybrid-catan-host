import { NextRequest, NextResponse } from "next/server";
import { buildRoad } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const newGameState = buildRoad(gameState);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot build road: insufficient resources, no pieces remaining, or invalid phase" },
                { status: 400 }
            );
        }
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
