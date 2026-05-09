import { NextRequest, NextResponse } from "next/server";
import { setPhaseToSetup1 } from "@/backend/gamelogic/turnmanagement/turnmanagment";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const newGameState = setPhaseToSetup1(gameState);
        return NextResponse.json(
            { success: true, data: newGameState },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error" + error },
            { status: 500 }
        );
    }
}