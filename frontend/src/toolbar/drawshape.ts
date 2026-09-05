import arrow from './arrow';
import circle from './circle';
import rectangle from './recantagle';
import line from './line';

type Point = { x: number; y: number };

export function drawPencilStroke(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'blue';
  ctx.stroke();
}

export default function drawshape(
  selectedTool: string,
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  points: Point[] = []
) {
  if (selectedTool === 'draw' || selectedTool === 'line') {
    line(ctx, startX, startY, endX, endY);
  } else if (selectedTool === 'arrow') {
    arrow(ctx, startX, startY, endX, endY);
  } else if (selectedTool === 'circle') {
    circle(ctx, { startX, startY, endX, endY });
  } else if (selectedTool === 'rectangle') {
    rectangle(ctx, startX, startY, endX, endY);
  } else if (selectedTool === 'pencil') {
    drawPencilStroke(ctx, points);
  }
}