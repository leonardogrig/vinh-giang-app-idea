"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FrameStrip } from "@/components/FrameStrip";
import { HistoryPanel } from "@/components/HistoryPanel";
import { LevelBadge } from "@/components/LevelBadge";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SettingsBar } from "@/components/SettingsBar";
import { TimerRing } from "@/components/Rings";
import { WaveMeter } from "@/components/WaveMeter";
import { useRecorder, type Recording } from "@/hooks/useRecorder";
import { frameModeFor, type FrameMode } from "@/lib/frame";
import { MIN_SCORABLE_WORDS, computeMetrics, metricsForPrompt } from "@/lib/metrics";
import { prosodyForPrompt, type Prosody } from "@/lib/prosody";
import { buildScorecard } from "@/lib/scoring";
import { deriveProgress } from "@/lib/progression";
import { decodeRecording, measureVoice } from "@/lib/voice";
import { CATEGORY_LABEL, TIER_LABEL, randomWord, type WordCard } from "@/lib/words";
import { formatClock, formatRelativeTime } from "@/lib/format";
import {
  clearHistory,
  deleteAttempt,
  historySource,
  readSettings,
  saveAttempt,
  saveSettings,
  settingsSource,
  type Settings,
} from "@/lib/storage";
import type { Attempt, Evaluation, RunCost, StoredAttempt, Transcript } from "@/lib/types";

type Phase = "idle" | "ready" | "recording" | "working" | "results";
type Step = "transcribing" | "grading";

/** Seconds allowed past the target so nobody is cut off mid-sentence. */
const GRACE_SECS = 10;

async function readError(response: Response) {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
}

