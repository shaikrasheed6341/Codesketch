import { WEBSOCKET_URL } from "../utils/apiurl.ts";

/**
 * Opens a WebSocket connection.
 * Call this ONLY after the backend has validated roomcode + username.
 */
export function connectWebSocket(
  roomcode: string,
  name: string,
  onMessage?: (data: string) => void
): WebSocket {
  const ws = new WebSocket(WEBSOCKET_URL);
  let pingInterval: ReturnType<typeof setInterval> | undefined;

  ws.addEventListener("open", () => {
    console.log("[WS] Connected");
    // Send join payload so the server adds user to the room
    ws.send(JSON.stringify({ type: "join", roomcode, name }));

    // Optional keep-alive ping
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);
  });

  ws.addEventListener("message", (e) => {
    console.log("[WS] Message:", e.data);
    onMessage?.(e.data);
  });

  ws.addEventListener("close", () => {
    console.log("[WS] Disconnected");
    if (pingInterval) clearInterval(pingInterval);
  });

  ws.addEventListener("error", () => {
    console.error("[WS] Error");
    if (pingInterval) clearInterval(pingInterval);
  });

  // Reconnect on bfcache restore (back-forward navigation)
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && ws.readyState === WebSocket.CLOSED) {
      connectWebSocket(roomcode, name, onMessage);
    }
  });

  return ws;
}
