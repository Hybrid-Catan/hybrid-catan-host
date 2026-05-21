import { NextRequest, NextResponse } from "next/server";
import { buildRoad, updatePlayerLongestRoadLengths } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
import { games } from "@/app/lib/games";

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const before = { ...gameState.players[0].resourceCards };
        const newGameState = buildRoad(gameState);
        if (!newGameState) {
            return NextResponse.json(
                { success: false, error: "Cannot build road: insufficient resources" },
                { status: 400 }
            );
        }
        updatePlayerLongestRoadLengths(newGameState);
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
