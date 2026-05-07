import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { gameState } = await req.json();

  if (!gameState) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const newState = {
    ...gameState,
    phase: "SETUP_1",
    status: "IN_PROGRESS"
  };

  return NextResponse.json({ success: true, data: newState });
}