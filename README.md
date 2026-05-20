# Globesite

Interactive 3D resume and portfolio experience built with Next.js, React, and React Three Fiber.

## Documentation

- **Primary reference (consolidated):** `docs/CODEBASE.md`
- **Deployment runbook:** `DEPLOY.md`
- **Performance baseline procedure:** `scripts/perf-baseline-checklist.md`

## Quick Start

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

For GitHub Pages-style local routing, run:

```bash
NEXT_PUBLIC_BASE_PATH=/globesite npm run dev
```

Then open `http://localhost:3000/globesite/`.

## Scripts

- `npm run dev`: Start development server.
- `npm run build`: Static export build (`next build` with `output: "export"`).
- `npm run export`: Alias of `build`.
- `npm run start`: Start production server mode (not used for static hosting).
- `npm run lint`: Run ESLint.

## Tech Stack

- Next.js 16 (App Router, static export)
- React 19
- `@react-three/fiber` + `@react-three/drei`
- Three.js
- Framer Motion
- TypeScript
- Tailwind CSS v4
