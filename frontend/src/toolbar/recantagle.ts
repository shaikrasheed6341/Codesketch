export default function drawRectangle(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) {
  const width = endX - startX;
  const height = endY - startY;

  ctx.beginPath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;

  ctx.rect(
    startX,
    startY,
    width,
    height
  );

  ctx.stroke();
}