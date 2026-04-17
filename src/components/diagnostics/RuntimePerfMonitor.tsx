"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PERF_BUDGETS, parsePerfScenario } from "@/lib/perfBudgets";

const SAMPLE_WINDOW_SEC = 2;

function isPerfDebugEnabled() {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("perf") === "1";
}

export function RuntimePerfMonitor() {
  const gl = useThree((s) => s.gl);
  const enabled = useMemo(() => isPerfDebugEnabled(), []);
  const frameCountRef = useRef(0);
  const elapsedRef = useRef(0);
  const maxDeltaRef = useRef(0);
  const p95CandidatesRef = useRef<number[]>([]);
  const warnedRef = useRef(false);
  const scenarioRef = useRef(
    typeof window === "undefined"
      ? "idle-autorotate"
      : parsePerfScenario(new URLSearchParams(window.location.search).get("scenario")),
  );

  useFrame((_, delta) => {
    if (!enabled) return;
    frameCountRef.current += 1;
    elapsedRef.current += delta;
    maxDeltaRef.current = Math.max(maxDeltaRef.current, delta);
    p95CandidatesRef.current.push(delta * 1000);
    if (elapsedRef.current < SAMPLE_WINDOW_SEC) return;

    const fps = frameCountRef.current / elapsedRef.current;
    const drawCalls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    const textures = gl.info.memory.textures;
    const geometries = gl.info.memory.geometries;

    const sorted = [...p95CandidatesRef.current].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
    const p95FrameMs = sorted[p95Index] ?? 0;
    const scenario = scenarioRef.current;
    const budget = PERF_BUDGETS[scenario];

    const fpsOk = fps >= budget.minFpsP50;
    const frameMsOk = p95FrameMs <= budget.maxFrameTimeP95Ms;
    const drawCallsOk = drawCalls <= budget.maxDrawCalls;
    const pass = fpsOk && frameMsOk && drawCallsOk;

    console.log("[runtime-perf]", {
      scenario,
      fps: Number(fps.toFixed(1)),
      frameTimeP95Ms: Number(p95FrameMs.toFixed(2)),
      worstFrameMs: Number((maxDeltaRef.current * 1000).toFixed(2)),
      drawCalls,
      triangles,
      textures,
      geometries,
      pass,
      budget,
    });

    if (!pass && !warnedRef.current) {
      warnedRef.current = true;
      console.warn("[runtime-perf] Budget breach detected. Tune quality tiers or hot paths.");
    }

    frameCountRef.current = 0;
    elapsedRef.current = 0;
    maxDeltaRef.current = 0;
    p95CandidatesRef.current = [];
  });

  return null;
}
