import { NextRequest, NextResponse } from "next/server";
import { playInvention } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, resource1, resource2 } = await req.json();
        const newGameState = playInvention(gameState, resource1, resource2);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot play Invention (Year of Plenty)" },
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
