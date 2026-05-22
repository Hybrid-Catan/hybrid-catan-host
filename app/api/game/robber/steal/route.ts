import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { resolveStealChoice } from "@/backend/gamelogic/robber/robber";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, targetPlayerId } = await req.json();

        // Use the host's authoritative copy so pendingStealCandidates is fresh.
        const game = games.get(gameState.gameId) ?? gameState;

        const result = resolveStealChoice(game, targetPlayerId);
        if (!result.valid) {
            return NextResponse.json(
                { success: false, error: result.reason ?? "Cannot resolve steal." },
                { status: 400 },
            );
        }

        games.set(game.gameId, game);

        return NextResponse.json(
            {
                success: true,
                data: game,
                stolenFrom: result.stolenFrom?.playerId ?? null,
                stolenResource: result.stolenResource ?? null,
            },
            { status: 200 },
        );
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message ?? "Internal server error" },
            { status: 500 },
        );
    }
}
