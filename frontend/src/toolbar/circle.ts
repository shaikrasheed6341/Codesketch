export default function drawCircle(ctx: CanvasRenderingContext2D, shape: { startX: number; startY: number; endX: number; endY: number }) {
  const radiusX = Math.abs(shape.endX - shape.startX) / 2;
  const radiusY = Math.abs(shape.endY - shape.startY) / 2;

  const centerX = (shape.startX + shape.endX) / 2;
  const centerY = (shape.startY + shape.endY) / 2;

  ctx.beginPath();

  ctx.ellipse(
    centerX,
    centerY,
    radiusX,
    radiusY,
    0,
    0,
    Math.PI * 2
  );

  ctx.stroke();
}