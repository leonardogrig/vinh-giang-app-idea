"use client";

import { DEFAULT_OPENROUTER_MODEL } from "./config";
import { FRAME_SETTINGS, type FrameSetting } from "./frame";
import type { Attempt, StoredAttempt } from "./types";

const HISTORY_KEY = "mind-mouth:history:v1";
const SETTINGS_KEY = "mind-mouth:settings:v1";
const HISTORY_LIMIT = 50;

export type Settings = { targetSecs: number; model: string; frame: FrameSetting };

export const DEFAULT_SETTINGS: Settings = {
  targetSecs: 60,
  model: DEFAULT_OPENROUTER_MODEL,
  frame: "auto",
};

const EMPTY_HISTORY: StoredAttempt[] = [];

/**
 * Keep the word timings so a past rep reopens fully marked up, but drop the
 * fields nothing renders (logprob, speaker, per-character timings) — they are
 * most of the payload and none of the value.
 */
export function toStored(attempt: Attempt): StoredAttempt {
  return {
    ...attempt,
    transcript: {
      ...attempt.transcript,
      words: attempt.transcript.words.map(({ text, type, start, end }) => ({
        text,
        type,
        start,
        end,
      })),
    },
  };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Out of quota. Word timings are the bulk of the payload, so drop them from
    // all but the ten newest reps and try once more before giving up.
    if (!Array.isArray(value)) return;
    try {
      const trimmed = value.map((item, index) =>
        index < 10 || !item?.transcript
          ? item
          : { ...item, transcript: { ...item.transcript, words: [] } },
      );
      window.localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {
      // Private mode or genuinely full — persistence is a convenience.
    }
  }
}

/**
 * A tiny external store so localStorage can be read through useSyncExternalStore
 * rather than a mount effect, which keeps hydration honest: the server snapshot
 * is always empty and React swaps in the real values after hydration.
 */
function createStore<T>(key: string, fallback: T, serverSnapshot: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();

  const getSnapshot = () => {
    if (cache === null) {
      const loaded = read<T>(key, fallback);
      cache = loaded;
    }
    return cache;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    set(next: T) {
      cache = next;
      write(key, next);
      for (const listener of listeners) listener();
    },
    reset() {
      cache = fallback;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
      for (const listener of listeners) listener();
    },
  };
}

const historyStore = createStore<StoredAttempt[]>(HISTORY_KEY, EMPTY_HISTORY, EMPTY_HISTORY);
const settingsStore = createStore<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, DEFAULT_SETTINGS);

export const historySource = {
  subscribe: historyStore.subscribe,
  getSnapshot: historyStore.getSnapshot,
  getServerSnapshot: historyStore.getServerSnapshot,
};

export const settingsSource = {
  subscribe: settingsStore.subscribe,
  getSnapshot: settingsStore.getSnapshot,
  getServerSnapshot: settingsStore.getServerSnapshot,
};

/** Latest settings outside of render, for use inside async handlers. */
export function readSettings(): Settings {
  const stored = settingsStore.getSnapshot();
  return {
    targetSecs: Number(stored?.targetSecs) || DEFAULT_SETTINGS.targetSecs,
    model:
      typeof stored?.model === "string" && stored.model.trim()
        ? stored.model.trim()
        : DEFAULT_SETTINGS.model,
    frame: FRAME_SETTINGS.includes(stored?.frame as FrameSetting)
      ? stored.frame
      : DEFAULT_SETTINGS.frame,
  };
}

export function saveSettings(next: Settings) {
  settingsStore.set(next);
}

export function saveAttempt(attempt: Attempt) {
  const stored = toStored(attempt);
  const previous = historyStore.getSnapshot();
  historyStore.set([stored, ...previous.filter((item) => item.id !== attempt.id)].slice(0, HISTORY_LIMIT));
}

export function deleteAttempt(id: string) {
  historyStore.set(historyStore.getSnapshot().filter((item) => item.id !== id));
}

export function clearHistory() {
  historyStore.reset();
}
