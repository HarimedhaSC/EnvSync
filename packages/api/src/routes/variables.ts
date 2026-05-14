import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { encrypt, decrypt } from "../services/encryption";

export const variablesRouter = Router({ mergeParams: true });
variablesRouter.use(requireAuth);

// All routes are scoped under /projects/:slug/environments/:env/variables

async function resolveEnvironment(
  projectSlug: string,
  envName: string,
  userId: string
): Promise<{ projectId: string; environmentId: string } | null> {
  const result = await pool.query(
    `SELECT e.id AS environment_id, p.id AS project_id
     FROM environments e
     JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $3
     WHERE p.slug = $1 AND e.name = $2
       AND (p.owner_id = $3 OR pm.user_id = $3)`,
    [projectSlug, envName, userId]
  );
  if (result.rows.length === 0) return null;
  return {
    projectId: result.rows[0].project_id,
    environmentId: result.rows[0].environment_id,
  };
}

// GET /projects/:slug/environments/:env/variables
variablesRouter.get("/", async (req: Request, res: Response) => {
  const { slug, env } = req.params;
  const userId = req.user!.userId;

  try {
    const context = await resolveEnvironment(slug, env, userId);
    if (!context) {
      res.status(404).json({ error: "Project or environment not found" });
      return;
    }

    const result = await pool.query(
      `SELECT v.id, v.key, v.encrypted_value, v.is_secret, v.created_at, v.updated_at,
              u.name AS created_by_name, u.email AS created_by_email
       FROM variables v
       JOIN users u ON u.id = v.created_by
       WHERE v.environment_id = $1
       ORDER BY v.key ASC`,
      [context.environmentId]
    );

    const variables = result.rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.is_secret ? "***" : decrypt(row.encrypted_value),
      is_secret: row.is_secret,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: { name: row.created_by_name, email: row.created_by_email },
    }));

    res.json({ variables, environment: env, project: slug });
  } catch (err) {
    console.error("List variables error:", err);
    res.status(500).json({ error: "Failed to list variables" });
  }
});

// GET /projects/:slug/environments/:env/variables/export
// Returns decrypted values — used by CLI pull
variablesRouter.get("/export", async (req: Request, res: Response) => {
  const { slug, env } = req.params;
  const userId = req.user!.userId;

  try {
    const context = await resolveEnvironment(slug, env, userId);
    if (!context) {
      res.status(404).json({ error: "Project or environment not found" });
      return;
    }

    const result = await pool.query(
      "SELECT key, encrypted_value FROM variables WHERE environment_id = $1 ORDER BY key ASC",
      [context.environmentId]
    );

    const variables: Record<string, string> = {};
    for (const row of result.rows) {
      variables[row.key] = decrypt(row.encrypted_value);
    }

    res.json({ variables, environment: env, project: slug });
  } catch (err) {
    console.error("Export variables error:", err);
    res.status(500).json({ error: "Failed to export variables" });
  }
});

const SetVariablesSchema = z.object({
  variables: z.record(z.string(), z.string()),
  is_secret: z.boolean().optional().default(true),
});

// PUT /projects/:slug/environments/:env/variables
// Upserts multiple variables at once (used by CLI push)
variablesRouter.put("/", async (req: Request, res: Response) => {
  const { slug, env } = req.params;
  const userId = req.user!.userId;

  const parsed = SetVariablesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { variables, is_secret } = parsed.data;

  try {
    const context = await resolveEnvironment(slug, env, userId);
    if (!context) {
      res.status(404).json({ error: "Project or environment not found" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const upserted: string[] = [];
      for (const [key, value] of Object.entries(variables)) {
        const encryptedValue = encrypt(value);

        // Get previous value for audit trail
        const prev = await client.query(
          "SELECT id, encrypted_value FROM variables WHERE environment_id = $1 AND key = $2",
          [context.environmentId, key]
        );

        const isNew = prev.rows.length === 0;

        const upsertResult = await client.query(
          `INSERT INTO variables (environment_id, key, encrypted_value, is_secret, created_by)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (environment_id, key)
   DO UPDATE SET encrypted_value = $3, updated_at = NOW()
   RETURNING id`,
          [context.environmentId, key, encryptedValue, is_secret, userId]
        );

        const variableId = upsertResult.rows[0].id;

        // Write audit record
        await client.query(
          `INSERT INTO variable_history
     (variable_id, environment_id, project_id, key, encrypted_value, action, changed_by)
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            variableId,
            context.environmentId,
            context.projectId,
            key,
            encryptedValue,
            isNew ? "created" : "updated",
            userId,
          ]
        );

        upserted.push(key);
      }

      await client.query("COMMIT");
      res.json({ upserted, count: upserted.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Set variables error:", err);
    res.status(500).json({ error: "Failed to set variables" });
  }
});

// DELETE /projects/:slug/environments/:env/variables/:key
variablesRouter.delete("/:key", async (req: Request, res: Response) => {
  const { slug, env, key } = req.params;
  const userId = req.user!.userId;

  try {
    const context = await resolveEnvironment(slug, env, userId);
    if (!context) {
      res.status(404).json({ error: "Project or environment not found" });
      return;
    }

    const varResult = await pool.query(
      "SELECT id FROM variables WHERE environment_id = $1 AND key = $2",
      [context.environmentId, key]
    );

    if (varResult.rows.length === 0) {
      res.status(404).json({ error: `Variable '${key}' not found` });
      return;
    }

    const variableId = varResult.rows[0].id;

    await pool.query("BEGIN");
    try {
      await pool.query(
        "DELETE FROM variables WHERE id = $1",
        [variableId]
      );
      await pool.query(
        `INSERT INTO variable_history
           (variable_id, environment_id, project_id, key, encrypted_value, action, changed_by)
         VALUES ($1, $2, $3, $4, NULL, 'deleted', $5)`,
        [variableId, context.environmentId, context.projectId, key, userId]
      );
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }

    res.json({ deleted: key });
  } catch (err) {
    console.error("Delete variable error:", err);
    res.status(500).json({ error: "Failed to delete variable" });
  }
});
