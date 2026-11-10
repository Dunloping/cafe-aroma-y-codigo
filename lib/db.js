import pg from "pg";

const { Pool } = pg;

let pool;

/**
 * A single pool is reused across warm invocations of the serverless function.
 * `max: 1` keeps each instance inside the connection limit of free Postgres
 * plans; use the provider's pooled connection string (PgBouncer / Neon pooler).
 */
export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "DB_NOT_CONFIGURED";
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl:
        process.env.PGSSL === "disable"
          ? false
          : { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      application_name: "aroma-codigo-web",
    });

    pool.on("error", (error) => {
      console.error("Unexpected Postgres pool error:", error.message);
    });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
