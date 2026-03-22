import { getUserById } from "../db/helpers/users.js";
import { verifySessionToken } from "../utils/auth.js";
import type { Request, Response, NextFunction } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Auth Precedence: Cookie > Authorization Header
  let token: string | undefined;

  if (req.cookies?.traycer_session) {
    token = req.cookies.traycer_session;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Ensure Access Token, Not Refresh Token
  if (payload.type !== "access") {
    res.status(401).json({ error: "Invalid token type" });
    return;
  }

  const user = await getUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.user = user;
  next();
}
