export function clampZoom(value: number, min = 0.5, max = 2) {
  return Math.min(Math.max(value, min), max);
}

export function getZoomStep(currentZoom: number, factor: number) {
  return Number((currentZoom * factor).toFixed(6));
}
