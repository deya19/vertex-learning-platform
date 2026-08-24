# Implementation Prompt: Vertex Design System

## Goal
Replace the default Next.js starter page with a faithful, responsive implementation of the provided Vertex Design System reference image at `design/vertex-designsystem.png`.

## Skills and guidance read
- `devin-cli` documentation skill was invoked as required by the repository environment.
- Repository rules in `AGENTS.md` and `CLAUDE.md`.
- Next.js App Router guidance for layouts/pages, CSS, and fonts from `node_modules/next/dist/docs/` (the installed version is Next.js 16.3.2).

No Sanity, Clerk, search, or other platform integration is needed for this presentational design-system page.

## Code inspected
- `app/page.tsx`: default starter content; this is the primary page to replace.
- `app/layout.tsx`: root layout uses Geist and Geist Mono through `next/font/google` and currently has starter metadata.
- `app/globals.css`: Tailwind CSS v4 import plus starter light/dark theme variables and body styles.
- `package.json`: Next.js 16.3.2, React 19, Tailwind CSS v4, TypeScript, and ESLint; scripts include `dev`, `build`, `start`, and `lint` but no test script.
- `design/vertex-designsystem.png`: visual source of truth.

## Decisions and assumptions
- Use the existing single Next.js `app` workspace and Tailwind v4; do not add dependencies.
- Implement the page as a static server-rendered page. Interactive-looking controls in the reference (buttons, select, pagination, navigation) are visual examples only and do not need application behavior.
- Use inline SVG/CSS shapes or text for the logo and icon samples so the page has no external asset dependency and remains deterministic.
- Use the reference image as the source of truth for desktop layout, spacing, typography, colors, borders, radii, shadows, and component states.
- Use CSS grid/flex responsive adaptations for narrow screens: stack the wide sections and allow dense sample rows/tables to scroll or reflow without changing the desktop composition.
- Keep the page accessible with semantic headings, labels, lists, button/link semantics where appropriate, sufficient contrast, and meaningful aria labels for icon-only samples.
- Remove starter dark-mode behavior from the page styling because the reference is a warm light canvas and does not show a dark variant.

## Expected files to touch
- `app/page.tsx`: replace starter page with the complete design-system showcase.
- `app/globals.css`: define the Vertex design tokens, font-family usage, page background, shared card and utility styling, and responsive rules.
- `app/layout.tsx`: update metadata and, if needed, font setup to support the reference typography while preserving the current Next.js conventions.

Do not touch Sanity, authentication, data, API, or unrelated files.

## Requirements
Build all visible sections from the reference image:
1. Header/intro with Vertex mark and wordmark, “Design System” title, description, and version/date.
2. Colors with primary and neutral swatches, labels, and hex values.
3. Typography samples for Playfair Display and Inter.
4. Type scale table with styles, fonts, sizes/line heights, weights, and use cases.
5. Spacing system with 4px base and labeled spacing examples.
6. Radius and shadows samples.
7. Icon samples in outline and filled styles, plus icon specs.
8. Button samples showing primary, secondary, tertiary, text, and default/hover/disabled rows, plus button specs.
9. Input samples for search/text input and select, plus field specs.
10. Badges/tags.
11. Status/indicators.
12. Progress bar.
13. Card samples: course, video lesson, lesson, and resource cards.
14. Navigation samples: navbar, breadcrumbs, pagination.
15. Principles row with clarity, consistency, focus & calm, and accessible principles.

Use the exact visible sample copy and values from the reference where legible, including color hex values, spacing values, button labels, card titles, and status labels. Preserve the section numbering and uppercase micro-label style. Make the main desktop canvas wide and compact like the reference, with cards separated by subtle warm-gray borders on an off-white background.

## Security considerations
- No secrets, tokens, external requests, or user-controlled data are introduced.
- Do not add remote assets or unsafe HTML injection.
- Keep the page static and client-free unless a small interaction is genuinely required.

## Acceptance criteria
- `/` renders the complete Vertex Design System rather than the Next.js starter screen.
- At desktop width, the visual hierarchy and dense multi-column layout closely match `design/vertex-designsystem.png`.
- The page includes all 15 visible numbered design-system sections and their representative states/examples.
- The visual language uses the reference palette: warm off-white canvas, near-black text, orange primary, muted blue-gray neutrals, subtle borders, and restrained shadows.
- The page remains usable at mobile widths without horizontal page overflow; dense content can reflow or use local overflow where necessary.
- TypeScript and ESLint pass.
- A production build passes.

## Checks to run
From `C:\Users\deyas\Desktop\vertex\app` if that is the actual package root, otherwise from the repository root:
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Start `npm run dev` and inspect `/` at desktop and narrow viewport widths.

## Manual test steps
1. Start the app with `npm run dev`.
2. Open `http://localhost:3000/`.
3. Confirm the page starts with the Vertex logo, intro copy, and Colors section.
4. Scroll through all numbered sections 01–14 and the unnumbered visual continuation of the final principles row, confirming no starter content remains.
5. Compare the desktop layout against `design/vertex-designsystem.png`, especially the section grid, typography, swatches, cards, and navigation samples.
6. Resize to a narrow viewport and confirm sections stack/reflow, controls remain legible, and the page does not create browser-level horizontal overflow.
7. Run lint, TypeScript, and production build and confirm all pass.
