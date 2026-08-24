# Implementation Prompt: Home Content Width

## Goal
Adjust the Vertex home page shell so the main content uses approximately 1440px at desktop widths instead of the current 1000px maximum.

## Guidance and code inspected
- Repository rules in `AGENTS.md` and `CLAUDE.md`, including the required prompt approval workflow.
- `app/globals.css`: `.home-shell` is currently capped at `1000px`, and the side texture calculations use the same cap.
- `app/page.tsx`: home page content is contained by `.home-shell`; no structural changes are needed.
- `prompts/vertex-home.md`: original home page implementation decisions.

## Decision
Change only the home page desktop max width from 1000px to 1440px. Update the decorative side-texture calculations to use the same 1440px reference so the centered shell and surrounding pattern remain aligned. Keep the existing inner padding, responsive breakpoint behavior, card sizing, and all other visuals unchanged unless needed to prevent overflow.

## Expected files
- `app/globals.css`: update `.home-shell` width and matching side-texture calculations.

## Requirements
- At viewport widths of 1440px or wider, `.home-shell` should be approximately 1440px wide.
- At narrower viewports, the shell remains fluid and does not create horizontal overflow.
- Existing home page content, spacing, and responsive stacking remain intact.
- Do not modify the design-system route or add dependencies.

## Security considerations
- CSS-only presentation change; no secrets, requests, or user-controlled content.

## Acceptance criteria
- Desktop home content visibly spans approximately 1440px and remains centered.
- The page still responds correctly below desktop widths.
- The root route returns HTTP 200 and lint passes.

## Checks
1. Run `npm run lint`.
2. Verify `/` returns HTTP 200.
3. Inspect the page at desktop and narrow viewport widths.
