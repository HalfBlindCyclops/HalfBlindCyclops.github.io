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
 * Route pin → junction → panel edge. The horizontal beam sits at `panelAnchorY` (panel
 * top-left), not at the pin latitude. When the pin sits right of the panel anchor,
 * extend the beam from the panel edge toward the pin on that row.
 */
export function computeConnectorBeamLayout(
  pinX: number,
  _pinY: number,
  panelAnchorY: number,
  panelEdgePct: number,
  defaultJunctionXPct: number = JUNCTION_X,
): ConnectorBeamLayout {
  const y = Math.max(8, Math.min(92, panelAnchorY));
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

/** Match ResumePanel `splitViewPanelTop` for Projects/Experience (`max(6.75rem, 9dvh)`). */
export function tallPanelConnectorYPercent(sectionHeightPx: number, rootFontPx = 16): number {
  const dvhPct = 9;
  const remPct = ((6.75 * rootFontPx) / Math.max(sectionHeightPx, 1)) * 100;
  return Math.min(32, Math.max(dvhPct, remPct));
}
