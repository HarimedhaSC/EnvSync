import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
});

// POST /projects
projectsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, slug, description } = parsed.data;
  const userId = req.user!.userId;

  try {
    const existing = await pool.query(
      "SELECT id FROM projects WHERE slug = $1",
      [slug]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Project slug already taken" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const projectResult = await client.query(
        `INSERT INTO projects (name, slug, description, owner_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, description, created_at`,
        [name, slug, description ?? null, userId]
      );
      const project = projectResult.rows[0];

      // Create default environments
      await client.query(
        `INSERT INTO environments (project_id, name) VALUES
         ($1, 'development'),
         ($1, 'staging'),
         ($1, 'production')`,
        [project.id]
      );

      await client.query("COMMIT");
      res.status(201).json({ project });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// GET /projects
projectsRouter.get("/", async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.slug, p.description, p.owner_id, p.created_at,
              (p.owner_id = $1) AS is_owner,
              COALESCE(pm.role, 'admin') AS role
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.owner_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error("List projects error:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// GET /projects/:slug
projectsRouter.get("/:slug", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  try {
    const projectResult = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.owner_id, p.created_at,
              (p.owner_id = $1) AS is_owner
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.slug = $2 AND (p.owner_id = $1 OR pm.user_id = $1)`,
      [userId, slug]
    );

    if (projectResult.rows.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const project = projectResult.rows[0];

    const envsResult = await pool.query(
      "SELECT id, name, created_at FROM environments WHERE project_id = $1 ORDER BY name",
      [project.id]
    );

    res.json({ project: { ...project, environments: envsResult.rows } });
  } catch (err) {
    console.error("Get project error:", err);
    res.status(500).json({ error: "Failed to get project" });
  }
});
