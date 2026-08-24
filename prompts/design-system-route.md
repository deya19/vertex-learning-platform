# Implementation Prompt: Design System Route

## Goal
Serve the existing Vertex Design System showcase at `/design-system` instead of `/`, so it is available at `http://localhost:3001/design-system` when the existing development server is running.

## Guidance read
- Repository rules in `AGENTS.md` and `CLAUDE.md`.
- Existing implementation prompt at `prompts/vertex-design-system.md`.
- Existing App Router structure and current `app/page.tsx` implementation.

## Decision
Use the App Router convention by moving the existing design-system page module to `app/design-system/page.tsx`. Keep the current design-system CSS and metadata unchanged. The root route may remain as-is unless the move requires it; no new functionality or styling is needed.

## Expected files
- Add `app/design-system/page.tsx` containing the current design-system page implementation.
- Remove the duplicate root `app/page.tsx` only if the intended behavior is that the design system exists exclusively at `/design-system`.
- Do not modify `app/globals.css` or unrelated routes.

## Requirements
- `/design-system` returns the complete existing design-system page.
- The route works with Next.js App Router and does not require client-side code.
- No duplicate implementation should remain.
- Existing styling and responsive behavior must be preserved.

## Checks
- Start or use the existing dev server.
- Verify HTTP 200 and recognizable Vertex Design System content at `/design-system`.
- Run `npm run lint`.
