import { Router, Request, Response } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const historyRouter = Router({ mergeParams: true });
historyRouter.use(requireAuth);

// GET /projects/:slug/environments/:env/history
// Optional query param: ?key=PORT to filter by variable name
historyRouter.get("/", async (req: Request, res: Response) => {
  const { slug, env } = req.params;
  const { key } = req.query;
  const userId = req.user!.userId;

  try {
    // Verify user has access to this project
    const access = await pool.query(
      `SELECT e.id AS environment_id, p.id AS project_id
       FROM environments e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $3
       WHERE p.slug = $1 AND e.name = $2
         AND (p.owner_id = $3 OR pm.user_id = $3)`,
      [slug, env, userId]
    );

    if (access.rows.length === 0) {
      res.status(404).json({ error: "Project or environment not found" });
      return;
    }

    const { environment_id, project_id } = access.rows[0];

    const params: unknown[] = [environment_id, project_id];
    let keyFilter = "";

    if (key && typeof key === "string") {
      params.push(key);
      keyFilter = `AND vh.key = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         vh.id,
         vh.key,
         vh.action,
         vh.changed_at,
         u.name  AS changed_by_name,
         u.email AS changed_by_email
       FROM variable_history vh
       JOIN users u ON u.id = vh.changed_by
       WHERE vh.environment_id = $1
         AND vh.project_id = $2
         ${keyFilter}
       ORDER BY vh.changed_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        key: row.key,
        action: row.action,
        changed_at: row.changed_at,
        changed_by: {
          name: row.changed_by_name,
          email: row.changed_by_email,
        },
      })),
      environment: env,
      project: slug,
    });
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});