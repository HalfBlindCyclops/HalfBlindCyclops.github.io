import { JUNCTION_X } from "@/components/ui/ResumeConnector";

export type ConnectorBeamLayout = {
  /** SVG path endpoint X (viewBox %). */
  xJunction: number;
  /** SVG path endpoint Y and horizontal beam row (viewBox %). */
  yJunction: number;
  /** Horizontal beam `left` (% of viewport). */
  barLeftPct: number;
  /** Horizontal beam `width` (% of viewport). */
  barWidthPct: number;
  streamStartYPercent: number;
};

/**
 * Route pin → junction → panel edge. When the pin sits right of the panel anchor,
 * extend the horizontal beam from the panel edge out to the pin instead of stopping at a fixed %.
 */
export function computeConnectorBeamLayout(
  pinX: number,
  pinY: number,
  panelEdgePct: number,
  defaultJunctionXPct: number = JUNCTION_X,
): ConnectorBeamLayout {
  const y = Math.max(8, Math.min(92, pinY));
  const edge = panelEdgePct;
  const junction = defaultJunctionXPct;

  if (pinX <= junction) {
    return {
      xJunction: junction,
      yJunction: y,
      barLeftPct: junction,
      barWidthPct: Math.max(1, edge - junction),
      streamStartYPercent: y,
    };
  }

  if (pinX <= edge) {
    const barLeft = junction;
    return {
      xJunction: junction,
      yJunction: y,
      barLeftPct: barLeft,
      barWidthPct: Math.max(1, edge - barLeft),
      streamStartYPercent: y,
    };
  }

  return {
    xJunction: edge,
    yJunction: y,
    barLeftPct: edge,
    barWidthPct: Math.max(1, pinX - edge),
    streamStartYPercent: y,
  };
}
