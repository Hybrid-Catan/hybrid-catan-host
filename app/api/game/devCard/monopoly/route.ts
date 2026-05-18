import { NextRequest, NextResponse } from "next/server";
import { playMonopoly } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, resource } = await req.json();
        const newGameState = playMonopoly(gameState, resource);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot play Monopoly" },
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
