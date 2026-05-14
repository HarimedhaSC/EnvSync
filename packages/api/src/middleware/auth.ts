import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.substring(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware that checks whether the authenticated user has access
 * to the project identified by req.params.projectSlug.
 * Attaches req.projectId and req.userRole to the request.
 */
export async function requireProjectAccess(
  req: Request & { projectId?: string; userRole?: string },
  res: Response,
  next: NextFunction
): Promise<void> {
  const { projectSlug } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT p.id, pm.role
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.slug = $2 AND (p.owner_id = $1 OR pm.user_id = $1)`,
      [userId, projectSlug]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Project not found or access denied" });
      return;
    }

    req.projectId = result.rows[0].id;
    req.userRole = result.rows[0].role ?? "admin"; // owner always has admin
    next();
  } catch (err) {
    next(err);
  }
}
