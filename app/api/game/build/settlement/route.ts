import { NextRequest, NextResponse } from "next/server";
import { buildSettlement } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { canConfirmSetupSettlement } from "@/backend/gamelogic/gamerules/gamerules";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();

        // During setup phases, gate on the CV-detected settlement. Read the
        // phase from the host's authoritative copy because the phone-posted
        // gameState can be a few seconds stale (its poll might predate the
        // setup-phase transition).
        const game = games.get(gameState.gameId) ?? gameState;
        if (game.phase === "SETUP_1" || game.phase === "SETUP_2") {
            const check = canConfirmSetupSettlement(game);
            if (!check.valid) {
                return NextResponse.json(
                    { success: false, error: check.reason ?? "Settlement not placed." },
                    { status: 400 }
                );
            }
        }

        const before = { ...gameState.players[0].resourceCards };
        const newGameState = buildSettlement(gameState);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot build settlement: insufficient resources" },
                { status: 400 }
            );
        }
        const after = newGameState.players[0].resourceCards;
        const resourceDelta = {
            WOOD: after.WOOD - before.WOOD,
            BRICK: after.BRICK - before.BRICK,
            WOOL: after.WOOL - before.WOOL,
            WHEAT: after.WHEAT - before.WHEAT,
            ORE: after.ORE - before.ORE,
        };
        games.set(newGameState.gameId, newGameState);
        return NextResponse.json(
            { success: true, data: newGameState, resourceDelta },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 400 }
        );
    }
}
