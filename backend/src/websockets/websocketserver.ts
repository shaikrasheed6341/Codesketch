import { WebSocketServer, WebSocket } from "ws";

const WS_PORT = Number(process.env.WS_PORT) || 8080;

export const wss = new WebSocketServer({
  port: WS_PORT,
});

console.log(`[WS] WebSocket Server is listening on port ${WS_PORT}`);

// Map of roomcode -> Set of active WebSocket connections
const roomClients = new Map<string, Set<WebSocket>>();
const roomBoards = new Map<string, Map<number, unknown[]>>();
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

        const boards = roomBoards.get(codeStr);
        if (boards) {
          for (const [canvasId, shapes] of boards) {
            ws.send(JSON.stringify({ type: "board_state", roomcode: codeStr, canvasId, shapes }));
          }
        }

        console.log(`[WS] User '${name}' joined room '${codeStr}'`);

        // Acknowledge join
        ws.send(JSON.stringify({ type: "joined", roomcode: codeStr, name, success: true }));

        // Notify others in room
        broadcastToRoom(codeStr, {
          type: "user_joined",
          roomcode: codeStr,
          name,
        }, ws);
        broadcastPresence(codeStr);
      } else if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (data.type === "board_sync" && data.roomcode && Number.isInteger(data.canvasId) && Array.isArray(data.shapes)) {
        let boards = roomBoards.get(String(data.roomcode));
        if (!boards) {
          boards = new Map<number, unknown[]>();
          roomBoards.set(String(data.roomcode), boards);
        }
        boards.set(data.canvasId, data.shapes);
      } else if (data.roomcode) {
        if (data.type === "board_shape_add" && Number.isInteger(data.canvasId) && data.shape) {
          let boards = roomBoards.get(String(data.roomcode));
          if (!boards) {
            boards = new Map<number, unknown[]>();
            roomBoards.set(String(data.roomcode), boards);
          }
          const currentShapes = boards.get(data.canvasId) ?? [];
          if (!currentShapes.some((shape) => (shape as { id?: string }).id === data.shape.id)) {
            boards.set(data.canvasId, [...currentShapes, data.shape]);
          }
        }
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
      broadcastPresence(roomcode);
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

function getPresence(roomcode: string) {
  const clients = roomClients.get(roomcode);
  if (!clients) return [];

  const names = new Set<string>();
  for (const client of clients) {
    const meta = clientMeta.get(client);
    if (meta && client.readyState === WebSocket.OPEN) {
      names.add(meta.name);
    }
  }

  return Array.from(names).map((name) => ({ name, status: "online" }));
}

function broadcastPresence(roomcode: string) {
  broadcastToRoom(roomcode, {
    type: "presence",
    roomcode,
    users: getPresence(roomcode),
  });
}
