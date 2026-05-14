import { NextRequest, NextResponse } from "next/server";
import { buildRoad } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const newGameState = buildRoad(gameState);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot build road: insufficient resources" },
                { status: 400 }
            );
        }
        games.set(newGameState.gameId, newGameState);
        return NextResponse.json(
            { success: true, data: newGameState },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 400 }
        );
    }
}
