# Mind–Mouth

A random word generator drill for the mind-to-mouth connection. You get a word
you have never seen coming, you talk about it for a set time, and then you get
the part that actually makes you better: a verbatim transcript with every
"um", every restart and every freeze marked in place, plus an honest score.

Nothing is stored on a server. Your reps live in `localStorage`.

## How a rep works

1. Hit **Give me a random word**. The word appears, a 3-2-1 runs, the mic opens.
2. Talk until the timer runs out, or stop early (that costs you score).
3. The audio goes to **ElevenLabs Scribe v2** for transcription with word-level
   timestamps and non-speech event tags.
4. Delivery is measured locally from those timestamps — nothing is guessed.
5. The transcript plus the measured numbers go to an **OpenRouter** model, which
   judges the content and writes the coaching notes.
6. You get a blended score, a breakdown, and the marked-up transcript.

Feedback is deliberately short — a verdict, a summary naming the one thing to
change, what worked, and a rewritten opening. A long list of fixes is not
something you can hold in your head while improvising.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the two keys
pnpm dev
```

| Variable | Required | Notes |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | yes | [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys) |
| `OPENROUTER_API_KEY` | yes | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | no | Default model slug, e.g. `deepseek/deepseek-v4-flash-0731` |
| `ELEVENLABS_MODEL_ID` | no | Defaults to `scribe_v2` |
| `ELEVENLABS_LANGUAGE_CODE` | no | ISO-639 code. Unset means auto-detect |
| `ELEVENLABS_USD_PER_HOUR` | no | Rate used to display transcription cost. Defaults to `0.22` |
| `OPENROUTER_SITE_URL` / `OPENROUTER_SITE_NAME` | no | Attribution headers for OpenRouter |

The **Model** field in the app overrides `OPENROUTER_MODEL` per request and is
remembered in `localStorage`, so you can swap models without a restart. Any
OpenRouter slug works. If a model cannot return JSON reliably, the app says so
instead of inventing a grade.

The mic needs a secure context: `localhost` is fine, any other host needs HTTPS.

## Levels and progression

Words are not uniformly random. Every word carries a difficulty tier from 1 to 5,
and you are drawn words at your level.

The pool is **851 words**, each with a one-line definition, split evenly into
five tiers of roughly 170.

**How the tiers were set.** Each word was scored on two published datasets:
[Brysbaert et al. (2014)](https://link.springer.com/article/10.3758/s13428-013-0403-5)
concreteness ratings and [Warriner et al. (2013)](https://github.com/JULIELab/XANEW)
valence and arousal. Speakability is `0.55 × concreteness + 0.45 × emotional pull`
— can you picture it, and do you feel anything about it. Difficulty is the
inverse, split into quintiles.

The datasets grade words; they cannot choose them. Ranking the full 40,000-word
norms by speakability returns violence, disease and profanity at the top, since
the formula rewards emotional extremes. Every word in the pool was chosen by
hand and then validated against the data: all but one are in the norms, and all
but one are known to at least 93% of raters.

The tiers reproduce the source video: `grave`, the word its author speaks
brilliantly on, lands in tier 1. `eliminate`, his demonstration of rambling
badly, lands in tier 4. Tier 5 contains no concrete nouns at all.

| Level | Name | What you get |
| --- | --- | --- |
| 1 | Warm-up | Things you can see and already feel something about |
| 2 | Everyday | Familiar objects and plain feelings |
| 3 | Mixed | Where the abstract starts creeping in |
| 4 | Abstract | Ideas with no picture attached |
| 5 | Cold open | Flat, unglamorous words with nothing to grab |

**Moving up.** Average 72 or better over three reps and you go up a rung.
Average under 40 and you drop one. 70% of draws come from your own tier, 20%
reach one higher (marked **stretch**), 10% drop one lower (**breather**) — a
fixed difficulty gets stale, and an occasional word you are not ready for is the
point of the drill.

Your level is *derived* from your history rather than stored, so it always
agrees with the reps you can see. Delete a rep and the ladder recalculates.

**What the grader knows.** Each evaluation is told your level, the word's tier,
your recent scores, and what it told you to fix last time — so it can say
whether you actually fixed it. Scoring stays absolute: identical takes get
identical scores at every level, or the trend line would mean nothing. Only the
advice is pitched to your level.

## Reading back past reps

Every rep in the panel opens in full — same score ring, metrics, and marked-up
transcript as when you finished it. Word timings are persisted for exactly this
reason, so an old transcript still shows its fillers and pauses in place. Audio
is the one thing not kept; it stays in memory for the current rep only.

Delete a single rep with the **×** on its row, or **clear** to wipe all of them.
Deleting recalculates your level, since the ladder is derived from history.

**Start over** in the header appears whenever you are mid-flow and takes you
back to the beginning — no word, no result, timer and model settings on show.

## Analytics

`/analytics` (linked from the header) is built entirely from the reps in your
history — no extra tracking.

Six trend charts run rep by rep: score, fillers per minute, pace against the
120–175 band, silence, longest clean run, and the difficulty tier of the words
you were handed. Each line is coloured by comparing its first third against its
last third, so a single bad rep does not turn the whole chart red.

Below them, a first-reps-versus-recent-reps table (five a side once you have
twelve reps, three before that), your average score broken down by word tier,
and every filler and crutch you have used, counted.

The difficulty chart is the one to read alongside the others. **A flat score
against rising word tiers is real improvement; a rising score on easy words is
not.**

## Coach review

The **Check with LLM** button on the analytics page sends your log — the summary
numbers, every rep's metrics, and the verbatim transcripts of your ten most
recent reps — to your OpenRouter model for a written read.

It is deliberately not a template. There is no schema, no required "strengths
and weaknesses" sections, and the temperature is higher than the per-rep grader.
The model is told to say what the data actually shows: that you have improved,
that you have not moved, that you have got worse, or that three reps is not a
trend and it cannot tell you anything yet. It is explicitly told not to
manufacture progress to be encouraging, and to watch for numbers that flatter —
a filler rate that only dropped because the takes got shorter, a score that only
rose because the words got easier.

Payload size is capped: the 40 most recent reps, transcripts on the last 10,
each truncated. A 60-rep history comes to roughly 4,800 tokens. The cost of the
review is shown underneath it.

## Cancelling a rep

**Cancel** appears next to **Stop & analyse** while you are recording. It throws
the take away: the mic closes, the audio is dropped, and no request is made to
either provider. A cancelled rep costs nothing and is not saved.

There is also a **Cancel this run** button on the analysing screen. That aborts
the in-flight requests, but a request already received upstream may still be
billed — the recording-phase cancel is the one that guarantees zero spend.

## What a rep costs

Each result shows its own cost, itemised, and the reps panel keeps a running
total across everything in your history.

- **Transcription** is derived, not metered: ElevenLabs returns no charge, so
  the app computes `audio seconds ÷ 3600 × rate` using their published Scribe v2
  price of $0.22 per hour (flat across API tiers as of August 2026). ElevenLabs
  bills per audio minute, so very short takes may round up on your actual
  invoice. Override the rate with `ELEVENLABS_USD_PER_HOUR`.
- **Evaluation** is exact: OpenRouter reports `usage.cost` — the real amount
  charged — on every response, and the app displays that figure with the token
  counts behind it.

A 60-second rep costs roughly $0.0037 to transcribe, plus whatever your chosen
model charges for about a thousand tokens.

## Scoring

100 points, split between what was measured and what was judged:

| Dimension | Points | Source |
| --- | --- | --- |
| Fluency | 25 | Measured — fillers, verbal crutches, restarts, per minute |
| Pacing | 15 | Measured — words per minute, silence ratio, longest freeze, time to first word |
| Relevance | 20 | Model — did the talk stay with the word |
| Structure | 20 | Model — entry, thread, landing |
| Insight | 20 | Model — story, angle, something the listener keeps |

A roughly 26 KB record is kept per rep, so a full 50-rep history is about
1.3 MB. If localStorage ever fills, word timings are dropped from all but the
ten newest reps and the write is retried.

Adjustments:

- Stopping before 80% of the target scales the score down proportionally.
- Under 10 transcribed words scores 0. Silence is not fluency.
- If the model call fails you still get a delivery-only score, clearly labelled,
  and a retry button.

Fillers (`um`, `uh`, `er`, …) are penalised at full weight. Verbal crutches
(`like`, `basically`, `you know`, …) are counted separately at a lower weight,
because some uses of them are legitimate.

## Layout

```
src/
  app/
    page.tsx                  the whole drill: word, timer, states, results
    analytics/page.tsx        trends across every rep, plus the coach review
    preview/page.tsx          results UI rendered from mock data, no API keys needed
    api/transcribe/route.ts   audio  -> ElevenLabs Scribe
    api/evaluate/route.ts     one rep -> OpenRouter, scored
    api/coach/route.ts        whole log -> OpenRouter, free-form review
  components/                 rings, meter, tiles, transcript, history, settings
  hooks/useRecorder.ts        mic capture, hard stop at target, level analyser
  lib/
    metrics.ts                timestamps -> fillers, pauses, pace, repetition
    scoring.ts                measured + judged -> final scorecard
    analytics.ts              history -> trends, comparisons, coach payload
    progression.ts            history -> ladder level
    words.ts                  the random word pool
    storage.ts                localStorage as an external store
```

Visit `/preview` to see the results screen with mock data — useful for checking
the UI without spending API credits.
