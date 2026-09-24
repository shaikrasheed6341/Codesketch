import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import "./App.css";
import JoinRoom from "./components/JoinRoom";
import LandingPage from "./components/LandingPage";
import { getZoomStep } from "./zoomMath";
import drawshape from "./toolbar/drawshape";
import { panCanvas } from "./toolbar/pan";
import { BsFillPencilFill } from "react-icons/bs";
import { MdOutlineHorizontalRule } from "react-icons/md";
import { FaArrowRightLong } from "react-icons/fa6";
import { RiCircleLine, RiEraserLine, RiRectangleLine } from "react-icons/ri";
import { IoHandLeftOutline } from "react-icons/io5";
import { getWebcamStream } from "./webcam";
import { BACKEND_URL } from "./utils/apiurl";
import { distanceToSegment, moveShape, resizeShape } from "./board/geometry";
import type {
  AuthUser,
  Interaction,
  Point,
  PresenceUser,
  ResizeHandle,
  Shape,
  TextEditor,
} from "./board/types";

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
      canvasId: number;
    }
  | {
      type: "board_state";
      roomcode: string;
      canvasId: number;
      shapes: Shape[];
    }
  | {
      type: "board_sync";
      from: string;
      roomcode: string;
      canvasId: number;
      shapes: Shape[];
    };

type BoardSocketMessage = Extract<
  RoomSocketMessage,
  {
    type:
      | "board_lock"
      | "board_unlock"
      | "board_draft"
      | "board_cursor"
      | "board_shape_add"
      | "board_sync";
  }
>;
type BoardOutgoingMessage = BoardSocketMessage extends infer Message
  ? Message extends BoardSocketMessage
    ? Omit<Message, "from" | "roomcode">
    : never
  : never;

