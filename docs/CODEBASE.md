# Codebase Documentation

This file is the consolidated reference for the current state of the project.

## 1) Project Overview

`globesite` is a single-page, interactive globe-based resume experience:

- A full-screen 3D scene is rendered via React Three Fiber.
- Resume sections are represented by globe nodes and mini-nodes.
- A right-side panel and connector overlays synchronize with camera focus.
- Personal profile/contact controls are pinned to the top-left.

The app is currently configured for static export deployment.

## 2) Runtime Stack

- Next.js `16.2.1` (App Router)
- React `19.2.4`
- Three.js `0.183.x`
- `@react-three/fiber` and `@react-three/drei`
- Framer Motion for UI/overlay transitions
- TypeScript + Tailwind CSS

## 3) Repository Map

Top-level docs and config:

- `README.md`: quick start + docs index.
- `DEPLOY.md`: deployment checklist/runbook.
- `next.config.ts`: static export config and `basePath` handling.
- `scripts/perf-baseline-checklist.md`: performance capture procedure.

App source:

- `src/app/layout.tsx`: global fonts, metadata, viewport, and web-vitals hook mount.
- `src/app/page.tsx`: renders the globe experience loader.

Core experience:

- `src/components/experience/GlobeExperienceLoader.tsx`: client-only dynamic load with shell fallback.
- `src/components/experience/GlobeExperience.tsx`: orchestration layer (scene state, overlays, panel sync, interaction flow).

3D scene components:

- `src/components/three/Globe.tsx`: Earth shaders and texture quality tiering.
- `src/components/three/GlobeWeather.tsx`: weather overlays/effects.
- `src/components/three/Atmosphere.tsx`: atmospheric glow and rim styling.
- `src/components/three/GlobeNodes.tsx`: primary nodes + project/experience mini-nodes.
- `src/components/three/OrbitalSatellites.tsx`: animated satellite elements.
- `src/components/three/CameraRig.tsx`: camera transitions between idle/focus/return states.
- `src/components/three/SpaceBackground.tsx`: stars/space backdrop.

UI and overlays:

- `src/components/ui/ProfileContactHub.tsx`: profile card and contact actions.
- `src/components/ui/ResumePanel.tsx`: section panel, project detail flow, experience bullet interactions.
- `src/components/ui/ResumeConnector.tsx`: animated connector path from node to panel.
- `src/components/ui/SceneLoader.tsx`: lightweight load-status overlay.

Diagnostics:

- `src/components/diagnostics/WebVitals.tsx`: `?perf=1` web-vitals logging in dev.
- `src/components/diagnostics/RuntimePerfMonitor.tsx`: frame/draw-call budget checks in dev.

Data-driven content:

- `src/data/resumeNodes.ts`: primary sections and bullet/project-subsection data.
- `src/data/projectMiniNodes.ts`: project mini-node positions and per-project metadata.
- `src/data/experienceMiniNodes.ts`: experience mini-node positions.
- `src/data/profileHub.ts`: top-left profile card rows and links.

Shared utilities:

- `src/lib/basePath.ts`: prefixes root-absolute public URLs when path-based deployment is used.
- `src/lib/geo.ts`: lat/lon, sun direction, and world-space helpers.
- `src/lib/frameOverlayStore.ts`: external store for connector anchor + cursor lat/lon overlays.
- `src/lib/perfBudgets.ts`: scenario names and numeric performance budgets.
- `src/lib/useCanvasScreenRect.ts`: canvas rect tracking for pointer/overlay mapping.
- `src/lib/projectBullet.ts`: bullet parsing for summary/detail rendering.
- `src/lib/colorFormat.ts`: accent color and RGBA helpers.

## 4) Application Flow

1. `src/app/page.tsx` renders `GlobeExperienceLoader`.
2. `GlobeExperienceLoader` dynamically imports `GlobeExperience` (`ssr: false`).
3. `GlobeExperience` mounts one full-screen `<Canvas>` and all synchronized overlays.
4. Selecting a node moves the camera (`CameraRig`), then reveals connector/panel UI.
5. Project and experience mini-node selection drives detail views without leaving section context.

## 5) State Model (GlobeExperience)

Main interaction state currently includes:

- `selectedNode`: active top-level resume section.
- `sceneMode`: `"idle" | "focusing" | "focused" | "returning"`.
- `activeProjectMiniNodeId` / `activeExperienceMiniNodeId`: active detail pins.
- `hoveredSectionId`: nav tray visibility behavior (experience tray).
- `resumePanelAnchor`: panel top-left percentage for connector alignment.
- `connectorPathsActive`: two-phase connector animation switch guard.
- `sunDirection`: recomputed every minute for lighting updates.

Layout behavior:

- Mobile breakpoint is `"(max-width: 767px)"`.
- Desktop uses split view (globe left-center framing + panel/connector on right).
- Mobile uses stacked behavior and simplified placement constraints.

## 6) Content Editing Guide

Primary edits for resume content:

- Edit section titles, subtitles, and bullet content in `src/data/resumeNodes.ts`.
- Edit project mini-node cards and detail metadata in `src/data/projectMiniNodes.ts`.
- Edit experience mini-node labels/positions in `src/data/experienceMiniNodes.ts`.
- Edit profile card identity/contact options in `src/data/profileHub.ts`.

Coordinate tuning:

- Each node uses globe latitude/longitude.
- `projectMiniNodes` and `experienceMiniNodes` intentionally cluster around their parent node.

Link behavior:

- Use `publicPath("/...")` for any root-absolute assets intended to work under `basePath`.
- Keep external links as absolute `https://...` URLs.

## 7) Performance Instrumentation

Performance debug mode is enabled only in development and only with query params.

Enable:

- `?perf=1` -> turns on logging.
- `?scenario=<name>` -> applies scenario-specific budgets.

Supported scenarios (`src/lib/perfBudgets.ts`):

- `idle-autorotate`
- `focused-wiggle-drag`
- `cursor-hover-latlon`
- `mini-node-panel-open`

Logs:

- `[runtime-perf]` from `RuntimePerfMonitor`:
  - FPS
  - frame-time p95
  - worst frame
  - draw calls
  - triangles/textures/geometries
  - pass/fail against scenario budget
- `[web-vitals]` from `WebVitals`:
  - LCP / INP / CLS / FCP / TTFB and metadata

Recommended capture procedure lives in `scripts/perf-baseline-checklist.md`.

## 8) Build and Deployment

Configuration (`next.config.ts`):

- `output: "export"` for static hosting.
- `images.unoptimized: true` (no server-side image optimizer).
- `basePath` is derived from `NEXT_PUBLIC_BASE_PATH`.

Env var:

- `NEXT_PUBLIC_BASE_PATH`
  - project Pages: `/<repo>`
  - root-hosted site: unset/empty

Build commands:

- Root deployment:
  - `npm ci`
  - `npm run build`
- Project-page deployment:
  - `npm ci`
  - `NEXT_PUBLIC_BASE_PATH=/your-repo-name npm run build`

Export output is generated in `out/`.

## 9) Asset Expectations

The scene references several static assets from `public/` using `publicPath()`, including:

- Resume PDF
- Profile image
- Globe textures (day/night)

If any referenced assets are missing, affected UI/scene sections will degrade or fail to load correctly.

## 10) Maintenance Notes

When updating the experience, keep these in sync:

- Data updates in `src/data/*`
- Any related UI behavior in `GlobeExperience` and `ResumePanel`
- Performance scenario docs and budgets (`scripts/perf-baseline-checklist.md`, `src/lib/perfBudgets.ts`)
- Deployment instructions if base path behavior or build workflow changes
