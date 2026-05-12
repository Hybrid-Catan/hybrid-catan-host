const BASE_URL = "http://localhost:3000";

export async function createGame(gameId: string) {
  const res = await fetch(`${BASE_URL}/api/init/gamestate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId }),
  });

  return res.json();
}