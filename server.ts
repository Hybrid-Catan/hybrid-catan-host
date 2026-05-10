import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
        }
        handler(req, res);
    });

    const wss = new WebSocketServer({ noServer: true });

    interface Room {
        host: WebSocket | null;
        players: Map<number, WebSocket>;
        active: boolean; // true = host is connected
    }

    // Key: gameId → Room
    const rooms = new Map<string, Room>();

    /** Broadcast a message to all currently-connected players in a room */
    function broadcastToPlayers(room: Room, payload: object) {
        const msg = JSON.stringify(payload);
        for (const ws of room.players.values()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
    }

    wss.on("connection", (socket) => {
        let currentRoomId: string | null = null;
        let isHost = false;
        let playerIndex: number | null = null;

        socket.on("message", (msg) => {
            console.log("Received message:", msg.toString());
            const data = JSON.parse(msg.toString());
            const { type, gameId } = data;

            if (!gameId) return;

            switch (type) {
                // ── HOST ────────────────────────────────────────────────────
                case "register_host": {
                    isHost = true;
                    currentRoomId = gameId;

                    if (rooms.has(gameId)) {
                        // Host is reconnecting to an existing (inactive) room
                        const room = rooms.get(gameId)!;
                        room.host = socket;
                        room.active = true;
                        console.log(`Host reconnected for room: ${gameId}`);

                        // Tell all waiting players the host is back
                        broadcastToPlayers(room, { type: "host_reconnected", gameId });
                    } else {
                        rooms.set(gameId, {
                            host: socket,
                            players: new Map(),
                            active: true,
                        });
                        console.log(`Host registered for room: ${gameId}`);
                    }
                    break;
                }

                // ── PLAYER ──────────────────────────────────────────────────
                case "join_room": {
                    currentRoomId = gameId;
                    playerIndex = data.playerIndex;

                    let room = rooms.get(gameId);

                    if (!room) {
                        // Room doesn't exist yet — player arrived before host
                        room = { host: null, players: new Map(), active: false };
                        rooms.set(gameId, room);
                    }

                    room.players.set(data.playerIndex, socket);
                    console.log(`Player ${data.playerIndex} joined ${gameId}`);

                    if (!room.active || !room.host) {
                        // Host not present — let the player know immediately
                        socket.send(JSON.stringify({ type: "host_disconnected", gameId }));
                        break;
                    }

                    if (room.host.readyState === WebSocket.OPEN) {
                        room.host.send(JSON.stringify({
                            type: "player_joined",
                            playerIndex: data.playerIndex,
                        }));
                    }
                    break;
                }

                // ── SIGNALING ────────────────────────────────────────────────
                case "offer":
                case "ice": {
                    const room = rooms.get(gameId);
                    if (!room || socket !== room.host) break;

                    const target = room.players.get(data.playerIndex);
                    if (target?.readyState === WebSocket.OPEN) {
                        target.send(msg.toString());
                    }
                    break;
                }

                case "answer": {
                    const room = rooms.get(gameId);
                    if (room?.host?.readyState === WebSocket.OPEN) {
                        room.host.send(msg.toString());
                    }
                    break;
                }

                // ── EXPLICIT HOST DISCONNECT ─────────────────────────────────
                case "host_leaving": {
                    const room = rooms.get(gameId);
                    if (!room || socket !== room.host) break;

                    room.active = false;
                    room.host = null;
                    broadcastToPlayers(room, { type: "host_disconnected", gameId });
                    console.log(`Host explicitly left room: ${gameId}`);
                    break;
                }
            }
        });

        socket.on("close", () => {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            if (isHost && socket === room.host) {
                // Implicit host disconnect (tab closed, network lost, etc.)
                room.active = false;
                room.host = null;
                console.log(`Host implicitly disconnected from room: ${currentRoomId}`);
                broadcastToPlayers(room, { type: "host_disconnected", gameId: currentRoomId });
            } else if (playerIndex !== null) {
                room.players.delete(playerIndex);
                console.log(`Player ${playerIndex} left room: ${currentRoomId}`);
            }
        });

        socket.on("error", (err) => console.error("WS error:", err));
    });

    httpServer.on("upgrade", (req, socket, head) => {
        if (req.url === "/ws") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
    });

    httpServer
        .once("error", (err) => { console.error(err); process.exit(1); })
        .listen(port, "0.0.0.0", () =>
            console.log(`> Ready on http://192.168.21.11:${port}`)
        );
});