export default function Home() {
  const settings = useSyncExternalStore(
    settingsSource.subscribe,
    settingsSource.getSnapshot,
    settingsSource.getServerSnapshot,
  );
  const history = useSyncExternalStore(
    historySource.subscribe,
    historySource.getSnapshot,
    historySource.getServerSnapshot,
  );

  const progress = useMemo(() => deriveProgress(history), [history]);
  /** How much of the Picture → Moment → Point frame this rep gets. */
  const frameMode = useMemo(
    () => frameModeFor(progress.level, settings.frame),
    [progress.level, settings.frame],
  );

  const [autoStart, setAutoStart] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [word, setWord] = useState<WordCard | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [arming, setArming] = useState(false);
  const [step, setStep] = useState<Step>("transcribing");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  /** A past rep being read back in full. Null means we are in the live flow. */
  const [viewing, setViewing] = useState<StoredAttempt | null>(null);

  const recordingRef = useRef<Recording | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const updateSettings = useCallback((next: Settings) => {
    saveSettings(next);
  }, []);

  const setAudio = useCallback((blob: Blob | null) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    audioUrlRef.current = url;
    setAudioUrl(url);
  }, []);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  /** Ask the model for the qualitative half of the grade. */
  const grade = useCallback(
    async (
      current: WordCard,
      transcript: Transcript,
      metrics: ReturnType<typeof computeMetrics>,
      prosody: Prosody | null,
      frame: FrameMode,
      signal?: AbortSignal,
    ): Promise<{
      evaluation: Evaluation | null;
      error: string | null;
      cost: RunCost["evaluation"];
    }> => {
      if (metrics.wordCount < MIN_SCORABLE_WORDS) {
        return { evaluation: null, error: null, cost: null };
      }

      const response = await fetch("/api/evaluate", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: current.word,
          category: CATEGORY_LABEL[current.category],
          definition: current.definition,
          tier: current.tier,
          speaker: {
            level: progress.level,
            levelName: progress.name,
            recentScores: progress.windowScores,
            totalReps: history.length,
            lastRepVerdict: history[0]?.evaluation?.verdict ?? null,
          },
          targetSecs: readSettings().targetSecs,
          transcript: transcript.text,
          metrics: metricsForPrompt(metrics),
          voice: prosody ? prosodyForPrompt(prosody) : null,
          frame,
          model: readSettings().model,
        }),
      });

      if (!response.ok) {
        return { evaluation: null, error: await readError(response), cost: null };
      }
      const body = await response.json();
      return {
        evaluation: (body.evaluation as Evaluation) ?? null,
        error: null,
        cost: (body.cost as RunCost["evaluation"]) ?? null,
      };
    },
    [history, progress.level, progress.name, progress.windowScores],
  );

  const commit = useCallback((next: Attempt) => {
    setAttempt(next);
    saveAttempt(next);
  }, []);

  const analyse = useCallback(
    async (recording: Recording) => {
      const current = word;
      if (!current) return;

      setPhase("working");
      setStep("transcribing");
      setFatalError(null);
      setEvaluationError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      // Decode the take locally while the transcription round-trip runs; the
      // voice reading itself waits for the word timings, which it uses for pace.
      const decoding = decodeRecording(recording.blob);

      const form = new FormData();
      form.append("audio", recording.blob, recording.filename);
      form.append("durationSecs", String(recording.durationSecs));

      let transcript: Transcript;
      let transcriptionCost: RunCost["transcription"] = null;
      try {
        const response = await fetch("/api/transcribe", { method: "POST", body: form, signal });
        if (!response.ok) {
          setFatalError(await readError(response));
          return;
        }
        const body = await response.json();
        transcript = body.transcript as Transcript;
        transcriptionCost = (body.cost as RunCost["transcription"]) ?? null;
      } catch (error) {
        if (signal.aborted) return;
        setFatalError(`Transcription request failed: ${(error as Error).message}`);
        return;
      }

      if (!transcript.audioDurationSecs) {
        transcript.audioDurationSecs = recording.durationSecs;
      }

      const metrics = computeMetrics(transcript);
      const prosody = await measureVoice(await decoding, transcript.words);
      if (signal.aborted) return;
      setStep("grading");

      let evaluation: Evaluation | null = null;
      let error: string | null = null;
      let evaluationCost: RunCost["evaluation"] = null;
      try {
        ({ evaluation, error, cost: evaluationCost } = await grade(
          current,
          transcript,
          metrics,
          prosody,
          frameMode,
          signal,
        ));
      } catch (err) {
        if (signal.aborted) return;
        error = `Grading request failed: ${(err as Error).message}`;
      }

      if (signal.aborted) return;
      setEvaluationError(error);
      commit({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        word: current.word,
        wordCategory: CATEGORY_LABEL[current.category],
        wordDefinition: current.definition,
        wordTier: current.tier,
        level: progress.level,
        createdAt: Date.now(),
        targetSecs: readSettings().targetSecs,
        transcript,
        metrics,
        prosody,
        frame: frameMode,
        evaluation,
        scorecard: buildScorecard(metrics, evaluation, readSettings().targetSecs, prosody),
        cost: { transcription: transcriptionCost, evaluation: evaluationCost },
      });
      setPhase("results");
    },
    [commit, frameMode, grade, progress.level, word],
  );

  const onComplete = useCallback(
    (recording: Recording) => {
      recordingRef.current = recording;
      setAudio(recording.blob);
      void analyse(recording);
    },
    [analyse, setAudio],
  );

  const recorder = useRecorder({
    maxSecs: settings.targetSecs,
    graceSecs: GRACE_SECS,
    onComplete,
  });

  /** Past the target but inside the grace window — the finish-your-thought zone. */
  const overtime = phase === "recording" && recorder.elapsed >= settings.targetSecs;

  // Depend on the stable start callback, not the recorder object, which is
  // rebuilt on every tick of the timer and would restart the countdown.
  const startRecorder = recorder.start;
  const cancelRecording = recorder.cancel;

  const beginRecording = useCallback(async () => {
    setArming(false);
    setCountdown(null);
    const started = await startRecorder();
    setPhase(started ? "recording" : "ready");
  }, [startRecorder]);

  // 3-2-1 before the mic opens, so the word lands cold but the take is clean.
  useEffect(() => {
    if (!arming) return;
    let remaining = 3;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        void beginRecording();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [arming, beginRecording]);

  const newWord = useCallback(() => {
    const recent = [
      ...(word ? [word.word] : []),
      ...history.slice(0, 25).map((item) => item.word),
    ];
    setWord(randomWord({ level: progress.level, recent }));
    setAttempt(null);
    setAudio(null);
    setFatalError(null);
    setEvaluationError(null);
    recordingRef.current = null;
    setPhase("ready");
    setCountdown(autoStart ? 3 : null);
    setArming(autoStart);
  }, [autoStart, history, progress.level, setAudio, word]);

  const cancelArming = useCallback(() => {
    setArming(false);
    setCountdown(null);
  }, []);

  /**
   * Abandon the rep. During recording the audio never leaves the browser;
   * during analysis the in-flight requests are aborted. A request already
   * received upstream may still be billed, so the recording-phase cancel is
   * the one that guarantees nothing is spent.
   */
  const retryTranscription = useCallback(() => {
    if (recordingRef.current) void analyse(recordingRef.current);
  }, [analyse]);

  const retryGrading = useCallback(async () => {
    if (!attempt) return;
    setEvaluationError(null);
    const category = (Object.keys(CATEGORY_LABEL) as WordCard["category"][]).find(
      (key) => CATEGORY_LABEL[key] === attempt.wordCategory,
    );
    const { evaluation, error, cost: evaluationCost } = await grade(
      {
        word: attempt.word,
        category: category ?? "abstract",
        definition: attempt.wordDefinition,
        tier: attempt.wordTier,
      },
      attempt.transcript,
      attempt.metrics,
      attempt.prosody ?? null,
      attempt.frame ?? "none",
    );
    setEvaluationError(error);
    if (evaluation) {
      commit({
        ...attempt,
        evaluation,
        scorecard: buildScorecard(
          attempt.metrics,
          evaluation,
          attempt.targetSecs,
          attempt.prosody ?? null,
        ),
        cost: { ...attempt.cost, evaluation: evaluationCost },
      });
    }
  }, [attempt, commit, grade]);

  const wipeHistory = useCallback(() => {
    clearHistory();
  }, []);

  const removeAttempt = useCallback(
    (id: string) => {
      deleteAttempt(id);
      setViewing((current) => (current?.id === id ? null : current));
    },
    [],
  );

  const openAttempt = useCallback((attempt: StoredAttempt) => {
    setViewing(attempt);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /** Back to the very beginning: no word, no result, settings on show. */
  const startOver = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelRecording();
    setViewing(null);
    setArming(false);
    setCountdown(null);
    setWord(null);
    setAttempt(null);
    setAudio(null);
    setFatalError(null);
    setEvaluationError(null);
    recordingRef.current = null;
    setPhase("idle");
  }, [cancelRecording, setAudio]);

  const busy = phase === "recording" || phase === "working";
  const heading = useMemo(() => {
    if (phase === "recording") return overtime ? "Land it." : "Talk.";
    if (phase === "working") return "Reading you back.";
    if (phase === "results") return "Here is how that went.";
    return "Say something about";
  }, [phase, overtime]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-medium tracking-tight">
            Mind<span className="text-flame-400">–</span>Mouth
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-400">
            Random word, no warning, {formatClock(settings.targetSecs)} of talking. Then a verbatim
            read of every &ldquo;um&rdquo;, every freeze, and an honest score. It is all in the reps.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <Link
            href="/analytics"
            className="rounded-xl border border-ink-700 px-4 py-2 text-xs text-ink-300 transition hover:border-flame-500/50 hover:text-flame-200"
          >
            Analytics
          </Link>
          {(phase !== "idle" || viewing) && (
            <button
              onClick={startOver}
              title="Back to the start, with the timer and model settings"
              className="rounded-xl border border-ink-700 px-4 py-2 text-xs text-ink-300 transition hover:border-flame-500/50 hover:text-flame-200"
            >
              Start over
            </button>
          )}
          <LevelBadge progress={progress} />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {viewing && (
            <>
              <section className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-flame-500/30 bg-flame-500/[0.06] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-flame-300">
                  Reading back a past rep · {formatRelativeTime(viewing.createdAt)}
                </p>
                <button
                  onClick={() => setViewing(null)}
                  className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:text-ink-100"
                >
                  Back to the drill
                </button>
              </section>

              <ResultsPanel
                attempt={viewing}
                audioUrl={null}
                evaluationError={null}
                progress={progress}
                againLabel="Back to the drill"
                onAgain={() => setViewing(null)}
              />
            </>
          )}

          {!viewing && phase === "idle" && (
            <SettingsBar
              settings={settings}
              autoStart={autoStart}
              onChange={updateSettings}
              onAutoStartChange={setAutoStart}
              disabled={busy}
            />
          )}

          {!viewing && (phase === "idle" || phase === "ready" || phase === "recording") && (
            <section
              className={`animate-rise rounded-3xl border bg-ink-900/60 p-8 text-center transition-colors duration-300 ${
                overtime ? "border-rose-500/60 shadow-[0_0_40px_-12px_rgba(244,63,94,0.5)]" : "border-ink-800"
              }`}
            >
              <p
                className={`text-xs uppercase tracking-[0.24em] ${
                  overtime ? "text-rose-300" : "text-ink-400"
                }`}
              >
                {heading}
              </p>

              {word ? (
                <div className="mt-4">
                  <h2 className="text-5xl font-medium tracking-tight text-flame-300 sm:text-6xl">
                    {word.word}
                  </h2>
                  <div className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em]">
                    <span className="text-ink-400">{CATEGORY_LABEL[word.category]}</span>
                    <span className="text-ink-700">·</span>
                    <span
                      className={
                        word.tier > progress.level
                          ? "text-rose-300"
                          : word.tier < progress.level
                            ? "text-emerald-300/70"
                            : "text-ink-400"
                      }
                      title={`Difficulty tier ${word.tier} of 5 — ${TIER_LABEL[word.tier]}`}
                    >
                      {word.tier > progress.level
                        ? "stretch"
                        : word.tier < progress.level
                          ? "breather"
                          : TIER_LABEL[word.tier]}
                    </span>
                  </div>
                  <p className="mx-auto mt-4 max-w-sm border-t border-ink-800 pt-4 text-sm leading-relaxed text-ink-300">
                    {word.definition}
                  </p>
                  {(phase === "ready" || phase === "recording") && (
                    <FrameStrip
                      mode={frameMode}
                      live={phase === "recording"}
                      elapsed={recorder.elapsed}
                      target={settings.targetSecs}
                    />
                  )}
                </div>
              ) : (
                <p className="mt-4 text-5xl font-medium tracking-tight text-ink-700">?????</p>
              )}

              {phase === "recording" && (
                <div className="mt-8 flex flex-col items-center gap-5">
                  <TimerRing
                    elapsed={recorder.elapsed}
                    target={settings.targetSecs}
                    grace={GRACE_SECS}
                  />

                  {overtime ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="animate-urgent rounded-full bg-rose-500/20 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-rose-200 ring-1 ring-rose-500/50">
                        wrap up
                      </span>
                      <p className="text-xs text-rose-300/80">
                        Time is up. Finish the sentence you are in.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-500">
                      You get {GRACE_SECS}s past the buzzer to land your point.
                    </p>
                  )}
                  <div className="w-full max-w-md">
                    <WaveMeter analyser={recorder.analyser} active />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={recorder.stop}
                      className="rounded-xl bg-flame-500 px-6 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-flame-400"
                    >
                      Stop &amp; analyse
                    </button>
                    <button
                      onClick={startOver}
                      title="Throw the take away. Nothing is sent to ElevenLabs or OpenRouter."
                      className="rounded-xl border border-ink-700 px-6 py-2.5 text-sm text-ink-300 transition hover:border-rose-400/50 hover:text-rose-200"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-500">
                    Cancel discards the audio without sending it anywhere.
                  </p>
                </div>
              )}

              {phase === "ready" && countdown !== null && (
                <div className="mt-8">
                  <span className="font-mono text-6xl tabular-nums text-ink-100">
                    {countdown === 0 ? "go" : countdown}
                  </span>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ink-400">
                    mic opens in a moment
                  </p>
                  <div className="mt-4 flex justify-center gap-4 text-xs text-ink-400">
                    <button
                      onClick={() => void beginRecording()}
                      className="underline-offset-2 transition hover:text-flame-300 hover:underline"
                    >
                      start now
                    </button>
                    <button
                      onClick={cancelArming}
                      className="underline-offset-2 transition hover:text-ink-100 hover:underline"
                    >
                      hold on
                    </button>
                  </div>
                </div>
              )}

              {phase === "ready" && countdown === null && (
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => void beginRecording()}
                    className="rounded-xl bg-flame-500 px-7 py-3 text-sm font-medium text-ink-950 transition hover:bg-flame-400"
                  >
                    Start speaking
                  </button>
                  <button
                    onClick={startOver}
                    className="rounded-xl border border-ink-700 px-5 py-3 text-sm text-ink-300 transition hover:text-ink-100"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {phase === "idle" && (
                <button
                  onClick={newWord}
                  className="mt-8 rounded-xl bg-flame-500 px-7 py-3 text-sm font-medium text-ink-950 transition hover:bg-flame-400"
                >
                  Give me a random word
                </button>
              )}

              {recorder.error && (
                <p className="mx-auto mt-5 max-w-md rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {recorder.error}
                </p>
              )}
            </section>
          )}

          {!viewing && phase === "working" && (
            <section className="animate-rise rounded-3xl border border-ink-800 bg-ink-900/60 p-8">
              <p className="text-xs uppercase tracking-[0.24em] text-ink-400">{heading}</p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-flame-300">
                {word?.word}
              </h2>
              {word && <p className="mt-1 text-sm text-ink-400">{word.definition}</p>}

              <ul className="mt-6 space-y-3">
                {[
                  { key: "transcribing", label: "Transcribing with ElevenLabs Scribe" },
                  { key: "voice", label: "Reading pitch and loudness on this device" },
                  { key: "grading", label: `Grading with ${settings.model}` },
                ].map((row) => {
                  // The voice reading runs alongside transcription, so the two
                  // rows share a state.
                  const stage = row.key === "voice" ? "transcribing" : row.key;
                  const active = step === stage;
                  const done = step === "grading" && stage === "transcribing";
                  return (
                    <li key={row.key} className="flex items-center gap-3 text-sm">
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                          done
                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                            : active
                              ? "border-flame-400/60 bg-flame-500/15 text-flame-300"
                              : "border-ink-700 text-ink-600"
                        }`}
                      >
                        {done ? "✓" : active ? "•" : ""}
                      </span>
                      <span className={active || done ? "text-ink-100" : "text-ink-500"}>
                        {row.label}
                      </span>
                      {active && (
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-ink-800">
                          <span className="block h-full w-1/2 animate-pulse rounded-full bg-flame-400" />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={startOver}
                className="mt-6 rounded-lg border border-ink-700 px-4 py-1.5 text-xs text-ink-400 transition hover:border-rose-400/50 hover:text-rose-200"
              >
                Cancel this run
              </button>

              {fatalError && (
                <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                  <p className="text-sm text-rose-200">{fatalError}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={retryTranscription}
                      className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-500/15"
                    >
                      Retry
                    </button>
                    <button
                      onClick={newWord}
                      className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-850"
                    >
                      New word
                    </button>
                  </div>
                  {audioUrl && <audio controls src={audioUrl} className="mt-3 h-9 w-full max-w-xs" />}
                </div>
              )}
            </section>
          )}

          {!viewing && phase === "results" && attempt && (
            <ResultsPanel
              attempt={attempt}
              audioUrl={audioUrl}
              evaluationError={evaluationError}
              progress={progress}
              onRetry={() => void retryGrading()}
              onAgain={newWord}
            />
          )}
        </div>

        <HistoryPanel
          history={history}
          activeId={viewing?.id ?? null}
          onClear={wipeHistory}
          onDelete={removeAttempt}
          onOpen={openAttempt}
        />
      </div>

      <footer className="mt-12 border-t border-ink-800 pt-6 text-xs leading-relaxed text-ink-500">
        Based on the random word generator drill for strengthening the mind-to-mouth connection.
        Nothing leaves your browser except the audio sent for transcription and the transcript sent
        for grading. Your reps are stored locally.
      </footer>
    </main>
  );
}
