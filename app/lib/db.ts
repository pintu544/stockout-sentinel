import { Pool } from "pg";

// Server-only Postgres pool (Render, external URL so Vercel can reach it too).
// Never imported from client components.

const connectionString = process.env.DATABASE_URL ?? "";
// Render (and most managed Postgres) needs SSL; a localhost dev DB usually
// doesn't offer it. This VM also can't do PG SSL through the egress proxy,
// so local dev must skip it.
const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  // Render free tier is single-connection friendly; keep the pool small.
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function dbPing(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

export async function dbQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}
