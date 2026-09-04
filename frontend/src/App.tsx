import "./App.css";
import { useEffect } from "react";
import type { arrowtype } from "./types/databasetype";

function drawArrowLine({
  ctx,
  fromX,
  fromY,
  toX,
  toY,
  arrowWidth = 2,
  color = "black",
}: arrowtype) {
  const headLength = 15;

  // Calculate angle automatically
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = arrowWidth;
  ctx.lineCap = "round";

  // ----------------
  // Draw line
  // ----------------
  ctx.beginPath();

  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);

  ctx.stroke();

  // ----------------
  // Draw arrow head
  // ----------------
  ctx.beginPath();

  ctx.moveTo(toX, toY);

  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );

  ctx.moveTo(toX, toY);

  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );

  ctx.stroke();

  ctx.restore();
}

function App() {
  useEffect(() => {
    const canvas = document.getElementById("draw") as HTMLCanvasElement;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    drawArrowLine({
      ctx,

      fromX: 50,
      fromY: 50,

      toX: 400,
      toY: 200,

      arrowWidth: 4,
      color: "blue",
    });
  }, []);

  return (
    <>
      <h1>Canvas Diagram</h1>

      <canvas
        id="draw"
        width={1000}
        height={600}
        className="bg-zinc-100"
      />
    </>
  );
}

export default App;