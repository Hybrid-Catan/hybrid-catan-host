import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const gameState = await req.json();

  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);

  const newGameState = {
    ...gameState,
    phase: "BUFFER",
    dice: { sum: d1 + d2 },
  };

  console.dir(newGameState, { depth: null });

  return NextResponse.json({
    gameState: newGameState,
    dice: [d1, d2],
  });
}