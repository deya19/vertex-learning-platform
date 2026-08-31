# Implementation Prompt: Fix course duration typography

## Goal
Fix the duration and module-count text shown in the supplied course-page screenshots. The current `4 modules • 1h 59m`, `4m`, `25m`, and `3m` labels still render with an unintended serif appearance and do not match the clean Vertex UI typography.

## Code inspected
- `app/courses/[slug]/course-content.tsx`: renders the course content summary and each lesson duration with `.course-section-heading p` and `.lesson-duration`.
- `app/courses/[slug]/page.tsx`: renders the course metadata duration and module count with `.course-meta-detail`.
- `app/globals.css`: contains the course typography rules and a broad `h1, .serif` rule; course-specific heading and duration styles need explicit font-family declarations.

## Decision
- Treat the screenshots as feedback about the course detail page, not the lesson-page sidebar. Scope the fix to course metadata, content summary, lesson duration, and related small UI labels.
- Use the existing Geist sans font variable (with Arial fallback) for these UI labels. Keep Georgia reserved for intentional editorial headings such as course titles and section headings.
- Do not change layout, content, colors, or spacing beyond line-height adjustments needed for cleaner text.

## Requirements
- Explicitly set sans-serif typography on `.course-meta-detail`, `.course-section-heading p`, `.course-lesson`, `.lesson-duration`, and any nested small metadata text that currently inherits the wrong family.
- Preserve the existing visual hierarchy: metadata remains muted and compact; lesson duration remains secondary; course headings remain serif.
- Ensure durations remain readable at desktop and mobile widths.

## Acceptance criteria
- The four supplied duration/count examples render in the same clean sans UI font as the surrounding controls.
- Course title and intentional serif headings remain unchanged.
- No unrelated page styling changes.
- TypeScript, lint, and diff checks pass.

## Checks
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

## Manual test steps
1. Start the app with `npm run dev`.
2. Open a seeded course route.
3. Inspect the course content summary (`4 modules • 1h 59m`).
4. Inspect lesson durations such as `4m`, `25m`, and `3m`.
5. Confirm the course title still uses the intended serif display font.
6. Resize to mobile and confirm the metadata remains readable without overflow.
