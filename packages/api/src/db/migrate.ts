import { pool } from "./pool";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function migrate(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  console.log("🔄 Running migrations...");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✅ Migrations complete");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
