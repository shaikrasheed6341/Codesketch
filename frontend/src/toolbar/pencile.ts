type Point = { x: number; y: number };

export default function drawPencilRenderer(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "blue";
  ctx.stroke();
  ctx.restore();
}

