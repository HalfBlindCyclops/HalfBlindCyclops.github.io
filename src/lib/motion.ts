"use client";

export const motionDuration = {
  fast: 0.12,
  medium: 0.24,
  slow: 0.42,
  xslow: 0.46,
} as const;

export const motionEase = {
  standardOut: [0.22, 1, 0.36, 1] as const,
  smoothOut: [0.2, 0.9, 0.25, 1] as const,
  smoothInOut: [0.4, 0, 0.2, 1] as const,
} as const;

export const motionStagger = {
  listBaseDelay: 0.1,
  listStep: 0.05,
  panelDelay: 0.1,
} as const;

export const motionDelayMs = {
  hoverTrayDismiss: 160,
} as const;

export const connectorMotion = {
  connect: {
    duration: 0.3,
    ease: motionEase.smoothOut,
  },
  retract: {
    duration: motionDuration.fast,
    ease: motionEase.standardOut,
  },
} as const;
