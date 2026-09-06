export function panCanvas(
  startX: number,
  startY: number,
  endX: number,
  endY: number
) {
  const dx = endX - startX;
  const dy = endY - startY;

  return {
    dx,
    dy,
  };
}