const makeShapeId = () =>
  `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });
  const [selectedTool, setSelectedTool] = useState("pencil");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState(0);
  const [canvasIds, setCanvasIds] = useState<number[]>([0]);
  const canvasStatesRef = useRef<Map<number, Shape[]>>(new Map([[0, []]]));
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [remoteDraftShape, setRemoteDraftShape] = useState<Shape | null>(null);
  const [remoteDraftPoints, setRemoteDraftPoints] = useState<Point[]>([]);
  const [remoteCursor, setRemoteCursor] = useState<{ name: string; point: Point } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditor | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteName, setRemoteName] = useState("");
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{ name: string; roomcode: string } | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [activeDrawer, setActiveDrawer] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const roomInfoRef = useRef<{ name: string; roomcode: string } | null>(null);
  const activeDrawerRef = useRef("");

  const updateShapes = useCallback((updater: Shape[] | ((current: Shape[]) => Shape[])) => {
    setShapes((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      canvasStatesRef.current.set(activeCanvasId, next);
      return next;
    });
  }, [activeCanvasId]);

  const switchCanvas = useCallback((canvasId: number) => {
    canvasStatesRef.current.set(activeCanvasId, shapes);
    setActiveCanvasId(canvasId);
    setShapes(canvasStatesRef.current.get(canvasId) ?? []);
    setSelectedId(null);
    setDraftShape(null);
    setDraftPoints([]);
  }, [activeCanvasId, shapes]);

  const createCanvas = useCallback(() => {
    const nextCanvasId = canvasIds.length;
    canvasStatesRef.current.set(nextCanvasId, []);
    setCanvasIds((current) => [...current, nextCanvasId]);
    switchCanvas(nextCanvasId);
  }, [canvasIds.length, switchCanvas]);

  useEffect(() => {
    const toolShortcuts: Record<string, string> = {
      "1": "select",
      "2": "text",
      "3": "pencil",
      "4": "line",
      "5": "arrow",
      "6": "circle",
      "7": "rectangle",
      "8": "eraser",
      "9": "pan",
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const tool = toolShortcuts[event.key];
      if (tool) {
        event.preventDefault();
        setSelectedTool(tool);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/user/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && data.user) setAuthUser(data.user);
      })
      .catch(() => setAuthUser(null));
  }, []);

  async function updateProfile(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return "Username cannot be empty";

    const response = await fetch(`${BACKEND_URL}/user/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: trimmedName }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) return data.message || "Unable to update profile";
    setAuthUser(data.user);
    return null;
  }

  async function signout() {
    await fetch(`${BACKEND_URL}/user/signout`, { method: "POST", credentials: "include" });
    setAuthUser(null);
  }

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
      if (canvasSize.width === 0 || canvasSize.height === 0) return null;

      if (canvasDisplaySize.width === 0 || canvasDisplaySize.height === 0) return null;

      const scaleX = canvasSize.width / canvasDisplaySize.width;
      const scaleY = canvasSize.height / canvasDisplaySize.height;

      return {
        x: (point.x * zoom + offset.x) / scaleX,
        y: (point.y * zoom + offset.y) / scaleY,
      };
    },
    [canvasDisplaySize, canvasSize, offset, zoom],
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

    if (shape.tool === "text") {
      const fontSize = shape.fontSize ?? 24;
      const textWidth = Math.max((shape.text?.length ?? 1) * fontSize * 0.62, 24);
      const baseline = shape.startY ?? 0;
      return {
        minX: shape.startX ?? 0,
        minY: baseline - fontSize,
        maxX: (shape.startX ?? 0) + textWidth,
        maxY: baseline + 6,
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
      const handleSize = 12;
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

      const handleSize = 10;
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
        ctx.fillStyle = "#ffffff";
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
    selectedTool,
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
      setCanvasDisplaySize({ width: rect.width, height: rect.height });
      setCanvasSize({ width, height });

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
      setShowJoinRoom(false);
      setPresenceUsers([{ name, status: "online" }]);
      for (const canvasId of Array.from({ length: 10 }, (_, id) => id)) {
        sendRoomMessage({
          type: "board_sync",
          from: name,
          roomcode,
          canvasId,
          shapes: canvasStatesRef.current.get(canvasId) ?? (canvasId === activeCanvasId ? shapes : []),
        });
      }
      startCamera().catch((error) => {
        console.error("Error getting webcam stream:", error);
      });
    },
    [activeCanvasId, sendRoomMessage, shapes, startCamera],
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

      if (event.type === "board_state") {
        canvasStatesRef.current.set(event.canvasId, event.shapes);
        if (event.canvasId === activeCanvasId) setShapes(event.shapes);
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
        if (event.canvasId !== activeCanvasId) {
          canvasStatesRef.current.set(event.canvasId, [
            ...(canvasStatesRef.current.get(event.canvasId) ?? []),
            event.shape,
          ]);
          return;
        }
        updateShapes((currentShapes) => {
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
    [
      activeCanvasId,
      callPeer,
      getPeerConnection,
      handlePresence,
      remoteName,
      sendRoomMessage,
      startCamera,
      updateShapes,
    ],
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

  const placeText = () => {
    if (!textEditor || !textEditor.value.trim()) {
      setTextEditor(null);
      unlockBoardForMe();
      return;
    }

    const nextShape = {
      id: makeShapeId(),
      tool: "text",
      startX: textEditor.point.x,
      startY: textEditor.point.y,
      text: textEditor.value.trim(),
      fontSize: 24,
    };
    updateShapes((current) => [...current, nextShape]);
    sendBoardMessage({ type: "board_shape_add", shape: nextShape, canvasId: activeCanvasId });
    setSelectedId(nextShape.id);
    setTextEditor(null);
    unlockBoardForMe();
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
      const selectedShape = selectedId
        ? shapes.find((shape) => shape.id === selectedId) ?? null
        : null;
      const selectedHandle = selectedShape
        ? getHandleAtPoint(selectedShape, point)
        : null;
      const hitShape = selectedHandle ? selectedShape : findShapeAtPoint(point);
      if (!hitShape) {
        setSelectedId(null);
        unlockBoardForMe();
        return;
      }

      const handle = selectedHandle ?? getHandleAtPoint(hitShape, point);
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
      const screenPoint = getCanvasScreenPoint(point);
      if (!screenPoint) return;

      setTextEditor({ point, screenPoint, value: "" });
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

      updateShapes((currentShapes) =>
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

  const isBoardLocked = Boolean(activeDrawer && activeDrawer !== roomInfo?.name);

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
        updateShapes((current) => [...current, nextShape]);
        sendBoardMessage({ type: "board_shape_add", shape: nextShape, canvasId: activeCanvasId });
      }
      setDraftPoints([]);
      unlockBoardForMe();
      return;
    }

    if (!draftShape) {
      unlockBoardForMe();
      return;
    }

    updateShapes((current) => [...current, draftShape]);
    sendBoardMessage({ type: "board_shape_add", shape: draftShape, canvasId: activeCanvasId });
    setDraftShape(null);
    unlockBoardForMe();
  };

  const renderJoinRoom = () => (
    <JoinRoom
      fullPage
      onAuthenticated={setAuthUser}
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
  );

  if (!roomInfo && !authUser) {
    if (showJoinRoom) {
      return renderJoinRoom();
    }

    return (
      <>
        <LandingPage
          user={authUser}
          onStart={() => setShowJoinRoom(true)}
          onProfileUpdate={updateProfile}
          onSignout={signout}
        />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <div className="topbar">
          <div id="sketch" className="tool-strip">
            <button className={selectedTool === "select" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Select and move objects" aria-label="Select and move objects" onClick={() => setSelectedTool("select")}>
              <span className="tool-shortcut">1</span> Select
            </button>
            <button className={selectedTool === "text" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Add text" aria-label="Add text" onClick={() => setSelectedTool("text")}>
              <span className="tool-shortcut">2</span> T
            </button>
            <button className={selectedTool === "pencil" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Draw with pencil" aria-label="Draw with pencil" onClick={() => setSelectedTool("pencil")}>
              <span className="tool-shortcut">3</span><BsFillPencilFill />
            </button>
            <button className={selectedTool === "line" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Draw a line" aria-label="Draw a line" onClick={() => setSelectedTool("line")}>
              <span className="tool-shortcut">4</span><MdOutlineHorizontalRule />
            </button>
            <button className={selectedTool === "arrow" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Draw an arrow" aria-label="Draw an arrow" onClick={() => setSelectedTool("arrow")}>
              <span className="tool-shortcut">5</span><FaArrowRightLong />
            </button>
            <button className={selectedTool === "circle" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Draw a circle" aria-label="Draw a circle" onClick={() => setSelectedTool("circle")}>
              <span className="tool-shortcut">6</span><RiCircleLine />
            </button>
            <button className={selectedTool === "rectangle" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Draw a rectangle" aria-label="Draw a rectangle" onClick={() => setSelectedTool("rectangle")}>
              <span className="tool-shortcut">7</span><RiRectangleLine />
            </button>
            <button className={selectedTool === "eraser" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Erase objects" aria-label="Erase objects" onClick={() => setSelectedTool("eraser")}>
              <span className="tool-shortcut">8</span><RiEraserLine />
            </button>
            <button className={selectedTool === "pan" ? "tool-button tool-button--active" : "tool-button"} type="button" title="Pan the canvas" aria-label="Pan the canvas" onClick={() => setSelectedTool("pan")}>
              <span className="tool-shortcut">9</span><IoHandLeftOutline />
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
          <div className="canvas-tabs" aria-label="Shared canvases">
            {canvasIds.map((canvasId) => (
              <button
                key={canvasId}
                type="button"
                className={activeCanvasId === canvasId ? "canvas-tab canvas-tab--active" : "canvas-tab"}
                onClick={() => switchCanvas(canvasId)}
                aria-label={`Open canvas ${canvasId + 1}`}
              >
                {canvasId + 1}
              </button>
            ))}
            <button className="canvas-tab canvas-tab--new" type="button" onClick={createCanvas} aria-label="Create a new canvas" title="Create a new canvas">
              +
            </button>
          </div>
          <div>
            <button
              id="open-join-room-btn"
              type="button"
              onClick={() => setShowJoinRoom(true)}
              className="join-room-button"
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
              {textEditor && (
                <form
                  className="canvas-text-editor"
                  style={{
                    left: textEditor.screenPoint.x,
                    top: textEditor.screenPoint.y - 30,
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    placeText();
                  }}
                >
                  <input
                    autoFocus
                    value={textEditor.value}
                    placeholder="Type text..."
                    onChange={(event) => setTextEditor((current) => current ? { ...current, value: event.target.value } : current)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setTextEditor(null);
                      }
                    }}
                    aria-label="Text to place on canvas"
                  />
                  <button type="submit">Add</button>
                </form>
              )}
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
                  isBoardLocked
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
    {showJoinRoom && renderJoinRoom()}
    </>
  );
}

export default App;
