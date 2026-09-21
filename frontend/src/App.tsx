import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import "./App.css";
import JoinRoom from "./components/JoinRoom";
import { getZoomStep } from "./zoomMath";
import drawshape from "./toolbar/drawshape";
import { panCanvas } from "./toolbar/pan";
import { BsFillPencilFill } from "react-icons/bs";
import { MdOutlineHorizontalRule } from "react-icons/md";
import { FaArrowRightLong } from "react-icons/fa6";
import { RiCircleLine, RiEraserLine, RiRectangleLine } from "react-icons/ri";
import { IoHandLeftOutline } from "react-icons/io5";
import { getWebcamStream } from "./webcam";
type Point = {
  x: number;
  y: number;
};

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type Shape = {
  id: string;
  tool: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  points?: Point[];
  text?: string;
  fontSize?: number;
};

type PresenceUser = {
  name: string;
  status: "online" | "offline";
};

type RoomSocketMessage =
  | { type: "presence"; users: PresenceUser[] }
  | { type: "user_joined"; name: string; roomcode: string }
  | { type: "user_left"; name: string; roomcode: string }
  | {
      type: "webrtc_offer";
      from: string;
      to: string;
      roomcode: string;
      offer: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc_answer";
      from: string;
      to: string;
      roomcode: string;
      answer: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc_ice";
      from: string;
      to: string;
      roomcode: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "board_lock";
      from: string;
      roomcode: string;
    }
  | {
      type: "board_unlock";
      from: string;
      roomcode: string;
    }
  | {
      type: "board_draft";
      from: string;
      roomcode: string;
      shape: Shape | null;
      points: Point[];
    }
  | {
      type: "board_cursor";
      from: string;
      roomcode: string;
      point: Point;
    }
  | {
      type: "board_shape_add";
      from: string;
      roomcode: string;
      shape: Shape;
    };

type BoardSocketMessage = Extract<
  RoomSocketMessage,
  {
    type:
      | "board_lock"
      | "board_unlock"
      | "board_draft"
      | "board_cursor"
      | "board_shape_add";
  }
>;
type BoardOutgoingMessage = BoardSocketMessage extends infer Message
  ? Message extends BoardSocketMessage
    ? Omit<Message, "from" | "roomcode">
    : never
  : never;

type Interaction = {
  type: "move" | "resize";
  id: string;
  startX: number;
  startY: number;
  shape: Shape;
  handle?: ResizeHandle;
};

