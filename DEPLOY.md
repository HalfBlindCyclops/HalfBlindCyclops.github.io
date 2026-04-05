# Deploying to GitHub Pages

This app is a static export (`output: "export"` in `next.config.ts`). The build writes an `out/` directory you can host on GitHub Pages.

## Base path

| Site URL | `NEXT_PUBLIC_BASE_PATH` |
| --- | --- |
| `https://<user>.github.io/<repo>/` | `/<repo>` (e.g. `/globesite`) |
| `https://<user>.github.io/` (user/org site repo) | unset or `""` |
| Custom domain at site root | unset or `""` |

`basePath` in Next.js must match this value. Root-absolute asset links (PDF, textures, images) are prefixed via `publicPath()` in `src/lib/basePath.ts`.

## Build

```bash
npm ci
# Project page (replace with your repo name):
NEXT_PUBLIC_BASE_PATH=/your-repo-name npm run build
```

For a user site or custom domain at `/`, run `npm run build` without setting the variable.

The `export` script is an alias for `next build` when static export is enabled:

```bash
NEXT_PUBLIC_BASE_PATH=/your-repo-name npm run export
```

Upload everything under `out/` to Pages (for example the `gh-pages` branch, a `docs/` folder on the default branch, or the **GitHub Actions** workflow in `.github/workflows/pages.yml`).

## Local check with a path prefix

The export still writes `index.html` at the top of `out/`; `basePath` only affects URLs inside the HTML (e.g. `/globesite/_next/...`), which matches GitHub project Pages.

To verify locally with the same paths as production, run dev with the same env and open the prefixed URL:

```bash
NEXT_PUBLIC_BASE_PATH=/globesite npm run dev
```

Then open `http://localhost:3000/globesite/` and confirm chunks, the resume PDF, and globe textures load.

## Notes

- `public/.nojekyll` is copied into `out/` so GitHub Pages does not ignore `_next`.
- `next/font` (Google) fetches at build time; CI runners need network access for `next build` (default on GitHub-hosted runners).
