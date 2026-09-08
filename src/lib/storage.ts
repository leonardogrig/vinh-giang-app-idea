"use client";

import { FRAME_SETTINGS, type FrameSetting } from "./frame";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import type { Attempt, StoredAttempt } from "./types";

export type { Settings };
export { DEFAULT_SETTINGS };

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

/**
 * An external store, read through useSyncExternalStore, now backed by the
 * Postgres API instead of localStorage. The cache is hydrated asynchronously on
 * first use: the server snapshot (and the pre-load client snapshot) is the
 * fallback, and React swaps in the real values once the fetch resolves. Writes
 * update the cache optimistically and persist in the background — the UI stays
 * fully synchronous, exactly as it was with localStorage.
 */
function createStore<T>(fallback: T, load: () => Promise<T>) {
  let cache: T = fallback;
  let loaded = false;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const ensureLoaded = () => {
    if (loaded || loading || typeof window === "undefined") return;
    loading = load()
      .then((value) => {
        cache = value;
        loaded = true;
        notify();
      })
      .catch(() => {
        // Leave the fallback in place; persistence is best-effort.
      })
      .finally(() => {
        loading = null;
      });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      ensureLoaded();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => cache,
    getServerSnapshot: () => fallback,
    get: () => cache,
    set(next: T) {
      cache = next;
      loaded = true;
      notify();
    },
  };
}

async function loadHistory(): Promise<StoredAttempt[]> {
  const response = await fetch("/api/history", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load history");
  const data = await response.json();
  return Array.isArray(data) ? (data as StoredAttempt[]) : EMPTY_HISTORY;
}

async function loadSettings(): Promise<Settings> {
  const response = await fetch("/api/settings", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load settings");
  return normalizeSettings((await response.json()) as Partial<Settings>);
}

function normalizeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return {
    targetSecs: Number(stored?.targetSecs) || DEFAULT_SETTINGS.targetSecs,
    model:
      typeof stored?.model === "string" && stored.model.trim()
        ? stored.model.trim()
        : DEFAULT_SETTINGS.model,
    frame: FRAME_SETTINGS.includes(stored?.frame as FrameSetting)
      ? (stored!.frame as FrameSetting)
      : DEFAULT_SETTINGS.frame,
  };
}

const historyStore = createStore<StoredAttempt[]>(EMPTY_HISTORY, loadHistory);
const settingsStore = createStore<Settings>(DEFAULT_SETTINGS, loadSettings);

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
  return normalizeSettings(settingsStore.get());
}

export function saveSettings(next: Settings) {
  const normalized = normalizeSettings(next);
  settingsStore.set(normalized);
  void fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  }).catch(() => {});
}

export function saveAttempt(attempt: Attempt) {
  const stored = toStored(attempt);
  const previous = historyStore.get();
  historyStore.set([stored, ...previous.filter((item) => item.id !== attempt.id)]);
  void fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stored),
  }).catch(() => {});
}

export function deleteAttempt(id: string) {
  historyStore.set(historyStore.get().filter((item) => item.id !== id));
  void fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

export function clearHistory() {
  historyStore.set(EMPTY_HISTORY);
  void fetch("/api/history", { method: "DELETE" }).catch(() => {});
}
