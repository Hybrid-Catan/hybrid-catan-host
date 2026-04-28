import { NextRequest, NextResponse } from "next/server";
import getActiveResourcesInfo from "@/backend/computervision/gameState";
import { addResource } from "@/backend/gamelogic/playerstatmanagement/playerstatmanagement";
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const { gameState } = await req.json();
        const resourceMap = getActiveResourcesInfo(gameState);
        const newGameState = addResource(gameState, resourceMap);
        return NextResponse.json(
            { success: true, data: newGameState },
            { status: 200 }
        ); x
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
