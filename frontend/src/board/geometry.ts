import type { Point, ResizeHandle, Shape } from "./types";

export const distanceToSegment = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const projection =
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closestX = a.x + clamped * dx;
  const closestY = a.y + clamped * dy;

  return Math.hypot(point.x - closestX, point.y - closestY);
};

export const moveShape = (shape: Shape, dx: number, dy: number): Shape => {
  if (shape.tool === "pencil" && shape.points) {
    return {
      ...shape,
      points: shape.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      })),
    };
  }

  return {
    ...shape,
    startX: (shape.startX ?? 0) + dx,
    startY: (shape.startY ?? 0) + dy,
    endX: (shape.endX ?? 0) + dx,
    endY: (shape.endY ?? 0) + dy,
  };
};

export const resizeShape = (
  shape: Shape,
  handle: ResizeHandle,
  pointer: Point,
  original: Shape,
): Shape => {
  const originalPoints = original.points ?? [];
  const textWidth = original.tool === "text"
    ? Math.max((original.text?.length ?? 1) * (original.fontSize ?? 24) * 0.62, 24)
    : 0;
  const startX = original.startX ?? (originalPoints.length > 0 ? Math.min(...originalPoints.map((point) => point.x)) : 0);
  const startY = original.startY ?? (originalPoints.length > 0 ? Math.min(...originalPoints.map((point) => point.y)) : 0);
  const endX = original.endX ?? (original.tool === "text" ? startX + textWidth : originalPoints.length > 0 ? Math.max(...originalPoints.map((point) => point.x)) : 0);
  const endY = original.endY ?? (original.tool === "text" ? startY + (original.fontSize ?? 24) + 6 : originalPoints.length > 0 ? Math.max(...originalPoints.map((point) => point.y)) : 0);

  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const maxX = Math.max(startX, endX);
  const maxY = Math.max(startY, endY);

  let nextMinX = minX;
  let nextMinY = minY;
  let nextMaxX = maxX;
  let nextMaxY = maxY;

  if (handle.includes("w")) nextMinX = pointer.x;
  if (handle.includes("e")) nextMaxX = pointer.x;
  if (handle.includes("n")) nextMinY = pointer.y;
  if (handle.includes("s")) nextMaxY = pointer.y;

  if (originalPoints.length > 0) {
    const scaleX = Math.max(0.1, (nextMaxX - nextMinX) / Math.max(maxX - minX, 1));
    const scaleY = Math.max(0.1, (nextMaxY - nextMinY) / Math.max(maxY - minY, 1));

    return {
      ...shape,
      points: originalPoints.map((point) => ({
        x: nextMinX + (point.x - minX) * scaleX,
        y: nextMinY + (point.y - minY) * scaleY,
      })),
    };
  }

  if (original.tool === "text") {
    const scaleX = Math.max(0.1, (nextMaxX - nextMinX) / Math.max(maxX - minX, 1));
    const scaleY = Math.max(0.1, (nextMaxY - nextMinY) / Math.max(maxY - minY, 1));
    const scale = Math.max(scaleX, scaleY);

    return {
      ...shape,
      startX: nextMinX,
      startY: nextMaxY - 6,
      fontSize: Math.max(8, (original.fontSize ?? 24) * scale),
    };
  }

  if (shape.tool === "line" || shape.tool === "arrow") {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scaleX = Math.max(0.1, (nextMaxX - nextMinX) / width);
    const scaleY = Math.max(0.1, (nextMaxY - nextMinY) / height);

    return {
      ...shape,
      startX: centerX + (startX - centerX) * scaleX,
      startY: centerY + (startY - centerY) * scaleY,
      endX: centerX + (endX - centerX) * scaleX,
      endY: centerY + (endY - centerY) * scaleY,
    };
  }

  return {
    ...shape,
    startX: nextMinX,
    startY: nextMinY,
    endX: nextMaxX,
    endY: nextMaxY,
  };
};
