import { NextResponse } from "next/server";
import { coerceModel } from "@/lib/config";
import { ensureSchema, pool } from "@/lib/db";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings — the single stored preferences row, or defaults. */
export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await pool().query(`SELECT data FROM app_settings WHERE id = 1`);
    const stored = rows[0]?.data as Partial<Settings> | undefined;
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    return NextResponse.json({ ...merged, model: coerceModel(merged.model) });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

/** PUT /api/settings — replace the preferences row. */
export async function PUT(request: Request) {
  try {
    const next = (await request.json()) as Settings;
    await ensureSchema();
    await pool().query(
      `INSERT INTO app_settings (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [{ ...DEFAULT_SETTINGS, ...next, model: coerceModel(next?.model) }],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "Database error";
}
