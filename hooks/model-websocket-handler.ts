// hooks/useCVWebSocket.ts
import { useEffect, useRef, useCallback } from "react";
import { parseBoardState, CVBoardState } from "@/utils/boardState";

type Options = {
    url?: string;
    onFrame?: (jpeg: Blob) => void;
    onState?: (state: CVBoardState) => void;
};

export function useCVWebSocket({
    url = "ws://localhost:8765",
    onFrame,
    onState,
}: Options) {
    const ws = useRef<WebSocket | null>(null);
    const pendingFrame = useRef<boolean>(false); // true = next msg is JSON

    const sendFrame = useCallback((jpegBytes: ArrayBuffer) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(jpegBytes);
        }
    }, []);

    useEffect(() => {
        const socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";
        ws.current = socket;

        socket.onmessage = (evt) => {
            if (!pendingFrame.current) {
                // First message after a send = JPEG blob
                onFrame?.(new Blob([evt.data], { type: "image/jpeg" }));
                pendingFrame.current = true;
            } else {
                // Second message = JSON board state
                try {
                    const raw = JSON.parse(new TextDecoder().decode(evt.data));
                    onState?.(parseBoardState(raw));
                } catch (e) {
                    console.error("[CV] Failed to parse board state", e);
                }
                pendingFrame.current = false;
            }
        };

        return () => socket.close();
    }, [url]);

    return { sendFrame };
}