export type PerfScenario =
  | "idle-autorotate"
  | "focused-wiggle-drag"
  | "cursor-hover-latlon"
  | "mini-node-panel-open";

export type PerfBudget = {
  minFpsP50: number;
  maxFrameTimeP95Ms: number;
  maxReactCommitsPerSecond: number;
  maxDrawCalls: number;
};

export const PERF_SCENARIOS: PerfScenario[] = [
  "idle-autorotate",
  "focused-wiggle-drag",
  "cursor-hover-latlon",
  "mini-node-panel-open",
];

export const PERF_BUDGETS: Record<PerfScenario, PerfBudget> = {
  "idle-autorotate": {
    minFpsP50: 58,
    maxFrameTimeP95Ms: 22,
    maxReactCommitsPerSecond: 8,
    maxDrawCalls: 160,
  },
  "focused-wiggle-drag": {
    minFpsP50: 52,
    maxFrameTimeP95Ms: 28,
    maxReactCommitsPerSecond: 14,
    maxDrawCalls: 200,
  },
  "cursor-hover-latlon": {
    minFpsP50: 50,
    maxFrameTimeP95Ms: 30,
    maxReactCommitsPerSecond: 18,
    maxDrawCalls: 210,
  },
  "mini-node-panel-open": {
    minFpsP50: 48,
    maxFrameTimeP95Ms: 32,
    maxReactCommitsPerSecond: 20,
    maxDrawCalls: 220,
  },
};

export function parsePerfScenario(value: string | null): PerfScenario {
  if (!value) return "idle-autorotate";
  if (PERF_SCENARIOS.includes(value as PerfScenario)) return value as PerfScenario;
  return "idle-autorotate";
}
