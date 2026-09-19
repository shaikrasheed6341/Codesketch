import { WebSocketServer, WebSocket } from "ws";

const WS_PORT = Number(process.env.WS_PORT) || 8080;

export const wss = new WebSocketServer({
  port: WS_PORT,
});

console.log(`[WS] WebSocket Server is listening on port ${WS_PORT}`);

// Map of roomcode -> Set of active WebSocket connections
const roomClients = new Map<string, Set<WebSocket>>();
// Map of WebSocket -> metadata (roomcode, name)
const clientMeta = new Map<WebSocket, { roomcode: string; name: string }>();

wss.on("connection", (ws: WebSocket) => {
  console.log("[WS] New client connected");

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "join") {
        const { roomcode, name } = data;
        const codeStr = String(roomcode);
        clientMeta.set(ws, { roomcode: codeStr, name });

        if (!roomClients.has(codeStr)) {
          roomClients.set(codeStr, new Set());
        }
        roomClients.get(codeStr)!.add(ws);

        console.log(`[WS] User '${name}' joined room '${codeStr}'`);

        // Acknowledge join
        ws.send(JSON.stringify({ type: "joined", roomcode: codeStr, name, success: true }));

        // Notify others in room
        broadcastToRoom(codeStr, {
          type: "user_joined",
          roomcode: codeStr,
          name,
        }, ws);
      } else if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (data.roomcode) {
        broadcastToRoom(String(data.roomcode), data, ws);
      }
    } catch (err) {
      console.error("[WS] Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    const meta = clientMeta.get(ws);
    if (meta) {
      const { roomcode, name } = meta;
      clientMeta.delete(ws);
      const set = roomClients.get(roomcode);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          roomClients.delete(roomcode);
        }
      }
      console.log(`[WS] User '${name}' left room '${roomcode}'`);
      broadcastToRoom(roomcode, {
        type: "user_left",
        roomcode,
        name,
      });
    }
  });

  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err);
  });
});

function broadcastToRoom(roomcode: string, payload: unknown, excludeWs?: WebSocket) {
  const clients = roomClients.get(roomcode);
  if (!clients) return;

  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
