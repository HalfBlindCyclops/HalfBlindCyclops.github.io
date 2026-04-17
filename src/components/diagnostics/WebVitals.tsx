"use client";

import { useReportWebVitals } from "next/web-vitals";

type VitalsMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

function shouldReportVitals() {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("perf") === "1";
}

const reportVitals = (metric: VitalsMetric) => {
  if (!shouldReportVitals()) return;
  const entryType =
    metric.entries.length > 0 && "entryType" in metric.entries[0]
      ? String((metric.entries[0] as { entryType?: string }).entryType ?? "")
      : "";
  // Lightweight local instrumentation for baseline snapshots.
  console.log("[web-vitals]", {
    name: metric.name,
    value: Number(metric.value.toFixed(2)),
    rating: metric.rating,
    id: metric.id,
    nav: metric.navigationType,
    entryType,
  });
};

export function WebVitals() {
  useReportWebVitals(reportVitals);
  return null;
}
