"use client";

import { useEffect, useRef } from "react";

/** Live mic level, drawn as a scrolling bar history on a canvas. */
export function WaveMeter({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      let level = 0;
      if (analyser && buffer && active) {
        analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const value = (buffer[i] - 128) / 128;
          sum += value * value;
        }
        level = Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
      }

      const history = historyRef.current;
      history.push(level);
      const barWidth = 3;
      const gap = 3;
      const maxBars = Math.max(8, Math.floor(width / (barWidth + gap)));
      if (history.length > maxBars) history.splice(0, history.length - maxBars);

      const centre = height / 2;
      for (let i = 0; i < history.length; i += 1) {
        const value = history[i];
        const barHeight = Math.max(2, value * (height - 6));
        const x = width - (history.length - i) * (barWidth + gap);
        const alpha = active ? 0.35 + value * 0.65 : 0.18;
        context.fillStyle = `rgba(251, 191, 36, ${alpha})`;
        context.beginPath();
        context.roundRect(x, centre - barHeight / 2, barWidth, barHeight, 2);
        context.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  useEffect(() => {
    if (!active) historyRef.current = [];
  }, [active]);

  return <canvas ref={canvasRef} className="h-16 w-full" aria-hidden />;
}
