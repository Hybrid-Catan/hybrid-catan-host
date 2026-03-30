import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(handler);
    const peers = new Set<WebSocket>();

    // No { server: httpServer } — we handle upgrades manually
    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (socket) => {
        peers.add(socket);

        socket.on("message", (msg) => {
            peers.forEach((p) => {
                if (p !== socket && p.readyState === WebSocket.OPEN) {
                    p.send(msg.toString());
                }
            });
        });

        socket.on("close", () => peers.delete(socket));

        socket.on("error", (err) => console.error("WS error:", err));
    });

    // Only hijack upgrades on /ws — let Next.js handle everything else
    httpServer.on("upgrade", (req, socket, head) => {
        if (req.url === "/ws") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
        // For any other path, do nothing — Next.js handles its own upgrades
    });

    httpServer
        .once("error", (err) => { console.error(err); process.exit(1); })
        .listen(port, () => console.log(`> Ready on http://${hostname}:${port}`));
});