"use client";

import { useRef, useEffect, useCallback } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  state: "idle" | "listening" | "transcribing" | "thinking" | "speaking";
}

const HALF_BARS = 32;
const SMOOTHING = 0.3;

export function AudioVisualizer({ analyser, state }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const prevHeightsRef = useRef<Float32Array>(new Float32Array(HALF_BARS));
  const phaseRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const w = rect.width;
    const h = rect.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const halfWidth = w / 2;

    ctx.clearRect(0, 0, w, h);

    const heights = prevHeightsRef.current;
    const isActive = state === "speaking" || state === "listening";

    if (analyser && isActive) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const step = Math.floor(bufferLength / HALF_BARS);
      for (let i = 0; i < HALF_BARS; i++) {
        const raw = dataArray[i * step] / 255;
        const target = raw * (h * 0.4);
        heights[i] = heights[i] * SMOOTHING + target * (1 - SMOOTHING);
      }
    } else {
      phaseRef.current += 0.02;
      const phase = phaseRef.current;
      const breathAmplitude = state === "thinking" || state === "transcribing" ? 8 : 4;

      for (let i = 0; i < HALF_BARS; i++) {
        const norm = i / HALF_BARS;
        const wave =
          Math.sin(norm * Math.PI * 2 + phase) * 0.6 +
          Math.sin(norm * Math.PI * 4 + phase * 1.3) * 0.4;
        const target = (wave * 0.5 + 0.5) * breathAmplitude;
        heights[i] = heights[i] * SMOOTHING + target * (1 - SMOOTHING);
      }
    }

    const goldRGB = "212, 175, 55";
    const amplitude = heights.reduce((s, v) => s + v, 0) / HALF_BARS;
    const glowIntensity = Math.min(amplitude / 30, 1);

    const segWidth = halfWidth / HALF_BARS;

    const addCurve = (
      startX: number,
      startY: number,
      dir: 1 | -1,
      ySign: 1 | -1
    ) => {
      ctx.moveTo(startX, startY);
      for (let i = 1; i < HALF_BARS; i++) {
        const x = centerX + dir * i * segWidth;
        const y = centerY + ySign * heights[i];
        const prevX = centerX + dir * (i - 1) * segWidth;
        const prevY = centerY + ySign * heights[i - 1];
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
      }
    };

    ctx.shadowColor = `rgba(${goldRGB}, ${0.4 + glowIntensity * 0.4})`;
    ctx.shadowBlur = 8 + glowIntensity * 16;

    ctx.beginPath();
    addCurve(centerX, centerY - heights[0], -1, -1);
    ctx.lineTo(0, centerY - heights[HALF_BARS - 1]);
    addCurve(centerX, centerY - heights[0], 1, -1);
    ctx.lineTo(w, centerY - heights[HALF_BARS - 1]);
    ctx.strokeStyle = `rgba(${goldRGB}, ${0.7 + glowIntensity * 0.3})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.beginPath();
    addCurve(centerX, centerY + heights[0], -1, 1);
    ctx.lineTo(0, centerY + heights[HALF_BARS - 1]);
    addCurve(centerX, centerY + heights[0], 1, 1);
    ctx.lineTo(w, centerY + heights[HALF_BARS - 1]);
    ctx.shadowColor = `rgba(${goldRGB}, ${0.3 + glowIntensity * 0.3})`;
    ctx.shadowBlur = 6 + glowIntensity * 12;
    ctx.strokeStyle = `rgba(${goldRGB}, ${0.5 + glowIntensity * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(0, centerY - 40, 0, centerY + 40);
    grad.addColorStop(0, `rgba(${goldRGB}, 0)`);
    grad.addColorStop(0.5, `rgba(${goldRGB}, ${0.03 + glowIntensity * 0.05})`);
    grad.addColorStop(1, `rgba(${goldRGB}, 0)`);

    ctx.beginPath();
    addCurve(centerX, centerY - heights[0], -1, -1);
    ctx.lineTo(0, centerY);
    for (let i = HALF_BARS - 1; i >= 1; i--) {
      const x = centerX - i * segWidth;
      const y = centerY + heights[i];
      const nextX = centerX - (i - 1) * segWidth;
      const nextY = centerY + heights[i - 1];
      const cpX = (x + nextX) / 2;
      ctx.quadraticCurveTo(x, y, cpX, (y + nextY) / 2);
    }
    ctx.lineTo(centerX, centerY + heights[0]);
    addCurve(centerX, centerY + heights[0], 1, 1);
    ctx.lineTo(w, centerY);
    for (let i = HALF_BARS - 1; i >= 1; i--) {
      const x = centerX + i * segWidth;
      const y = centerY + heights[i];
      const nextX = centerX + (i - 1) * segWidth;
      const nextY = centerY + heights[i - 1];
      const cpX = (x + nextX) / 2;
      ctx.quadraticCurveTo(x, y, cpX, (y + nextY) / 2);
    }
    ctx.lineTo(centerX, centerY + heights[0]);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    animationRef.current = requestAnimationFrame(draw);
  }, [analyser, state]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32"
      style={{ imageRendering: "auto" }}
    />
  );
}
