/** Shared types for the mind-to-mouth trainer. */

/** A single token from the ElevenLabs Scribe response. */
export type ScribeWord = {
  text: string;
  type: "word" | "spacing" | "audio_event";
  start?: number;
  end?: number;
  logprob?: number;
  speaker_id?: string;
};

export type Transcript = {
  text: string;
  words: ScribeWord[];
  languageCode?: string;
  audioDurationSecs: number;
};

/** One detected disfluency, positioned in the transcript. */
export type Disfluency = {
  kind: "filler" | "crutch" | "stutter";
  text: string;
  /** Index into Transcript.words */
  index: number;
  start?: number;
};

/** A gap of silence between two spoken words. */
export type Pause = {
  start: number;
  end: number;
  duration: number;
  /** "beat" reads as intentional, "hesitation" and "dead-air" do not. */
  severity: "beat" | "hesitation" | "dead-air";
  /** Index of the word that follows the pause. */
  index: number;
};

export type Metrics = {
  durationSecs: number;
  /** Spoken words only, excluding audio events and spacing. */
  wordCount: number;
  /** Words per minute across the whole take. */
  wpm: number;
  /** Words per minute excluding silence — how fast the actual speech is. */
  articulationWpm: number;
  fillers: Disfluency[];
  crutches: Disfluency[];
  stutters: Disfluency[];
  fillersPerMinute: number;
  pauses: Pause[];
  totalSilenceSecs: number;
  silenceRatio: number;
  longestPauseSecs: number;
  /** Seconds of dead air before the first word. */
  timeToFirstWordSecs: number;
  /** Longest stretch (seconds) with no filler and no hesitation pause. */
  longestFluentRunSecs: number;
  /** Unique words / total words. */
  vocabularyDiversity: number;
  /** Words the speaker leaned on most, excluding stopwords. */
  topRepeatedWords: { word: string; count: number }[];
  /** Non-speech events Scribe tagged, e.g. (laughs), (clears throat). */
  audioEvents: string[];
  /** 0-100, computed locally from the numbers above. */
  fluencyScore: number;
  pacingScore: number;
};

/** The qualitative half of the grade, returned by the LLM. */
export type Evaluation = {
  relevanceScore: number;
  structureScore: number;
  insightScore: number;
  verdict: string;
  summary: string;
  strengths: string[];
  betterOpening: string;
};

export type Scorecard = {
  total: number;
  grade: string;
  breakdown: { label: string; score: number; max: number; detail: string }[];
  /** Adjustments and caveats worth showing under the score, e.g. stopped early. */
  notes: string[];
};

/**
 * What one rep cost. The transcription figure is derived from ElevenLabs'
 * published per-hour rate, since their API does not return a charge; the
 * evaluation figure is the actual amount OpenRouter reports charging.
 */
export type RunCost = {
  transcription: { usd: number; basis: string } | null;
  evaluation: {
    usd: number;
    basis: string;
    promptTokens?: number;
    completionTokens?: number;
  } | null;
};

export type Attempt = {
  id: string;
  word: string;
  wordCategory: string;
  wordDefinition: string;
  /** Difficulty tier of the word, 1-5. */
  wordTier: number;
  /** The speaker's ladder level when this rep was recorded. */
  level: number;
  createdAt: number;
  targetSecs: number;
  transcript: Transcript;
  metrics: Metrics;
  evaluation: Evaluation | null;
  scorecard: Scorecard;
  cost: RunCost;
};

/**
 * What is persisted to localStorage. Identical to an attempt — word timings are
 * kept so a past rep can be reopened with its transcript fully marked up — with
 * only the audio left out, which never leaves memory.
 */
export type StoredAttempt = Attempt;
