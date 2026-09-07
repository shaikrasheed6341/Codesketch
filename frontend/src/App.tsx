import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import "./App.css";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

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
      if (shape.tool === "pencil" && shape.points) {
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
      drawshape("pencil", ctx, 0, 0, 0, 0, draftPoints);
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

  useEffect(() => {
    let active = true;

    const startCamera = async () => {
      try {
        const webcamStream = await getWebcamStream();

        if (!active) {
          webcamStream.getTracks().forEach((track) => track.stop());
          return;
        }

        setStream(webcamStream);
      } catch (error) {
        console.error("Error getting webcam stream:", error);
      }
    };

    startCamera();

    return () => {
      active = false;
      setStream((currentStream) => {
        if (currentStream) {
          currentStream.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
    };
  }, []);

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

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
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

    if (selectedTool === "select") {
      const hitShape = findShapeAtPoint(point);
      if (!hitShape) {
        setSelectedId(null);
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

    if (selectedTool === "pencil") {
      setDraftPoints([point]);
      return;
    }

    if (selectedTool === "text") {
      const textValue = window.prompt("Enter text", "");
      if (!textValue || !textValue.trim()) {
        return;
      }

      const nextText = textValue.trim();
      setShapes((current) => [
        ...current,
        {
          id: makeShapeId(),
          tool: "text",
          startX: point.x,
          startY: point.y,
          text: nextText,
          fontSize: 24,
        },
      ]);
      return;
    }

    if (selectedId) {
      setSelectedId(null);
    }

    setDraftShape({
      id: makeShapeId(),
      tool: selectedTool,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    });
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

    if (selectedTool === "pencil") {
      if (draftPoints.length === 0) return;
      setDraftPoints((current) => [...current, point]);
      return;
    }

    if (!draftShape) return;

    setDraftShape((current) =>
      current ? { ...current, endX: point.x, endY: point.y } : current,
    );
  };

  const handleMouseUp = () => {
    if (selectedTool === "pan") {
      panStartRef.current = null;
      return;
    }

    if (selectedTool === "select") {
      interactionRef.current = null;
      return;
    }

    if (selectedTool === "pencil") {
      if (draftPoints.length > 0) {
        setShapes((current) => [
          ...current,
          { id: makeShapeId(), tool: "pencil", points: draftPoints },
        ]);
      }
      setDraftPoints([]);
      return;
    }

    if (!draftShape) return;

    setShapes((current) => [...current, draftShape]);
    setDraftShape(null);
  };

  return (
    <div className="app-shell">
      <div className="flex">
        <div className="flex justify-between gap-40 items-center mt-2">
          <div id="sketch" className="ml-95 ">
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

          <div>
            <button type="button" onClick={() => updateZoom(1.2)}>
              Zoom in
            </button>
            <button type="button" onClick={() => updateZoom(1 / 1.2)}>
              Zoom out
            </button>
            <span>Zoom: {zoom.toFixed(2)}x</span>
          </div>
        </div>
      </div>

      <div className="workspace-layout">
        <div className="video-call-slot" aria-hidden="true">
          <div className="video-wrap">
            <video
              ref={(video) => {
                if (video && stream && video.srcObject !== stream) {
                  video.srcObject = stream;
                }
              }}
              autoPlay
              playsInline
              muted
            />
          </div>
          <div className="video-label">cam 2</div>
        </div>

        <div className="canvas-panel">
          <div className="canvas-frame">
            <div ref={canvasContainerRef} className="canvas-surface">
              <canvas
                id="myCanvas"
                ref={canvasRef}
                className={
                  selectedTool === "pan" ? "cursor-grab" : "cursor-crosshair"
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
    </div>
  );
}

export default App;
