import { Pool } from "pg";

/**
 * A single shared connection pool. This app has no accounts, so all reps and
 * settings live in one global dataset — the tables are keyed by a fixed owner.
 */
const globalForPool = globalThis as unknown as { __mindMouthPool?: Pool };

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function pool(): Pool {
  if (!globalForPool.__mindMouthPool) {
    const url = connectionString();
    globalForPool.__mindMouthPool = new Pool({
      connectionString: url,
      // The provided URL uses sslmode=disable; honour it rather than forcing TLS.
      ssl: url.includes("sslmode=disable") ? false : undefined,
    });
  }
  return globalForPool.__mindMouthPool;
}

let schemaReady: Promise<void> | null = null;

/** Create the tables on first use. Cheap and idempotent. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool().query(`
        CREATE TABLE IF NOT EXISTS attempts (
          id TEXT PRIMARY KEY,
          created_at BIGINT NOT NULL,
          data JSONB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS attempts_created_at_idx ON attempts (created_at DESC);
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          data JSONB NOT NULL
        );
      `);
    })().catch((err) => {
      // Let the next call retry rather than caching a rejected promise forever.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
