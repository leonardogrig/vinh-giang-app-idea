# Mind–Mouth

A random word generator drill for the mind-to-mouth connection. You get a word
you have never seen coming, you talk about it for a set time, and then you get
the part that actually makes you better: a verbatim transcript with every
"um", every restart and every freeze marked in place, plus an honest score.

Nothing is stored on a server. Your reps live in `localStorage`.

Based on this video by Vinh Giang:
[youtube.com/watch?v=aUBPWT-D5_U](https://www.youtube.com/watch?v=aUBPWT-D5_U)

## How a rep works

1. Hit **Give me a random word**. The word appears, a 3-2-1 runs, the mic opens.
   At the lower levels a three-beat frame sits under the word — see
   [The frame](#the-frame). There is no thinking time; that would train a
   different skill.
2. Talk until the timer runs out, or stop early (that costs you score).
3. The audio goes to **ElevenLabs Scribe v2** for transcription with word-level
   timestamps and non-speech event tags. At the same time, the raw audio is
   read on your own device for [vocal variety](#vocal-variety) — pitch,
   loudness and pace movement. That part never leaves the browser.
4. Delivery is measured locally from the timestamps — nothing is guessed.
5. The transcript plus every measured number go to an **OpenRouter** model,
   which judges the content and writes the coaching notes.
6. You get a blended score, a breakdown, the voice contour, and the marked-up
   transcript.

Feedback is deliberately short — a verdict, a summary naming the one thing to
change, what worked, and a rewritten opening. A long list of fixes is not
something you can hold in your head while improvising.

## Running it on your computer

No coding needed — you copy and paste a few commands. Anything in a grey box is
typed into a **terminal**: on a Mac press `Cmd + Space`, type "Terminal", press
Enter. On Windows, open "PowerShell" from the Start menu. Type one line, press
Enter, wait for it to finish, then move to the next.

Budget about fifteen minutes the first time. After that, starting the app is one
command.

### 1. Install Node.js

Node.js is the engine the app runs on. Download the **LTS** version from
[nodejs.org](https://nodejs.org) and install it like any other program.

Check it worked — this should print a version number:

```bash
node -v
```

### 2. Install pnpm

pnpm fetches the pieces the app is built from:

```bash
npm install -g pnpm
```

### 3. Open the project folder

Type `cd `, with a space after it, then drag the project folder from Finder (or
File Explorer) onto the terminal window — it fills in the path for you. Press
Enter.

```bash
cd /path/to/vinh-giang-idea-app
```

### 4. Install the app's pieces

```bash
pnpm install
```

This takes a minute or two and prints a lot of text. That is normal.

### 5. Get your two API keys

The app uses two paid services. Both charge per use, not monthly, and a minute
of practice costs well under a cent (see [What a rep costs](#what-a-rep-costs)).
Both will ask for a card.

- **ElevenLabs** turns your recording into text. Sign up, then copy a key from
  [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys).
- **OpenRouter** is the AI that grades what you said. Sign up, add a few dollars
  of credit, then create a key at [openrouter.ai/keys](https://openrouter.ai/keys).

Keep both keys somewhere handy for the next step. Treat them like passwords —
anyone who has them can spend your money.

### 6. Put the keys in a settings file

```bash
cp .env.example .env.local
```

That creates a file called `.env.local` in the project folder. Open it in any
text editor and paste each key after the `=` sign, with no quotes and no spaces:

```
ELEVENLABS_API_KEY=your-elevenlabs-key-here
OPENROUTER_API_KEY=your-openrouter-key-here
```

Save the file. `.env.local` is ignored by git, so your keys never leave your
computer.

### 7. Start it

```bash
pnpm dev
```

Leave that terminal window open — closing it stops the app. Now open
**http://localhost:3000** in your browser. Your browser will ask for microphone
permission the first time; say yes.

To stop the app, click the terminal window and press `Ctrl + C`. To start it
again another day, you only need steps 3 and 7.

### Every setting you can change

Only the first two are required; the rest have sensible defaults and can be left
alone.

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

### When something goes wrong

- **`command not found: pnpm`** — step 2 did not take. Close the terminal, open
  a fresh one, and run it again.
- **The page says a key is missing** — check `.env.local` for stray quotes or
  spaces, then stop the app with `Ctrl + C` and run `pnpm dev` again. Changes to
  that file only take effect on a restart.
- **The mic does not open** — the browser only allows microphone access on
  `localhost` or over HTTPS. If you opened `127.0.0.1` or your computer's IP
  address, use `http://localhost:3000` instead.
- **"Port 3000 is in use"** — the app is already running in another terminal
  window. Use that one, or close it first.

## Practising on your phone

The app runs on your computer, but you can talk into your phone instead — often
easier, since you can stand up and move while you speak. A tunnel gives your
local app a temporary public web address your phone can open.

Install the tunnel tool once. On a Mac, with
[Homebrew](https://brew.sh):

```bash
brew install cloudflared
```

On Windows, download `cloudflared` from
[Cloudflare's install page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

Then, with the app already running (`pnpm dev` in one terminal window), open a
**second** terminal window and run:

```bash
cloudflared tunnel --url http://localhost:3000
```

After a few seconds it prints a box containing an address ending in
`.trycloudflare.com`. Open that address on your phone — the mic works there
because the address is HTTPS.

Worth knowing:

- Keep both terminal windows open. Closing the tunnel one kills the address.
- You get a **new, random address every time** you start the tunnel. It is not
  a permanent link.
- The address is public while it is running. Anyone who has it can reach your
  app and spend your API credit, so do not post it anywhere. Press `Ctrl + C`
  in that window when you are done.
- Your practice history lives in the browser you use, so reps done on your
  phone will not appear on your computer, and vice versa.

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
your recent scores, what it told you to fix last time, which frame was on
screen, and the voice reading — so it can say whether you actually fixed it.
Scoring stays absolute: identical takes get identical scores at every level, or
the trend line would mean nothing. Only the advice is pitched to your level.

## The frame

The word appears and the mic opens. Nobody gets ten seconds to think first,
because the point of the drill is the gap between thought and speech, and prep
time closes that gap for you instead of training it. It also tends to backfire:
the research on speaking anxiety is fairly consistent that the anticipation
window, not the speaking, is where people spiral.

What you get instead, at the lower levels, is a shape to pour the take into:

| Beat | Meant to take | What it asks |
| --- | --- | --- |
| **Picture** | first 20% | The first specific thing the word makes you see. An image, not a definition |
| **Moment** | middle 50% | One time it showed up in your life. Who was there, what happened |
| **Point** | last 30% | What that moment taught you, or what you believe about it now |

It fades as you climb, so it is scaffolding rather than a crutch:

| Level | What is on screen |
| --- | --- |
| 1 | All three beats with their hints, and the beat the clock says you should be in lights up as you talk |
| 2 | Beats and hints, no clock |
| 3 | The three words only |
| 4–5 | Nothing |

The **Frame** switch next to the timer overrides this: **auto** follows the
ladder, **on** always shows the guided version, **off** never shows any. Each
rep records which frame it had, and the grader is told, so it can weigh a
self-built structure at level 4 more than a followed one at level 1.

## Vocal variety

The transcript tells you what you said and when. It cannot tell you that you
said it in a monotone. So after every take the app decodes the recording in
your browser and reads the audio itself — a pitch track, a loudness track,
and, from the word timestamps, how much your pace moved. It runs in well under
a second and the audio never goes anywhere for this; the only upload is still
the one to ElevenLabs.

What it measures:

- **Pitch movement** — the spread of your pitch over voiced speech, in
  semitones around your own median, so a deep voice and a high one compare
  fairly. Conversational speech sits around 2–3 semitones; under 1.5 reads as
  a monotone; over 3.5 is expressive. The headline number.
- **Loudness swing** — the spread of speech loudness in dB. The browser's
  microphone auto-gain smooths this a little, so it is weighted lower.
- **Pace swing** — how much your local words-per-minute varied across
  three-second windows. A speaker who never changes gear scores low here.
- **Flattest stretch** — the longest run of seconds where the pitch barely
  moved. Anything past eight seconds starts costing points.
- **By thirds** — each of those for the opening, middle and closing of the
  take, so a voice that fades at the end shows up as a number and not just a
  feeling.

The result card draws the contour: pitch as a line around your median,
loudness as the shape behind it, with the thirds marked. The four numbers sit
underneath. The grader gets all of it, split by thirds, and is told the scale.

Variety is worth 10 points of the score. It is not a native-accent score and
never will be — nothing here compares you to anyone but yourself.

The pitch tracker is a plain YIN implementation over 8 kHz audio, checked
against synthetic tones (a 12-semitone glide measures 3.47 st against a
theoretical 3.46) and a spread of speech synthesiser voices from robotic
monotone to sing-song. Thresholds live in one block at the top of
`src/lib/prosody.ts` if you want to move them.

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

Eight trend charts run rep by rep: score, fillers per minute, pace against the
120–175 band, silence, longest clean run, the difficulty tier of the words you
were handed, vocal variety, and pitch movement against the 2.5–4 semitone band.
Each line is coloured by comparing its first third against its last third, so a
single bad rep does not turn the whole chart red.

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

Split between what was measured and what was judged, then normalised to 100
over whichever rows are present — a rep without a voice reading or without a
model evaluation still lands on the same scale:

| Dimension | Weight | Source |
| --- | --- | --- |
| Fluency | 25 | Measured — fillers, verbal crutches, restarts, per minute |
| Pacing | 15 | Measured — words per minute, silence ratio, longest freeze, time to first word |
| Variety | 10 | Measured on your device — pitch movement, loudness swing, pace swing, flat stretches |
| Relevance | 20 | Model — did the talk stay with the word |
| Structure | 20 | Model — entry, thread, landing |
| Insight | 20 | Model — story, angle, something the listener keeps |

A roughly 30 KB record is kept per rep, so a full 50-rep history is about
1.5 MB. If localStorage ever fills, word timings are dropped from all but the
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
