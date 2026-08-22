import { NextResponse } from "next/server";
import { DEFAULT_SCRIBE_MODEL } from "@/lib/config";
import type { ScribeWord, Transcript } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * ElevenLabs does not return a charge, so cost is derived from their published
 * Scribe v2 rate: $0.22 per hour of audio, flat across API tiers as of Aug 2026.
 * Override with ELEVENLABS_USD_PER_HOUR if your plan or the price differs.
 */
const DEFAULT_USD_PER_HOUR = 0.22;

type ScribeResponse = {
  text?: string;
  words?: ScribeWord[];
  language_code?: string;
  audio_duration_secs?: number;
  detail?: unknown;
};

/** ElevenLabs error bodies are inconsistent; dig out something readable. */
function readableError(status: number, body: string) {
  try {
    const parsed = JSON.parse(body);
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return String(detail.message);
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // fall through to the raw body
  }
  return body.slice(0, 300) || `ElevenLabs returned ${status}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio was uploaded." }, { status: 400 });
  }

  const fallbackDuration = Number(form.get("durationSecs") ?? 0);

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "take.webm");
  upstream.append("model_id", process.env.ELEVENLABS_MODEL_ID || DEFAULT_SCRIBE_MODEL);
  upstream.append("timestamps_granularity", "word");
  // Non-speech tags (breaths, laughter, throat clearing) are part of the read.
  upstream.append("tag_audio_events", "true");
  upstream.append("diarize", "false");
  if (process.env.ELEVENLABS_LANGUAGE_CODE) {
    upstream.append("language_code", process.env.ELEVENLABS_LANGUAGE_CODE);
  }

  let response: Response;
  try {
    response = await fetch(ELEVENLABS_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstream,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach ElevenLabs: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    return NextResponse.json(
      { error: readableError(response.status, raw) },
      { status: response.status },
    );
  }

  let parsed: ScribeResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "ElevenLabs returned malformed JSON." }, { status: 502 });
  }

  const words = (parsed.words ?? []).filter(
    (word): word is ScribeWord => typeof word?.text === "string",
  );

  const transcript: Transcript = {
    text: (parsed.text ?? "").trim(),
    words,
    languageCode: parsed.language_code,
    audioDurationSecs:
      parsed.audio_duration_secs ||
      words.filter((w) => w.type === "word").at(-1)?.end ||
      fallbackDuration,
  };

  const usdPerHour = Number(process.env.ELEVENLABS_USD_PER_HOUR) || DEFAULT_USD_PER_HOUR;
  const cost = {
    usd: (transcript.audioDurationSecs / 3600) * usdPerHour,
    basis: `${transcript.audioDurationSecs.toFixed(1)}s of audio at $${usdPerHour}/hour`,
  };

  return NextResponse.json({ transcript, cost });
}
