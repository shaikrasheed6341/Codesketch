export type Point = {
  x: number;
  y: number;
};

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export type Shape = {
  id: string;
  tool: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  points?: Point[];
  text?: string;
  fontSize?: number;
};

export type Interaction = {
  type: "move" | "resize";
  id: string;
  startX: number;
  startY: number;
  shape: Shape;
  handle?: ResizeHandle;
};

export type TextEditor = {
  point: Point;
  screenPoint: Point;
  value: string;
};

export type PresenceUser = {
  name: string;
  status: "online" | "offline";
};

export type AuthUser = {
  name: string;
  email: string;
};