const makeShapeId = () =>
  `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const distanceToSegment = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const projection =
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closestX = a.x + clamped * dx;
  const closestY = a.y + clamped * dy;

  return Math.hypot(point.x - closestX, point.y - closestY);
};

const moveShape = (shape: Shape, dx: number, dy: number): Shape => {
  if (shape.tool === "pencil" && shape.points) {
    return {
      ...shape,
      points: shape.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      })),
    };
  }

  return {
    ...shape,
    startX: (shape.startX ?? 0) + dx,
    startY: (shape.startY ?? 0) + dy,
    endX: (shape.endX ?? 0) + dx,
    endY: (shape.endY ?? 0) + dy,
  };
};



const resizeShape = (
  shape: Shape,
  handle: ResizeHandle,
  pointer: Point,
  original: Shape,
): Shape => {
  const startX = original.startX ?? 0;
  const startY = original.startY ?? 0;
  const endX = original.endX ?? 0;
  const endY = original.endY ?? 0;

  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const maxX = Math.max(startX, endX);
  const maxY = Math.max(startY, endY);

  let nextMinX = minX;
  let nextMinY = minY;
  let nextMaxX = maxX;
  let nextMaxY = maxY;

  if (handle.includes("w")) nextMinX = pointer.x;
  if (handle.includes("e")) nextMaxX = pointer.x;
  if (handle.includes("n")) nextMinY = pointer.y;
  if (handle.includes("s")) nextMaxY = pointer.y;

  if (shape.tool === "line" || shape.tool === "arrow") {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scaleX = Math.max(0.1, (nextMaxX - nextMinX) / width);
    const scaleY = Math.max(0.1, (nextMaxY - nextMinY) / height);

    const nextStartX = centerX + (startX - centerX) * scaleX;
    const nextStartY = centerY + (startY - centerY) * scaleY;
    const nextEndX = centerX + (endX - centerX) * scaleX;
    const nextEndY = centerY + (endY - centerY) * scaleY;

    return {
      ...shape,
      startX: nextStartX,
      startY: nextStartY,
      endX: nextEndX,
      endY: nextEndY,
    };
  }

  return {
    ...shape,
    startX: nextMinX,
    startY: nextMinY,
    endX: nextMaxX,
    endY: nextMaxY,
  };
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const panStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedTool, setSelectedTool] = useState("draw");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [remoteDraftShape, setRemoteDraftShape] = useState<Shape | null>(null);
  const [remoteDraftPoints, setRemoteDraftPoints] = useState<Point[]>([]);
  const [remoteCursor, setRemoteCursor] = useState<{ name: string; point: Point } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteName, setRemoteName] = useState("");
  const [showJoinRoom, setShowJoinRoom] = useState(true);
  const [roomInfo, setRoomInfo] = useState<{ name: string; roomcode: string } | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [activeDrawer, setActiveDrawer] = useState("");
  const roomInfoRef = useRef<{ name: string; roomcode: string } | null>(null);
  const activeDrawerRef = useRef("");

  const getCanvasPoint = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scaleX = event.currentTarget.width / rect.width;
      const scaleY = event.currentTarget.height / rect.height;

      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      const worldX = (canvasX - offset.x) / zoom;
      const worldY = (canvasY - offset.y) / zoom;

      return { x: worldX, y: worldY };
    },
    [offset, zoom],
  );

  const getCanvasScreenPoint = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: (point.x * zoom + offset.x) / scaleX,
        y: (point.y * zoom + offset.y) / scaleY,
      };
    },
    [offset, zoom],
  );

  const getShapeBounds = useCallback((shape: Shape) => {
    if (shape.tool === "pencil" && shape.points && shape.points.length > 0) {
      const xs = shape.points.map((point) => point.x);
      const ys = shape.points.map((point) => point.y);
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }

    const startX = shape.startX ?? 0;
    const startY = shape.startY ?? 0;
    const endX = shape.endX ?? 0;
    const endY = shape.endY ?? 0;

    return {
      minX: Math.min(startX, endX),
      minY: Math.min(startY, endY),
      maxX: Math.max(startX, endX),
      maxY: Math.max(startY, endY),
    };
  }, []);

  const hitTestShape = useCallback(
    (shape: Shape, point: Point) => {
      if (shape.tool === "pencil") {
        const points = shape.points ?? [];
        if (points.length > 1) {
          return points.some((currentPoint, index) => {
            if (index === 0) return false;
            return (
              distanceToSegment(point, points[index - 1], currentPoint) <= 8
            );
          });
        }
      }

      const { minX, minY, maxX, maxY } = getShapeBounds(shape);

      if (shape.tool === "line" || shape.tool === "arrow") {
        const start = { x: shape.startX ?? 0, y: shape.startY ?? 0 };
        const end = { x: shape.endX ?? 0, y: shape.endY ?? 0 };
        return distanceToSegment(point, start, end) <= 8;
      }

      if (shape.tool === "circle") {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const radiusX = Math.max((maxX - minX) / 2, 1);
        const radiusY = Math.max((maxY - minY) / 2, 1);
        const normalizedX = (point.x - centerX) / radiusX;
        const normalizedY = (point.y - centerY) / radiusY;
        return normalizedX * normalizedX + normalizedY * normalizedY <= 1.2;
      }

      return (
        point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
      );
    },
    [getShapeBounds],
  );

  const findShapeAtPoint = useCallback(
    (point: Point) => {
      for (let i = shapes.length - 1; i >= 0; i -= 1) {
        if (hitTestShape(shapes[i], point)) {
          return shapes[i];
        }
      }
      return null;
    },
    [hitTestShape, shapes],
  );

  const getHandleAtPoint = useCallback(
    (shape: Shape, point: Point): ResizeHandle | null => {
      const { minX, minY, maxX, maxY } = getShapeBounds(shape);
      const handleSize = 8;
      const handles: Array<{ name: ResizeHandle; x: number; y: number }> = [
        { name: "nw", x: minX, y: minY },
        { name: "ne", x: maxX, y: minY },
        { name: "sw", x: minX, y: maxY },
        { name: "se", x: maxX, y: maxY },
      ];

      for (const handle of handles) {
        if (
          Math.abs(point.x - handle.x) <= handleSize &&
          Math.abs(point.y - handle.y) <= handleSize
        ) {
          return handle.name;
        }
      }

      return null;
    },
    [getShapeBounds],
  );

  const drawSelectionOutline = useCallback(
    (ctx: CanvasRenderingContext2D, shape: Shape) => {
      const { minX, minY, maxX, maxY } = getShapeBounds(shape);
      const width = Math.max(maxX - minX, 1);
      const height = Math.max(maxY - minY, 1);

      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX, minY, width, height);
      ctx.setLineDash([]);

      const handleSize = 6;
      const handles: Array<{ x: number; y: number }> = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: maxY },
      ];

      handles.forEach(({ x, y }) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(
          x - handleSize / 2,
          y - handleSize / 2,
          handleSize,
          handleSize,
        );
        ctx.strokeStyle = "#2563eb";
        ctx.strokeRect(
          x - handleSize / 2,
          y - handleSize / 2,
          handleSize,
          handleSize,
        );
      });

      ctx.restore();
    },
    [getShapeBounds],
  );

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    shapes.forEach((shape) => {
      if ((shape.tool === "pencil" || shape.tool === "eraser") && shape.points) {
        drawshape(shape.tool, ctx, 0, 0, 0, 0, shape.points);
      } else if (shape.tool === "text" && shape.text) {
        ctx.save();
        ctx.font = `${shape.fontSize ?? 24}px sans-serif`;
        ctx.fillStyle = "#111827";
        ctx.fillText(shape.text, shape.startX ?? 0, shape.startY ?? 0);
        ctx.restore();
      } else if (
        shape.startX !== undefined &&
        shape.startY !== undefined &&
        shape.endX !== undefined &&
        shape.endY !== undefined
      ) {
        drawshape(
          shape.tool,
          ctx,
          shape.startX,
          shape.startY,
          shape.endX,
          shape.endY,
          shape.points ?? [],
        );
      }
    });

    if (draftShape && draftShape.tool !== "pencil") {
      drawshape(
        draftShape.tool,
        ctx,
        draftShape.startX ?? 0,
        draftShape.startY ?? 0,
        draftShape.endX ?? 0,
        draftShape.endY ?? 0,
        draftShape.points ?? [],
      );
    }

    if (draftPoints.length > 0) {
      drawshape(selectedTool === "eraser" ? "eraser" : "pencil", ctx, 0, 0, 0, 0, draftPoints);
    }

    if (remoteDraftShape && remoteDraftShape.tool !== "pencil") {
      drawshape(
        remoteDraftShape.tool,
        ctx,
        remoteDraftShape.startX ?? 0,
        remoteDraftShape.startY ?? 0,
        remoteDraftShape.endX ?? 0,
        remoteDraftShape.endY ?? 0,
        remoteDraftShape.points ?? [],
      );
    }

    if (remoteDraftPoints.length > 0) {
      drawshape(remoteDraftShape?.tool === "eraser" ? "eraser" : "pencil", ctx, 0, 0, 0, 0, remoteDraftPoints);
    }

    if (selectedId) {
      const selectedShape = shapes.find((shape) => shape.id === selectedId);
      if (selectedShape) {
        drawSelectionOutline(ctx, selectedShape);
      }
    }

    ctx.restore();
  }, [
    draftPoints,
    draftShape,
    remoteDraftPoints,
    remoteDraftShape,
    drawSelectionOutline,
    offset,
    selectedId,
    shapes,
    zoom,
  ]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      drawScene();
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [drawScene]);

  // Camera starts only after WebSocket connection is established
  const startCamera = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const webcamStream = await getWebcamStream();
    localStreamRef.current = webcamStream;
    setStream(webcamStream);
    return webcamStream;
  }, []);

  const sendRoomMessage = useCallback((message: RoomSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendBoardMessage = useCallback(
    (message: BoardOutgoingMessage) => {
      const currentRoom = roomInfoRef.current;
      if (!currentRoom) return;

      sendRoomMessage({
        ...message,
        from: currentRoom.name,
        roomcode: currentRoom.roomcode,
      } as BoardSocketMessage);
    },
    [sendRoomMessage],
  );

  const getPeerConnection = useCallback(
    (peerName: string, localStream: MediaStream) => {
      const existingPeer = peersRef.current.get(peerName);
      if (existingPeer) {
        return existingPeer;
      }

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      peer.addEventListener("track", (event) => {
        const [incomingStream] = event.streams;
        if (incomingStream) {
          setRemoteStream(incomingStream);
          setRemoteName(peerName);
        }
      });

      peer.addEventListener("icecandidate", (event) => {
        const currentRoom = roomInfoRef.current;
        if (!event.candidate || !currentRoom) return;

        sendRoomMessage({
          type: "webrtc_ice",
          from: currentRoom.name,
          to: peerName,
          roomcode: currentRoom.roomcode,
          candidate: event.candidate.toJSON(),
        });
      });

      peer.addEventListener("connectionstatechange", () => {
        if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
          peersRef.current.delete(peerName);
          setRemoteStream((currentStream) => {
            if (remoteName === peerName) {
              setRemoteName("");
              return null;
            }
            return currentStream;
          });
        }
      });

      peersRef.current.set(peerName, peer);
      return peer;
    },
    [remoteName, sendRoomMessage],
  );

  const callPeer = useCallback(
    async (peerName: string) => {
      const currentRoom = roomInfoRef.current;
      if (!currentRoom || peerName === currentRoom.name) return;

      const localStream = await startCamera();
      const peer = getPeerConnection(peerName, localStream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      sendRoomMessage({
        type: "webrtc_offer",
        from: currentRoom.name,
        to: peerName,
        roomcode: currentRoom.roomcode,
        offer,
      });
    },
    [getPeerConnection, sendRoomMessage, startCamera],
  );

  const handleRoomConnected = useCallback(
    (ws: WebSocket, name: string, roomcode: string) => {
      const nextRoomInfo = { name, roomcode };
      wsRef.current = ws;
      roomInfoRef.current = nextRoomInfo;
      setRoomInfo(nextRoomInfo);
      setPresenceUsers([{ name, status: "online" }]);
      startCamera().catch((error) => {
        console.error("Error getting webcam stream:", error);
      });
    },
    [startCamera],
  );

  const handlePresence = useCallback((users: PresenceUser[]) => {
    setPresenceUsers((currentUsers) => {
      const onlineUsers = new Map(users.map((user) => [user.name, user]));
      const knownNames = new Set([
        ...currentUsers.map((user) => user.name),
        ...users.map((user) => user.name),
      ]);

      return Array.from(knownNames).map((name) => {
        const onlineUser = onlineUsers.get(name);
        return onlineUser ?? { name, status: "offline" };
      });
    });
  }, []);

  const handleRoomMessage = useCallback(
    async (event: RoomSocketMessage) => {
      const currentRoom = roomInfoRef.current;

      if (event.type === "presence") {
        handlePresence(event.users);
        return;
      }

      if (!currentRoom) return;

      if ("roomcode" in event && event.roomcode !== currentRoom.roomcode) return;

      if (event.type === "board_lock" && event.from !== currentRoom.name) {
        activeDrawerRef.current = event.from;
        setActiveDrawer(event.from);
        return;
      }

      if (event.type === "board_unlock" && event.from !== currentRoom.name) {
        activeDrawerRef.current = "";
        setActiveDrawer("");
        setRemoteDraftShape(null);
        setRemoteDraftPoints([]);
        setRemoteCursor(null);
        return;
      }

      if (event.type === "board_draft" && event.from !== currentRoom.name) {
        activeDrawerRef.current = event.from;
        setActiveDrawer(event.from);
        setRemoteDraftShape(event.shape);
        setRemoteDraftPoints(event.points);
        return;
      }

      if (event.type === "board_cursor" && event.from !== currentRoom.name) {
        activeDrawerRef.current = event.from;
        setActiveDrawer(event.from);
        setRemoteCursor({ name: event.from, point: event.point });
        return;
      }

      if (event.type === "board_shape_add" && event.from !== currentRoom.name) {
        setShapes((currentShapes) => {
          if (currentShapes.some((shape) => shape.id === event.shape.id)) {
            return currentShapes;
          }
          return [...currentShapes, event.shape];
        });
        setRemoteDraftShape(null);
        setRemoteDraftPoints([]);
        setRemoteCursor(null);
        activeDrawerRef.current = "";
        setActiveDrawer("");
        return;
      }

      if (event.type === "user_joined" && event.name !== currentRoom.name) {
        await callPeer(event.name);
        return;
      }

      if (event.type === "user_left") {
        const peer = peersRef.current.get(event.name);
        peer?.close();
        peersRef.current.delete(event.name);
        if (remoteName === event.name) {
          setRemoteName("");
          setRemoteStream(null);
        }
        if (activeDrawerRef.current === event.name) {
          activeDrawerRef.current = "";
          setActiveDrawer("");
          setRemoteDraftShape(null);
          setRemoteDraftPoints([]);
          setRemoteCursor(null);
        }
        return;
      }

      if (!("to" in event) || event.to !== currentRoom.name) return;

      if (event.type === "webrtc_offer") {
        const localStream = await startCamera();
        const peer = getPeerConnection(event.from, localStream);
        await peer.setRemoteDescription(new RTCSessionDescription(event.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        sendRoomMessage({
          type: "webrtc_answer",
          from: currentRoom.name,
          to: event.from,
          roomcode: currentRoom.roomcode,
          answer,
        });
        return;
      }

      if (event.type === "webrtc_answer") {
        const peer = peersRef.current.get(event.from);
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(event.answer));
        }
        return;
      }

      if (event.type === "webrtc_ice") {
        const peer = peersRef.current.get(event.from);
        if (peer) {
          await peer.addIceCandidate(new RTCIceCandidate(event.candidate));
        }
      }
    },
    [callPeer, getPeerConnection, handlePresence, remoteName, sendRoomMessage, startCamera],
  );

  useEffect(() => {
    if (localVideoRef.current && stream && localVideoRef.current.srcObject !== stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (
      remoteVideoRef.current &&
      remoteStream &&
      remoteVideoRef.current.srcObject !== remoteStream
    ) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const zoomAtPoint = useCallback(
    (factor: number, x: number, y: number) => {
      const nextZoom = getZoomStep(zoom, factor);
      const worldX = (x - offset.x) / zoom;
      const worldY = (y - offset.y) / zoom;

      setZoom(nextZoom);
      setOffset({
        x: x - worldX * nextZoom,
        y: y - worldY * nextZoom,
      });
    },
    [offset, zoom],
  );

  const updateZoom = useCallback(
    (factor: number, x?: number, y?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        setZoom((previousZoom) => getZoomStep(previousZoom, factor));
        return;
      }

      const targetX = x ?? canvas.width / 2;
      const targetY = y ?? canvas.height / 2;
      zoomAtPoint(factor, targetX, targetY);
    },
    [zoomAtPoint],
  );

  const canDrawOnBoard = () => {
    const currentRoom = roomInfoRef.current;
    return !activeDrawerRef.current || activeDrawerRef.current === currentRoom?.name;
  };

  const lockBoardForMe = () => {
    const currentRoom = roomInfoRef.current;
    if (!currentRoom) return;

    activeDrawerRef.current = currentRoom.name;
    setActiveDrawer(currentRoom.name);
    sendBoardMessage({ type: "board_lock" });
  };

  const unlockBoardForMe = () => {
    const currentRoom = roomInfoRef.current;
    if (!currentRoom) return;

    activeDrawerRef.current = "";
    setActiveDrawer("");
    sendBoardMessage({ type: "board_unlock" });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!canDrawOnBoard()) {
      return;
    }

    const point = getCanvasPoint(event);

    if (selectedTool === "pan") {
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      return;
    }

    lockBoardForMe();
    sendBoardMessage({ type: "board_cursor", point });

    if (selectedTool === "select") {
      const hitShape = findShapeAtPoint(point);
      if (!hitShape) {
        setSelectedId(null);
        unlockBoardForMe();
        return;
      }

      const handle = getHandleAtPoint(hitShape, point);
      const baseShape = { ...hitShape };
      interactionRef.current = {
        type: handle ? "resize" : "move",
        id: hitShape.id,
        startX: point.x,
        startY: point.y,
        shape: baseShape,
        handle: handle ?? undefined,
      };
      setSelectedId(hitShape.id);
      return;
    }

    if (selectedTool === "pencil" || selectedTool === "eraser") {
      setDraftPoints([point]);
      if (selectedTool === "eraser") {
        sendBoardMessage({
          type: "board_draft",
          shape: { id: makeShapeId(), tool: "eraser", points: [point] },
          points: [point],
        });
      }
      return;
    }

    if (selectedTool === "text") {
      const textValue = window.prompt("Enter text", "");
      if (!textValue || !textValue.trim()) {
        return;
      }

      const nextText = textValue.trim();
      const nextShape = {
        id: makeShapeId(),
        tool: "text",
        startX: point.x,
        startY: point.y,
        text: nextText,
        fontSize: 24,
      };
      setShapes((current) => [...current, nextShape]);
      sendBoardMessage({ type: "board_shape_add", shape: nextShape });
      unlockBoardForMe();
      return;
    }

    if (selectedId) {
      setSelectedId(null);
    }

    const nextDraftShape = {
      id: makeShapeId(),
      tool: selectedTool,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    };
    setDraftShape(nextDraftShape);
    sendBoardMessage({ type: "board_draft", shape: nextDraftShape, points: [] });
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === "pan" && panStartRef.current) {
      const delta = panCanvas(
        panStartRef.current.x,
        panStartRef.current.y,
        event.clientX,
        event.clientY,
      );

      setOffset({
        x: panStartRef.current.offsetX + delta.dx,
        y: panStartRef.current.offsetY + delta.dy,
      });
      return;
    }

    const point = getCanvasPoint(event);
    if (activeDrawerRef.current === roomInfoRef.current?.name) {
      sendBoardMessage({ type: "board_cursor", point });
    }

    if (selectedTool === "select" && interactionRef.current) {
      const deltaX = point.x - interactionRef.current.startX;
      const deltaY = point.y - interactionRef.current.startY;

      setShapes((currentShapes) =>
        currentShapes.map((shape) => {
          if (shape.id !== interactionRef.current?.id) {
            return shape;
          }

          if (interactionRef.current?.type === "move") {
            return moveShape(shape, deltaX, deltaY);
          }

          if (interactionRef.current?.handle) {
            return resizeShape(
              shape,
              interactionRef.current.handle,
              point,
              interactionRef.current.shape,
            );
          }

          return shape;
        }),
      );

      if (interactionRef.current?.type === "move") {
        interactionRef.current.startX = point.x;
        interactionRef.current.startY = point.y;
      }

      return;
    }

    if (selectedTool === "pencil" || selectedTool === "eraser") {
      if (draftPoints.length === 0) return;
      const nextPoints = [...draftPoints, point];
      setDraftPoints(nextPoints);
      sendBoardMessage({
        type: "board_draft",
        shape:
          selectedTool === "eraser"
            ? { id: makeShapeId(), tool: "eraser", points: nextPoints }
            : null,
        points: nextPoints,
      });
      return;
    }

    if (!draftShape) return;

    const nextDraftShape = { ...draftShape, endX: point.x, endY: point.y };
    setDraftShape(nextDraftShape);
    sendBoardMessage({ type: "board_draft", shape: nextDraftShape, points: [] });
  };

  const remoteCursorPosition = remoteCursor
    ? getCanvasScreenPoint(remoteCursor.point)
    : null;

  const handleMouseUp = () => {
    if (selectedTool === "pan") {
      panStartRef.current = null;
      return;
    }

    if (selectedTool === "select") {
      interactionRef.current = null;
      unlockBoardForMe();
      return;
    }

    if (selectedTool === "pencil" || selectedTool === "eraser") {
      if (draftPoints.length > 0) {
        const nextShape = { id: makeShapeId(), tool: selectedTool, points: draftPoints };
        setShapes((current) => [...current, nextShape]);
        sendBoardMessage({ type: "board_shape_add", shape: nextShape });
      }
      setDraftPoints([]);
      unlockBoardForMe();
      return;
    }

    if (!draftShape) {
      unlockBoardForMe();
      return;
    }

    setShapes((current) => [...current, draftShape]);
    sendBoardMessage({ type: "board_shape_add", shape: draftShape });
    setDraftShape(null);
    unlockBoardForMe();
  };

  return (
    <>
      <div className="app-shell">
        <div className="topbar">
          <div id="sketch" className="tool-strip">
            <button type="button" onClick={() => setSelectedTool("select")}>
              Select
            </button>
            <button type="button" onClick={() => setSelectedTool("text")}>
              T
            </button>
            <button type="button" onClick={() => setSelectedTool("pencil")}>
              <BsFillPencilFill style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("line")}>
              <MdOutlineHorizontalRule style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("arrow")}>
              <FaArrowRightLong style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("circle")}>
              <RiCircleLine style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("rectangle")}>
              <RiRectangleLine style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("eraser")}>
              <RiEraserLine style={{ color: "rgb(16, 16, 16)" }} />
            </button>
            <button type="button" onClick={() => setSelectedTool("pan")}>
              <IoHandLeftOutline style={{ color: "rgb(16, 16, 16)" }} />
            </button>
          </div>

          <div className="zoom-controls">
            <button type="button" onClick={() => updateZoom(1.2)}>
              Zoom in
            </button>
            <button type="button" onClick={() => updateZoom(1 / 1.2)}>
              Zoom out
            </button>
            <span>Zoom: {zoom.toFixed(2)}x</span>
          </div>
          <div>
            <button
              id="open-join-room-btn"
              type="button"
              onClick={() => setShowJoinRoom(true)}
              style={{
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
      <div className="workspace-layout">
        <div className="video-call-slot">
          <div className="video-grid">
          <div className="video-wrap">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
            />
            <div className="video-label">{roomInfo?.name ?? "You"}</div>
          </div>
          <div className="video-wrap">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline />
            ) : (
              <div className="video-placeholder">Waiting for user 2</div>
            )}
            <div className="video-label">{remoteName || "cam 2"}</div>
          </div>
          </div>
          <div className="presence-panel">
            <div className="presence-header">
              <span>Room</span>
              <strong>{roomInfo?.roomcode ?? "Not joined"}</strong>
            </div>
            <div className="presence-list">
              {presenceUsers.length > 0 ? (
                presenceUsers.map((user) => (
                  <div className="presence-row" key={user.name}>
                    <span className={`presence-dot presence-dot--${user.status}`} />
                    <span className="presence-name">{user.name}</span>
                    <span className="presence-status">{user.status}</span>
                  </div>
                ))
              ) : (
                <div className="presence-empty">No one online yet</div>
              )}
            </div>
          </div>
        </div>

        <div className="canvas-panel">
          {activeDrawer && activeDrawer !== roomInfo?.name && (
            <div className="board-lock-banner">{activeDrawer} is drawing</div>
          )}
          <div className="canvas-frame">
            <div ref={canvasContainerRef} className="canvas-surface">
              {remoteCursor && remoteCursorPosition && (
                <div
                  className="remote-cursor"
                  style={{
                    transform: `translate(${remoteCursorPosition.x}px, ${remoteCursorPosition.y}px)`,
                  }}
                >
                  <span className="remote-cursor__pointer" />
                  <span className="remote-cursor__name">{remoteCursor.name}</span>
                </div>
              )}
              <canvas
                id="myCanvas"
                ref={canvasRef}
                className={
                  !canDrawOnBoard()
                    ? "cursor-locked"
                    : selectedTool === "pan"
                    ? "cursor-grab"
                    : "cursor-crosshair"
                }
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>
        </div>
      </div>  
    {showJoinRoom && (
      <JoinRoom
        onConnected={handleRoomConnected}
        onPresence={handlePresence}
        onMessage={(raw) => {
          try {
            handleRoomMessage(JSON.parse(raw) as RoomSocketMessage);
          } catch {
            console.warn("[WS] Ignored invalid message", raw);
          }
        }}
        onClose={() => setShowJoinRoom(false)}
      />
    )}
    </>
  );
}

export default App;
