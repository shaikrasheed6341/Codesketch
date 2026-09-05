export default function drawArrow(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) {
  const arrowSize = 15;

  // Main line
  ctx.beginPath();

  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);

  ctx.stroke();

  // Calculate angle
  const angle = Math.atan2(
    endY - startY,
    endX - startX
  );

  // Arrow head - left side
  ctx.beginPath();

  ctx.moveTo(endX, endY);

  ctx.lineTo(
    endX - arrowSize * Math.cos(angle - Math.PI / 6),
    endY - arrowSize * Math.sin(angle - Math.PI / 6)
  );

  // Arrow head - right side
  ctx.moveTo(endX, endY);

  ctx.lineTo(
    endX - arrowSize * Math.cos(angle + Math.PI / 6),
    endY - arrowSize * Math.sin(angle + Math.PI / 6)
  );

  ctx.stroke();
}