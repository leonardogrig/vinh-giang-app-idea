"use client";

import { analyseProsody, type Prosody } from "./prosody";
import type { ScribeWord } from "./types";

export type DecodedAudio = { samples: Float32Array; sampleRate: number };

/**
 * Decode the recorded blob to mono PCM with the browser's own decoder. Returns
 * null if this browser cannot decode what it recorded, which is rare — the
 * take is still transcribed and graded, just without a voice reading.
 */
export async function decodeRecording(blob: Blob): Promise<DecodedAudio | null> {
  if (typeof window === "undefined") return null;
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;

  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = buffer.numberOfChannels;
    const samples = new Float32Array(buffer.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) samples[i] += data[i] / channels;
    }
    return { samples, sampleRate: buffer.sampleRate };
  } catch {
    return null;
  } finally {
    context.close().catch(() => {});
  }
}

/** Decode, then measure. Never throws — a failed reading is a null, not a failed rep. */
export async function measureVoice(
  decoded: DecodedAudio | null,
  words: ScribeWord[] | undefined,
): Promise<Prosody | null> {
  if (!decoded) return null;
  try {
    return await analyseProsody(decoded.samples, decoded.sampleRate, { words });
  } catch {
    return null;
  }
}
