export default function drawEraser(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  // endX: number,
  // endY: number
) {
  ctx.save();

  ctx.fillStyle = "#fbbf24";

  ctx.beginPath();
  ctx.arc(startX, startY, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}