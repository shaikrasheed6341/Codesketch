import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import "./App.css";
import { getZoomStep } from "./zoomMath";
import drawshape from "./toolbar/drawshape";

type Point = {
  x: number;
  y: number;
};

type Shape = {
  tool: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  points?: Point[];
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedTool, setSelectedTool] = useState("draw");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  const getCanvasPoint = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / rect.width;
    const scaleY = event.currentTarget.height / rect.height;

    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    // Convert canvas pixel coordinates into world coordinates (inverse of translate/scale)
    const worldX = (canvasX - offset.x) / zoom;
    const worldY = (canvasY - offset.y) / zoom;

    return {
      x: worldX,
      y: worldY,
    };
  }, [offset, zoom]);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
   ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);
    shapes.forEach((shape) => {
      if (shape.tool === "pencil" && shape.points) {
        drawshape(shape.tool, ctx, 0, 0, 0, 0, shape.points);
      } else if (shape.startX !== undefined && shape.startY !== undefined && shape.endX !== undefined && shape.endY !== undefined) {
        drawshape(shape.tool, ctx, shape.startX, shape.startY, shape.endX, shape.endY, shape.points ?? []);
      }
    });

    if (draftShape && draftShape.tool !== "pencil") {
      drawshape(draftShape.tool, ctx, draftShape.startX ?? 0, draftShape.startY ?? 0, draftShape.endX ?? 0, draftShape.endY ?? 0, draftShape.points ?? []);
    }

    if (draftPoints.length > 0) {
      drawshape("pencil", ctx, 0, 0, 0, 0, draftPoints);
    }
    ctx.restore();
  }, [draftPoints, draftShape, shapes]);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  const zoomAtPoint = useCallback((factor: number, x: number, y: number) => {
    const nextZoom = getZoomStep(zoom, factor);
    const worldX = (x - offset.x) / zoom;
    const worldY = (y - offset.y) / zoom;

    setZoom(nextZoom);
    setOffset({
      x: x - worldX * nextZoom,
      y: y - worldY * nextZoom,
    });
  }, [offset, zoom]);

  const updateZoom = useCallback((factor: number, x?: number, y?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setZoom((previousZoom) => getZoomStep(previousZoom, factor));
      return;
    }

    const targetX = x ?? canvas.width / 2;
    const targetY = y ?? canvas.height / 2;
    zoomAtPoint(factor, targetX, targetY);
  }, [zoomAtPoint]);

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const direction = event.deltaY < 0 ? 1.12 : 1 / 1.12;

    updateZoom(direction, mouseX, mouseY);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);

    if (selectedTool === "pencil") {
      setDraftPoints([point]);
      return;
    }

    setDraftShape({
      tool: selectedTool,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    });
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);

    if (selectedTool === "pencil") {
      if (draftPoints.length === 0) return;
      setDraftPoints((current) => [...current, point]);
      return;
    }

    if (!draftShape) return;

    setDraftShape((current) =>
      current
        ? { ...current, endX: point.x, endY: point.y }
        : current,
    );
  };

  const handleMouseUp = () => {
    if (selectedTool === "pencil") {
      if (draftPoints.length > 0) {
        setShapes((current) => [...current, { tool: "pencil", points: draftPoints }]);
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
      <h2>Canvas</h2>

      <div className="controls">
        <button type="button" onClick={() => updateZoom(1.2)}>
          Zoom in
        </button>
        <button type="button" onClick={() => updateZoom(1 / 1.2)}>
          Zoom out
        </button>
        <span>Zoom: {zoom.toFixed(2)}x</span>
      </div>

      <div id="sketch" className="fixed left-4 top-4 z-10 flex flex-col gap-2 bg-white p-2">
        
        <button type="button" onClick={() => setSelectedTool("pencil")}>
          ✎
        </button>
        <button type="button" onClick={() => setSelectedTool("line")}>
          ─
        </button>
        <button type="button" onClick={() => setSelectedTool("arrow")}>
          ➜
        </button>
        <button type="button" onClick={() => setSelectedTool("circle")}>
          ○
        </button>
        <button type="button" onClick={() => setSelectedTool("rectangle")}>
          ▭
        </button>

      </div>

      <canvas
        id="myCanvas"
        ref={canvasRef}
        width="1000"
        height="880"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}

export default App;