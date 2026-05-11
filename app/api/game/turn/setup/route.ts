import { NextResponse } from "next/server";
import { confirmSetupRoad } from "@/backend/gamelogic/turnmanagement/turnmanagement";

export async function POST(req: Request) {
  try {
    const { gameState } = await req.json();

    const updated = confirmSetupRoad(gameState);

    console.dir(updated, { depth: null })

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}