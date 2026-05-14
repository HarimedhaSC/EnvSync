import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { checkDatabaseConnection } from "./db/pool";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { variablesRouter } from "./routes/variables";
import { historyRouter } from "./routes/history";
import { membersRouter } from "./routes/members";
import { tokensRouter } from "./routes/tokens";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down." },
  })
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects/:slug/environments/:env/variables", variablesRouter);
app.use("/api/projects/:slug/environments/:env/history", historyRouter);
app.use("/api/projects/:slug/members", membersRouter);
app.use("/api/projects/:slug/tokens", tokensRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await checkDatabaseConnection();
  app.listen(PORT, () => {
    console.log(`🚀 envsync API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export default app;