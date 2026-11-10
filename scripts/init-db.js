import { readFile } from "node:fs/promises";
import { getPool, closePool } from "../lib/db.js";

const schemaUrl = new URL("../db/schema.sql", import.meta.url);

try {
  const sql = await readFile(schemaUrl, "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("✔ Esquema aplicado: tabla contact_messages lista.");
} catch (error) {
  console.error("✖ No se pudo aplicar el esquema:", error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
