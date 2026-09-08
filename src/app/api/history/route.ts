import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import type { StoredAttempt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keep parity with the old localStorage cap. */
const HISTORY_LIMIT = 50;

/** GET /api/history — the most recent reps, newest first. */
export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await pool().query(
      `SELECT data FROM attempts ORDER BY created_at DESC LIMIT $1`,
      [HISTORY_LIMIT],
    );
    return NextResponse.json(rows.map((row) => row.data as StoredAttempt));
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

/** POST /api/history — upsert one rep, then trim to the newest HISTORY_LIMIT. */
export async function POST(request: Request) {
  try {
    const attempt = (await request.json()) as StoredAttempt;
    if (!attempt || typeof attempt.id !== "string") {
      return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
    }
    await ensureSchema();
    const db = pool();
    await db.query(
      `INSERT INTO attempts (id, created_at, data) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, data = EXCLUDED.data`,
      [attempt.id, attempt.createdAt ?? 0, attempt],
    );
    await db.query(
      `DELETE FROM attempts WHERE id NOT IN (
         SELECT id FROM attempts ORDER BY created_at DESC LIMIT $1
       )`,
      [HISTORY_LIMIT],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

/** DELETE /api/history?id=… removes one rep; without an id it clears them all. */
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    await ensureSchema();
    if (id) {
      await pool().query(`DELETE FROM attempts WHERE id = $1`, [id]);
    } else {
      await pool().query(`DELETE FROM attempts`);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "Database error";
}
