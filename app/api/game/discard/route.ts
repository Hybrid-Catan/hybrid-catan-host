import { NextRequest, NextResponse } from "next/server";
import { games } from "@/app/lib/games";
import { canDiscard, applyDiscard } from "@/backend/gamelogic/robber/discard";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState, playerId, discard } = await req.json();

        // Use the host's authoritative copy so pendingDiscards reflects the
        // current truth (a phone-posted state may not yet show the DISCARD
        // phase if it polled before the roll completed).
        const game = games.get(gameState.gameId) ?? gameState;

        const check = canDiscard(game, playerId, discard);
        if (!check.valid) {
            return NextResponse.json(
                { success: false, error: check.reason ?? "Discard rejected." },
                { status: 400 },
            );
        }

        const updated = applyDiscard(game, playerId, discard);
        games.set(updated.gameId, updated);

        return NextResponse.json({ success: true, data: updated }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message ?? "Internal server error" },
            { status: 500 },
        );
    }
}
