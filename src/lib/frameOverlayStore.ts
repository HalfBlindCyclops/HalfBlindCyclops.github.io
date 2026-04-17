type ConnectorAnchor = {
  xPercent: number;
  yPercent: number;
  visible: boolean;
};

type CursorLatLon = {
  latitude: number | null;
  longitude: number | null;
};

type OverlaySnapshot = {
  connector: ConnectorAnchor;
  cursor: CursorLatLon;
};

const listeners = new Set<() => void>();
const THROTTLE_MS = 33;
let lastPublishTs = 0;

let snapshot: OverlaySnapshot = {
  connector: { xPercent: 23, yPercent: 64, visible: false },
  cursor: { latitude: null, longitude: null },
};

function publish(now = performance.now()) {
  if (now - lastPublishTs < THROTTLE_MS) return;
  lastPublishTs = now;
  listeners.forEach((listener) => listener());
}

export function subscribeFrameOverlay(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFrameOverlaySnapshot() {
  return snapshot;
}

export function setConnectorAnchor(next: ConnectorAnchor) {
  const prev = snapshot.connector;
  if (
    prev.visible === next.visible &&
    Math.abs(prev.xPercent - next.xPercent) < 0.06 &&
    Math.abs(prev.yPercent - next.yPercent) < 0.06
  ) {
    return;
  }
  snapshot = { ...snapshot, connector: next };
  publish();
}

export function setCursorLatLon(next: CursorLatLon) {
  const prev = snapshot.cursor;
  if (prev.latitude === next.latitude && prev.longitude === next.longitude) return;
  snapshot = { ...snapshot, cursor: next };
  publish();
}

export type { ConnectorAnchor, CursorLatLon };
