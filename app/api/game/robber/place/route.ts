import { NextRequest, NextResponse } from "next/server";
import { placeRobber } from "@/backend/gamelogic/robber/robber";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, robberPosition } = await req.json();

        const updatedGameState = placeRobber(gameState, robberPosition);

        return NextResponse.json(
            { success: true, data: updatedGameState },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}