import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const membersRouter = Router({ mergeParams: true });
membersRouter.use(requireAuth);

// Helper — check if user is admin/owner of project
async function requireAdmin(
  slug: string,
  userId: string
): Promise<{ projectId: string } | null> {
  const result = await pool.query(
    `SELECT p.id AS project_id, pm.role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.slug = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
    [slug, userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const isOwner = await pool.query(
    "SELECT id FROM projects WHERE slug = $1 AND owner_id = $2",
    [slug, userId]
  );

  if (isOwner.rows.length === 0 && row.role !== "admin") return null;

  return { projectId: row.project_id };
}

// GET /projects/:slug/members
membersRouter.get("/", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const userId = req.user!.userId;

  try {
    // Must have access to the project
    const access = await pool.query(
      `SELECT p.id FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.slug = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [slug, userId]
    );

    if (access.rows.length === 0) {
      res.status(404).json({ error: "Project not found or access denied" });
      return;
    }

    const projectId = access.rows[0].id;

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role, pm.created_at AS joined_at,
              (p.owner_id = u.id) AS is_owner
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.project_id = $1
       ORDER BY pm.created_at ASC`,
      [projectId]
    );

    // Also include owner if not already in members
    const ownerResult = await pool.query(
      `SELECT u.id, u.name, u.email, 'admin' AS role, p.created_at AS joined_at, true AS is_owner
       FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1`,
      [projectId]
    );

    const memberIds = new Set(result.rows.map((r) => r.id));
    const members = [...result.rows];
    for (const owner of ownerResult.rows) {
      if (!memberIds.has(owner.id)) members.unshift(owner);
    }

    res.json({ members });
  } catch (err) {
    console.error("List members error:", err);
    res.status(500).json({ error: "Failed to list members" });
  }
});

// POST /projects/:slug/members — invite by email
const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

membersRouter.post("/", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const userId = req.user!.userId;

  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, role } = parsed.data;

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can invite members" });
      return;
    }

    // Find user by email
    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "No user found with that email address" });
      return;
    }

    const invitee = userResult.rows[0];

    // Check not already a member
    const existing = await pool.query(
      "SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2",
      [admin.projectId, invitee.id]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: "User is already a member of this project" });
      return;
    }

    // Check not the owner
    const isOwner = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND owner_id = $2",
      [admin.projectId, invitee.id]
    );

    if (isOwner.rows.length > 0) {
      res.status(409).json({ error: "User is the owner of this project" });
      return;
    }

    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
      [admin.projectId, invitee.id, role]
    );

    res.status(201).json({
      member: { id: invitee.id, name: invitee.name, email: invitee.email, role },
    });
  } catch (err) {
    console.error("Invite member error:", err);
    res.status(500).json({ error: "Failed to invite member" });
  }
});

// PATCH /projects/:slug/members/:userId — change role
const UpdateRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

membersRouter.patch("/:memberId", async (req: Request, res: Response) => {
  const { slug, memberId } = req.params;
  const userId = req.user!.userId;

  const parsed = UpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can change roles" });
      return;
    }

    const result = await pool.query(
      `UPDATE project_members SET role = $1
       WHERE project_id = $2 AND user_id = $3
       RETURNING id`,
      [parsed.data.role, admin.projectId, memberId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json({ success: true, role: parsed.data.role });
  } catch (err) {
    console.error("Update role error:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// DELETE /projects/:slug/members/:memberId — remove member
membersRouter.delete("/:memberId", async (req: Request, res: Response) => {
  const { slug, memberId } = req.params;
  const userId = req.user!.userId;

  try {
    const admin = await requireAdmin(slug, userId);
    if (!admin) {
      res.status(403).json({ error: "Only admins can remove members" });
      return;
    }

    await pool.query(
      "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
      [admin.projectId, memberId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});