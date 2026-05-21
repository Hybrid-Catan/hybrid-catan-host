import { NextRequest, NextResponse } from "next/server";
import { placeRobber } from "@/backend/gamelogic/robber/robber";
import { canPlaceRobber } from "@/backend/gamelogic/gamerules/gamerules";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, robberPosition, targetPlayerId } = await req.json();

        // Use the host's authoritative game so CV state is fresh.
        const game = games.get(gameState.gameId) ?? gameState;

        const check = canPlaceRobber(robberPosition, game);
        if (!check.valid) {
            return NextResponse.json(
                { success: false, error: check.reason ?? "Cannot place robber." },
                { status: 400 },
            );
        }

        const result = placeRobber(game, robberPosition, targetPlayerId ?? null);
        games.set(result.gameState.gameId, result.gameState);

        return NextResponse.json(
            {
                success: true,
                data: result.gameState,
                stolenFrom: result.stolenFrom?.playerId ?? null,
                stolenResource: result.stolenResource,
            },
            { status: 200 },
        );
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message ?? "Internal server error" },
            { status: 500 },
        );
    }
}