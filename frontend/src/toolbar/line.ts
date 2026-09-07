export default function drawLine(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = "#ffffff",
  lineWidth = 3
) {
  ctx.beginPath();

  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.stroke();
}