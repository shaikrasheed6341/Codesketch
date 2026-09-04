export interface databasetype {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface arrowtype {
  ctx: CanvasRenderingContext2D;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  arrowWidth?: number;
  color?: string;
}