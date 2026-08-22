"use client";

import { ResultsPanel } from "@/components/ResultsPanel";
import { computeMetrics } from "@/lib/metrics";
import { buildScorecard } from "@/lib/scoring";
import type { ScribeWord } from "@/lib/types";

const SCRIPT: [string, number][] = [
  ["I", 1.9], ["I", 0.1], ["think", 0], ["eliminate", 0.4], ["um", 0.9],
  ["you", 0.5], ["know", 0], ["it's", 0], ["like", 0], ["dodgeball", 0],
  ["someone", 0.3], ["throws", 0], ["a", 0], ["ball", 0], ["at", 0], ["you", 0],
  ["and", 0], ["you", 0], ["get", 0], ["eliminated", 0], ["uh", 2.1],
  ["basically", 0.4], ["that's", 0], ["how", 0], ["game", 0], ["shows", 0],
  ["work", 0], ["too", 0], ["um", 1.4], ["people", 0.6], ["get", 0],
  ["eliminated", 0], ["one", 0], ["by", 0], ["one", 0], ["until", 0],
  ["there's", 0], ["a", 0], ["winner", 0], ["and", 0.2], ["I", 0], ["guess", 0],
  ["that's", 0], ["sort", 0], ["of", 0], ["what", 0], ["life", 0], ["feels", 0],
  ["like", 0], ["sometimes", 0],
];

function mock() {
  const words: ScribeWord[] = [];
  let t = 0;
  SCRIPT.forEach(([text, gap], index) => {
    t += gap;
    if (index > 0) words.push({ text: " ", type: "spacing", start: t, end: t });
    words.push({ text, type: "word", start: t, end: t + 0.34 });
    t += 0.34 + 0.05;
  });
  words.push({ text: "(clears throat)", type: "audio_event", start: 6.2, end: 6.6 });

  const transcript = {
    text: SCRIPT.map(([text]) => text).join(" "),
    words,
    audioDurationSecs: t + 0.8,
  };
  const metrics = computeMetrics(transcript);
  const evaluation = {
    relevanceScore: 68,
    structureScore: 52,
    insightScore: 45,
    verdict: "You circled dodgeball instead of landing a point.",
    summary:
      "You found a concrete image fast, which is the hard part, but then stayed inside it. The dodgeball and game-show examples say the same thing twice, and the take ends on a shrug rather than a claim.",
    strengths: [
      "Reached for a concrete image within four seconds — dodgeball is a good instinct.",
      "The final line gestures at a real idea about life, even if it arrives late.",
    ],
    betterOpening:
      "Elimination is the only word in sport that means the same thing in life: one moment decides whether you keep playing.",
  };

  return {
    id: "preview",
    word: "eliminate",
    wordCategory: "action",
    wordDefinition: "to remove something completely",
    wordTier: 4,
    level: 3,
    createdAt: Date.now(),
    targetSecs: 60,
    transcript,
    metrics,
    evaluation,
    scorecard: buildScorecard(metrics, evaluation, 60),
    cost: {
      transcription: { usd: 0.0018, basis: "29.4s of audio at $0.22/hour" },
      evaluation: {
        usd: 0.00042,
        basis: "charged by OpenRouter",
        promptTokens: 890,
        completionTokens: 320,
      },
    },
  };
}

export default function Preview() {
  const attempt = mock();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <ResultsPanel
        attempt={attempt}
        audioUrl={null}
        evaluationError={null}
        progress={{
          level: 3,
          name: "Mixed",
          blurb: "Where the abstract starts creeping in",
          windowScores: [58, 64],
          average: 61,
          repsToDecision: 1,
          movement: "promoted",
          progressToNext: 0.85,
        }}
        onAgain={() => {}}
      />
    </main>
  );
}
