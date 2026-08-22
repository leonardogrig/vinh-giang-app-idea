"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "bin";
}

export type Recording = { blob: Blob; durationSecs: number; filename: string };

type Options = {
  maxSecs: number;
  /** Extra seconds allowed past the target so a sentence can be finished. */
  graceSecs?: number;
  onComplete: (recording: Recording) => void;
};

/**
 * Mic capture with a hard stop at the target duration, plus an AnalyserNode
 * the visualiser can read for a live level meter.
 */
export function useRecorder({ maxSecs, graceSecs = 0, onComplete }: Options) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxSecsRef = useRef(maxSecs);
  const graceSecsRef = useRef(graceSecs);
  const onCompleteRef = useRef(onComplete);

  // Keep the latest values reachable from timer and MediaRecorder callbacks.
  useEffect(() => {
    maxSecsRef.current = maxSecs;
    graceSecsRef.current = graceSecs;
    onCompleteRef.current = onComplete;
  });

  const teardown = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setAnalyser(null);
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  /**
   * Abandon the take. The recorder still has to stop to release the mic, but
   * the completion handler never fires, so the audio is dropped on the floor
   * and no request is ever made.
   */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      chunksRef.current = [];
      teardown();
      setIsRecording(false);
      setElapsed(0);
    }
  }, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Try Chrome, Edge, or Safari over HTTPS.");
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as Error)?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : name === "NotFoundError"
            ? "No microphone found."
            : `Could not open the microphone: ${(err as Error).message}`,
      );
      return false;
    }

    streamRef.current = stream;

    // Live level meter.
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const node = context.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.6;
      source.connect(node);
      audioContextRef.current = context;
      setAnalyser(node);
    } catch {
      // A missing meter is cosmetic; recording still works.
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      teardown();
      setError(`Could not start recording: ${(err as Error).message}`);
      return false;
    }

    chunksRef.current = [];
    cancelledRef.current = false;
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      if (cancelledRef.current) {
        chunksRef.current = [];
        recorderRef.current = null;
        teardown();
        setIsRecording(false);
        setElapsed(0);
        return;
      }

      const durationSecs = (performance.now() - startedAtRef.current) / 1000;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      recorderRef.current = null;
      teardown();
      setIsRecording(false);
      setElapsed(durationSecs);
      onCompleteRef.current({
        blob,
        durationSecs,
        filename: `take.${extensionFor(type)}`,
      });
    };

    startedAtRef.current = performance.now();
    recorder.start(250);
    setIsRecording(true);
    setElapsed(0);

    tickRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= maxSecsRef.current + graceSecsRef.current) stop();
    }, 100);

    return true;
  }, [stop, teardown]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    teardown();
  }, [teardown]);

  return { start, stop, cancel, isRecording, elapsed, error, analyser, setError };
}
