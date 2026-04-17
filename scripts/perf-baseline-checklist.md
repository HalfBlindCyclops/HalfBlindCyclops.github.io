# Runtime Baseline Checklist

Use this script before and after each performance phase.

## Setup

1. Run `npm run dev`.
2. Open `http://localhost:3000/?perf=1&scenario=idle-autorotate`.
3. Open Chrome DevTools Performance panel.
4. Start profiling, run scenario for 20 seconds, stop profile.

## Scenarios

- `idle-autorotate`: Load page and do not interact.
- `focused-wiggle-drag`: Select a section, then drag/orbit for 20s.
- `cursor-hover-latlon`: Keep moving pointer over globe for 20s.
- `mini-node-panel-open`: Open Experience or Projects mini-node UI and interact.

## Capture For Each Scenario

- Console logs from `[runtime-perf]`.
- Console logs from `[web-vitals]` (LCP/INP/CLS/FCP/TTFB).
- Chrome trace screenshot for frame-time distribution.
- React Profiler commit count for the same window.

## Gate

- FPS and frame-time must meet budgets from `src/lib/perfBudgets.ts`.
- Draw calls must not exceed per-scenario threshold.
- Any budget breach blocks merge until fixed or approved.
