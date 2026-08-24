# Implementation Prompt: Vertex Home Page

## Goal
Replace the placeholder root route with a faithful, responsive implementation of the provided Vertex home page reference at `design/vertex-home.png`.

## Skills and guidance read
- `sanity-best-practices` was invoked; no Sanity integration is needed for this static presentation.
- `devin-cli` documentation skill was invoked as required by the repository environment.
- Repository rules in `AGENTS.md` and `CLAUDE.md`.
- Existing App Router conventions and installed Next.js 16.3.2 project structure.

## Code inspected
- `app/page.tsx`: placeholder `Home` component; primary route to replace.
- `app/layout.tsx`: root layout using Geist and Geist Mono via `next/font/google`, with design-system metadata.
- `app/globals.css`: Tailwind v4 import plus existing Vertex tokens and design-system styles.
- `package.json`: Next.js 16.3.2, React 19, Tailwind CSS v4, TypeScript, ESLint; scripts include `dev`, `build`, and `lint`, with no test script.
- `design/vertex-home.png`: desktop visual source of truth.
- Existing design-system page and prompt: established Vertex palette and typography conventions, but the home page should have its own layout styles without regressing `/design-system`.

## Decisions and assumptions
- Use the existing single Next.js App Router workspace and existing dependencies; do not add packages.
- Keep the page static and server-rendered. Navigation and CTA controls use normal links; the search field is presentational for now because no search route or backend exists yet.
- Use inline SVG/CSS shapes for the Vertex mark, bell, search, arrow, metadata icons, course marks, star, and avatar so the page is deterministic and does not introduce external asset dependencies. Use the supplied reference only as visual guidance; do not embed or remote-load the screenshot.
- Use the established warm off-white canvas, near-black text, muted blue-gray copy, orange accent, subtle warm borders, serif display typography, and sans-serif UI typography.
- Preserve the desktop composition: centered maximum-width shell with diagonal side texture, header, large hero/search section, three-course grid, and lower announcement/decorative bar continuation visible in the reference.
- Make the page responsive below desktop by stacking navigation and course cards, resizing hero typography, and keeping the search control within the viewport.
- Keep `/design-system` behavior and unrelated files intact.

## Expected files to touch
- `app/page.tsx`: replace placeholder content with semantic home page markup and local static course data.
- `app/globals.css`: add scoped home page styles, responsive rules, and any missing typography/background tokens while preserving existing design-system styles.
- `app/layout.tsx`: update page metadata from the design-system title to Vertex home metadata; preserve the existing font setup unless the implementation requires a minimal adjustment.

## Requirements
- Header matches the reference with Vertex logo/wordmark, Courses link, My Learning link, notification icon, and circular user avatar treatment.
- Hero includes the `INTELLIGENT LEARNING` badge, exact heading `Search your learning in plain English.`, supporting copy, orange `Explore Courses` CTA with arrow, and large search field with magnifier, placeholder `Ask anything about your learning...`, and `⌘ K` keyboard hint.
- Courses section includes `All Courses`, `View all courses` link, and three cards:
  - `Next.js for Production` — `Build scalable, high-performance web applications with Next.js.`, Intermediate, 18h 24m, 12 modules.
  - `Docker Essentials` — `Containerize applications and streamline your development workflow.`, Beginner, 10h 12m, 8 modules.
  - `TypeScript Deep Dive` — `Go beyond the basics and write safer, more expressive code.`, Intermediate, 14h 36m, 10 modules.
- Course cards include the visible logo/mark area, title, description, separator, and level/time/module metadata with matching outline icon treatment.
- Include the lower centered announcement `New courses and lessons added every week.` with orange star and thin divider lines, plus the soft orange stepped decorative bars visible at the bottom of the screenshot.
- Use semantic links, headings, labels, and accessible names for icon-only controls. Do not add fake functionality or inaccessible clickable divs.
- Avoid global styling regressions to the existing design-system route.

## Security considerations
- No secrets, tokens, external requests, user-controlled HTML, or new dependencies.
- The page remains client-free and does not expose any backend credentials.

## Acceptance criteria
- `/` renders the Vertex home page instead of `Home`.
- Desktop layout closely matches `design/vertex-home.png` in hierarchy, proportions, spacing, palette, typography, borders, card styling, and decorative details.
- The page remains usable without browser-level horizontal overflow at narrow widths.
- Links and icon-only controls have appropriate accessible semantics.
- `/design-system` remains available and its existing presentation is not intentionally changed.
- TypeScript, ESLint, and production build pass.

## Checks to run
From `C:\Users\deyas\Desktop\vertex`:
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Start `npm run dev` and inspect `/` at desktop and narrow viewport widths.

## Manual test steps
1. Start the app with `npm run dev`.
2. Open `http://localhost:3000/`.
3. Confirm the header, hero copy, CTA, search field, course section, three course cards, announcement, and bottom bars match the supplied reference.
4. Confirm `Courses`, `My Learning`, `Explore Courses`, and `View all courses` render as links with expected destinations or safe placeholder destinations.
5. Resize to a narrow viewport and confirm the header, hero, search control, cards, and announcement reflow without browser-level horizontal scrolling.
6. Open `/design-system` and confirm the existing design-system page still renders.
7. Run lint, TypeScript, and production build and confirm all pass.
