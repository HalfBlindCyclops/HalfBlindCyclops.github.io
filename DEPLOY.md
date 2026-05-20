# Deployment Runbook (GitHub Pages)

For full architecture/deployment context, see `docs/CODEBASE.md`.

## 1) Choose base path

| Site URL | `NEXT_PUBLIC_BASE_PATH` |
| --- | --- |
| `https://<user>.github.io/<repo>/` | `/<repo>` (example: `/globesite`) |
| `https://<user>.github.io/` | unset or `""` |
| Custom domain at root | unset or `""` |

## 2) Build static export

Project page:

```bash
npm ci
NEXT_PUBLIC_BASE_PATH=/your-repo-name npm run build
```

Root-hosted site:

```bash
npm ci
npm run build
```

Output directory: `out/`

## 3) Publish `out/`

Publish the generated `out/` contents to your Pages target:

- `gh-pages` branch, or
- `docs/` folder on default branch, or
- GitHub Actions pages workflow.

## 4) Local path-prefix verification

```bash
NEXT_PUBLIC_BASE_PATH=/globesite npm run dev
```

Open `http://localhost:3000/globesite/` and verify:

- app chunks load
- resume PDF link resolves
- globe textures resolve

## Notes

- `export` script is currently an alias of `build`.
- Root-absolute public assets should use `publicPath()` so base-path deployment remains correct.
