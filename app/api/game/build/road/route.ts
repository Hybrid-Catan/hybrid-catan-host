import { NextRequest, NextResponse } from "next/server";
import { buildRoad } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const {gameState} = await req.json();
        const newGameState = buildRoad(gameState);
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