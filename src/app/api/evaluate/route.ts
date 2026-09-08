import { NextResponse } from "next/server";
import { coerceModel, DEFAULT_OPENROUTER_MODEL } from "@/lib/config";
import type { Evaluation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "relevance_score",
    "structure_score",
    "insight_score",
    "verdict",
    "summary",
    "strengths",
    "better_opening",
  ],
  properties: {
    relevance_score: { type: "integer", minimum: 0, maximum: 100 },
    structure_score: { type: "integer", minimum: 0, maximum: 100 },
    insight_score: { type: "integer", minimum: 0, maximum: 100 },
    verdict: { type: "string" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    better_opening: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You are a speaking coach grading one rep of the "random word generator" exercise, a drill for strengthening the mind-to-mouth connection: a speaker is given a random word with no warning and must speak about it, unscripted, for a target duration.

What you are grading:
- This is improvised speech, not a written essay. Judge it as speech. Some roughness is expected and fine.
- The delivery metrics (fillers, pauses, pace) have already been measured precisely and are given to you. Do not recount them and never contradict them. Use them as evidence, and focus your own judgement on CONTENT: relevance, structure, and insight.
- The transcript is verbatim, so it contains fillers and false starts. Read past them to what the speaker actually meant.

Score three dimensions from 0 to 100:
- relevance_score: did they actually talk about the given word, and stay with it? The definition shown to the speaker is the intended sense — judge against that, but do not punish them for reaching a legitimate second sense or a metaphor, which is good improvisation. Drifting to an unrelated topic scores low. Using the word as a springboard to a connected story scores high.
- structure_score: was there a discernible shape — an entry point, a thread that develops, a landing? Circling the same idea, trailing off, or stopping mid-thought scores low.
- insight_score: was there a story, an angle, a metaphor, a specific example — something a listener would remember? Generic dictionary-definition talk scores low.

Then write feedback:
- verdict: one punchy sentence, under 12 words, that names the single biggest thing about this take.
- summary: 2-3 sentences describing how the take actually went. Be specific to what they said, and name the single most valuable thing to change next time. Keep it to three sentences at most — brevity is the point, they have to remember it while speaking.
- strengths: 2-3 short items. Genuine ones only. If the take was weak, say what was least weak.
- better_opening: rewrite their first sentence as a stronger opening line for this exact word, roughly 15-25 words, in their voice. Show them what a strong entry sounds like.

You are also told where the speaker sits on a five-level ladder, how hard this word was, how they have scored recently, and what you told them to fix last time. Use it:
- Score on an ABSOLUTE standard regardless of level. A level 1 speaker and a level 5 speaker who give identical takes get identical scores — otherwise the trend line means nothing. Difficulty is already handled by giving beginners easier words.
- Pitch the ADVICE to their level. A level 1 speaker needs one blunt, mechanical thing to fix. A level 4 or 5 speaker can be told about pacing a callback or landing an ending.
- If you are shown your verdict on their last rep, say plainly in the summary whether the same problem is back. Naming a repeated mistake is the single most useful thing you can do.
- A tier 4 or 5 word is genuinely hard to speak on. Do not tell them the word was easy.

You may also be given MEASURED VOCAL VARIETY: pitch movement in semitones, loudness swing in dB, how much the pace changed, the longest stretch with a flat pitch, and all of that split into opening, middle and closing thirds. It was computed on the speaker's own device from the raw audio and is authoritative. Vocal variety — pace, pitch, volume, pause — is the delivery half of the mind-to-mouth drill, and it is already scored locally, so do not score it yourself. Use it in the feedback when it is the most useful thing to say: a take with a good story and a flat voice should hear about the voice; a voice that faded in the closing third should hear that. For scale, conversational speech moves about 2 to 3 semitones; under 1.5 reads as a monotone; over 3.5 is expressive.

The speaker may have had an ON-SCREEN FRAME — Picture → Moment → Point — as scaffolding. It fades as they climb the ladder and is gone from level 4. Judge structure with that in mind: following the frame is fine and expected; ignoring it and circling is a bigger miss when it was on screen; and when there was no frame, a shape they built themselves is worth more credit.

Be direct and useful. Encouraging, never flattering. A weak take gets a low score and honest feedback — that is how the drill works. Respond with JSON only.`;

type Speaker = {
  level?: number;
  levelName?: string;
  recentScores?: number[];
  totalReps?: number;
  lastRepVerdict?: string | null;
};

/** What each frame mode put on the speaker's screen, in the grader's terms. */
const FRAME_DESCRIPTION: Record<string, string> = {
  guided:
    "Picture → Moment → Point, with a hint under each beat and the current beat lit as the clock ran",
  cues: "Picture → Moment → Point, with a hint under each beat",
  labels: "the three words Picture → Moment → Point, nothing else",
  none: "none — any structure had to come from the speaker",
};

function buildUserPrompt(input: {
  word: string;
  category: string;
  definition: string;
  tier?: number;
  speaker?: Speaker;
  targetSecs: number;
  transcript: string;
  metrics: Record<string, unknown>;
  voice?: Record<string, unknown> | null;
  frame?: string;
}) {
  const speaker = input.speaker ?? {};
  const form =
    speaker.recentScores && speaker.recentScores.length > 0
      ? speaker.recentScores.join(", ")
      : "no reps yet at this level";

  return [
    `RANDOM WORD: "${input.word}" (${input.category})`,
    input.definition ? `SHOWN TO THE SPEAKER AS: ${input.definition}` : "",
    input.tier ? `WORD DIFFICULTY: tier ${input.tier} of 5` : "",
    speaker.level
      ? `SPEAKER LEVEL: ${speaker.level} of 5 (${speaker.levelName ?? ""}) after ${speaker.totalReps ?? 0} total reps`
      : "",
    speaker.level ? `THEIR RECENT SCORES AT THIS LEVEL: ${form}` : "",
    speaker.lastRepVerdict ? `YOUR VERDICT ON THEIR LAST REP: ${speaker.lastRepVerdict}` : "",
    `TARGET DURATION: ${input.targetSecs} seconds`,
    input.frame ? `ON-SCREEN FRAME: ${FRAME_DESCRIPTION[input.frame] ?? input.frame}` : "",
    "",
    "MEASURED DELIVERY METRICS (authoritative, already computed from word-level timestamps):",
    JSON.stringify(input.metrics, null, 2),
    "",
    "MEASURED VOCAL VARIETY (authoritative, computed on the speaker's device from the raw audio):",
    input.voice ? JSON.stringify(input.voice, null, 2) : "(not available for this take)",
    "",
    "VERBATIM TRANSCRIPT:",
    input.transcript || "(no speech was captured)",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const clampScore = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const asStringArray = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit)
    : [];

function normalise(raw: Record<string, unknown>): Evaluation {
  return {
    relevanceScore: clampScore(raw.relevance_score),
    structureScore: clampScore(raw.structure_score),
    insightScore: clampScore(raw.insight_score),
    verdict: String(raw.verdict ?? "").trim(),
    summary: String(raw.summary ?? "").trim(),
    strengths: asStringArray(raw.strengths, 4),
    betterOpening: String(raw.better_opening ?? "").trim(),
  };
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  useSchema: boolean,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_NAME) headers["X-Title"] = process.env.OPENROUTER_SITE_NAME;

  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 1200,
      ...(useSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "speaking_evaluation", strict: true, schema: RESPONSE_SCHEMA },
            },
          }
        : {}),
    }),
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let body: {
    word?: string;
    category?: string;
    definition?: string;
    tier?: number;
    speaker?: Speaker;
    targetSecs?: number;
    transcript?: string;
    metrics?: Record<string, unknown>;
    voice?: Record<string, unknown> | null;
    frame?: string;
    model?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const model = coerceModel(
    body.model?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
  );

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: buildUserPrompt({
        word: body.word ?? "unknown",
        category: body.category ?? "word",
        definition: body.definition ?? "",
        tier: body.tier,
        speaker: body.speaker,
        targetSecs: body.targetSecs ?? 60,
        transcript: body.transcript ?? "",
        metrics: body.metrics ?? {},
        voice: body.voice ?? null,
        frame: body.frame,
      }),
    },
  ];

  let response: Response;
  try {
    response = await callOpenRouter(apiKey, model, messages, true);
    // Not every model on OpenRouter accepts a strict JSON schema. Retry plain.
    if (response.status === 400 || response.status === 404 || response.status === 422) {
      const detail = await response.clone().text();
      if (/response_format|json_schema|structured/i.test(detail)) {
        response = await callOpenRouter(apiKey, model, messages, false);
      }
    }
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
    return NextResponse.json(
      { error: `OpenRouter (${model}): ${message}` },
      { status: response.status },
    );
  }

  let payload: {
    choices?: { message?: { content?: string } }[];
    usage?: {
      cost?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "OpenRouter returned malformed JSON." }, { status: 502 });
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json(
      { error: `${model} did not return usable JSON. Try a different model.` },
      { status: 502 },
    );
  }

  // OpenRouter reports the actual amount charged on every response.
  const usage = payload.usage;
  const cost =
    typeof usage?.cost === "number"
      ? {
          usd: usage.cost,
          basis: `charged by OpenRouter for ${model}`,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
        }
      : null;

  return NextResponse.json({
    evaluation: normalise(parsed as Record<string, unknown>),
    model,
    cost,
  });
}
