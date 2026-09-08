import { NextResponse } from "next/server";
import { coerceModel, DEFAULT_OPENROUTER_MODEL } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 180;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are an experienced speaking coach reviewing a student's full training log for the "random word generator" drill: they are handed a random word with no warning and must speak on it, unscripted, for a target duration. Every rep has been transcribed verbatim and measured — fillers, pauses, pace, silence — and scored out of 100. Word tiers run 1 (concrete and emotionally loaded, easy to speak on) to 5 (abstract and flat, hard). The speaker's level rises as they score well, which means later reps are usually on harder words than earlier ones.

Reps may also carry a vocal variety score out of 100, measured on the speaker's device from the raw audio: pitch movement in semitones, loudness swing, pace changes, and the longest stretch with a flat pitch. Conversational speech moves about 2 to 3 semitones; under 1.5 is a monotone. Older reps may not have it. Each rep also notes whether an on-screen frame (Picture → Moment → Point) was shown — it fades as the level rises, so structure that held after the frame disappeared is a real gain, and structure that collapsed when it went is worth naming.

Write the read you would actually give this person after looking at their log. Prose, addressed to them as "you". Roughly 200-350 words. Markdown is fine for emphasis and the occasional bullet, but do not use headings.

What matters:

Say what the data actually shows. If they have plainly improved, say so and point at the numbers. If they have not moved, say that. If they have got worse, say that. If there are too few reps to conclude anything, say that instead of manufacturing a trend — three reps is not a trend. Never invent progress to be encouraging, and never invent a problem to sound rigorous.

Watch for what the summary numbers hide. Scores that look flat while the word tier climbed are real improvement. Scores that rose while the tiers stayed easy are not. A filler rate that dropped because the takes got shorter is not progress. Someone who is clean but slow has a different problem from someone who is fast and scattered. Read the transcripts you are given, not just the metrics — a speaker whose openings have got sharper is improving even if the score has not caught up yet.

Be specific. Name actual words they spoke on, actual numbers, actual moments from the transcripts. A review that would fit any speaker is worthless.

There is no required structure. Do not work through a checklist of strengths and weaknesses. Do not end every review with the same kind of sentence. Say the most useful true thing you can see, in whatever order makes sense, and stop when you are done. If the single most useful thing you can tell them is that they need more reps before this analysis means anything, then that is the review.`;

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let body: { model?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!body.payload) {
    return NextResponse.json({ error: "No training data was sent." }, { status: 400 });
  }

  const model = coerceModel(
    body.model?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_NAME) headers["X-Title"] = process.env.OPENROUTER_SITE_NAME;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Here is the full training log.\n\n${JSON.stringify(body.payload, null, 2)}`,
          },
        ],
        // Warmer than the per-rep grader: this is a read, not a scorecard, and
        // it should not come out the same shape every time.
        temperature: 0.8,
        max_tokens: 1100,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach OpenRouter: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    let message = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch {
      // keep the raw slice
    }
    return NextResponse.json({ error: `OpenRouter (${model}): ${message}` }, { status: response.status });
  }

  let parsed: {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "OpenRouter returned malformed JSON." }, { status: 502 });
  }

  const analysis = (parsed.choices?.[0]?.message?.content ?? "").trim();
  if (!analysis) {
    return NextResponse.json({ error: `${model} returned an empty review.` }, { status: 502 });
  }

  const usage = parsed.usage;
  return NextResponse.json({
    analysis,
    model,
    cost:
      typeof usage?.cost === "number"
        ? {
            usd: usage.cost,
            basis: `charged by OpenRouter for ${model}`,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
          }
        : null,
  });
}
