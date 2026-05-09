import { NextRequest, NextResponse } from "next/server";
import { setNextPlayer, setPhaseToRoll } from "@/backend/gamelogic/turnmanagement/turnmanagment";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        //1. Turn the state to roll phase
        const { gameState } = await req.json();
        const rollPhase = setPhaseToRoll(gameState);

        //2. Pop out the player whos turn it is and send it the last 
        const { newGameState } = setNextPlayer(rollPhase);

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