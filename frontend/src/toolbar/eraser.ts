export default function drawEraser(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  points: Array<{ x: number; y: number }> = [],
) {
  const eraserPoints = points.length > 0 ? points : [{ x: startX, y: startY }];

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = 24;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(eraserPoints[0].x, eraserPoints[0].y);

  for (let index = 1; index < eraserPoints.length; index += 1) {
    ctx.lineTo(eraserPoints[index].x, eraserPoints[index].y);
  }

  if (eraserPoints.length === 1) {
    ctx.lineTo(eraserPoints[0].x + 0.1, eraserPoints[0].y + 0.1);
  }

  ctx.stroke();

  ctx.restore();
}
