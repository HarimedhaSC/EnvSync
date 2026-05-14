import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const tokensRouter = Router({ mergeParams: true });
tokensRouter.use(requireAuth);

// Helper — check if user is admin/owner
async function requireAdmin(
  slug: string,
  userId: string
): Promise<{ projectId: string } | null> {
  const result = await pool.query(
    `SELECT p.id AS project_id, (p.owner_id = $2) AS is_owner, pm.role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.slug = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
    [slug, userId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.is_owner && row.role !== "admin") return null;
  return { projectId: row.project_id };
}

// GET /projects/:slug/tokens
tokensRouter.get("/", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const userId = req.user!.userId;

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can manage tokens" });
      return;
    }

    const result = await pool.query(
      `SELECT t.id, t.name, t.token_prefix, t.created_at, t.last_used_at, t.expires_at,
              u.name AS created_by_name
       FROM api_tokens t
       JOIN users u ON u.id = t.created_by
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC`,
      [admin.projectId]
    );

    res.json({ tokens: result.rows });
  } catch (err) {
    console.error("List tokens error:", err);
    res.status(500).json({ error: "Failed to list tokens" });
  }
});

// POST /projects/:slug/tokens — create a new CI/CD token
const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

tokensRouter.post("/", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const userId = req.user!.userId;

  const parsed = CreateTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can create tokens" });
      return;
    }

    // Generate token: envs_<random32bytes>
    const rawToken = `envs_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenPrefix = rawToken.substring(0, 12); // "envs_" + 7 chars

    const expiresAt = parsed.data.expires_in_days
      ? new Date(Date.now() + parsed.data.expires_in_days * 86400000)
      : null;

    const result = await pool.query(
      `INSERT INTO api_tokens (project_id, name, token_hash, token_prefix, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, token_prefix, created_at, expires_at`,
      [admin.projectId, parsed.data.name, tokenHash, tokenPrefix, userId, expiresAt]
    );

    // Return the raw token ONCE — never again
    res.status(201).json({
      token: result.rows[0],
      raw_token: rawToken,
      warning: "Save this token now — it will never be shown again.",
    });
  } catch (err) {
    console.error("Create token error:", err);
    res.status(500).json({ error: "Failed to create token" });
  }
});

// DELETE /projects/:slug/tokens/:tokenId
tokensRouter.delete("/:tokenId", async (req: Request, res: Response) => {
  const { slug, tokenId } = req.params;
  const userId = req.user!.userId;

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can revoke tokens" });
      return;
    }

    await pool.query(
      "DELETE FROM api_tokens WHERE id = $1 AND project_id = $2",
      [tokenId, admin.projectId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Revoke token error:", err);
    res.status(500).json({ error: "Failed to revoke token" });
  }
});