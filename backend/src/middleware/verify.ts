import type { NextFunction, Request, Response } from "express";
import Cookies from "cookies";
import jwt from "jsonwebtoken";

export type AuthenticatedRequest = Request & { userId?: number };

export function verify(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  const token = bearerToken ?? new Cookies(req, res).get("access_token");

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded === "string" || typeof decoded.userId !== "number") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}