Implement the # Implementation Prompt: Refine lesson sidebar typography

## Goal
Fix the lesson sidebar typography shown in the supplied screenshots so lesson preview rows and durations are clean, readable, and visually consistent with the Vertex lesson reference.

## Code inspected
- `app/lessons/[slug]/page.tsx`: lesson sidebar markup uses `.module-lesson`, nested lesson title `<b>`, and duration `<small>`.
- `app/globals.css`: lesson sidebar currently applies a generic 12px Arial font to the whole row, with small gray duration text; the global body also uses Arial.
- `design/vertex-lesson.png`: source of truth for the lesson sidebar hierarchy, spacing, weight, and restrained typography.

## Decision and assumption
- Interpret the screenshots as feedback about the sidebar lesson-row font, especially the tiny title/duration preview. Keep the overall layout unchanged and refine only typography and row legibility.
- Use the project’s existing Geist sans variable for UI text, with a slightly larger readable lesson title and a compact but clear duration. Preserve Georgia only for the page’s intentional editorial headings.
- Do not add a new font dependency or redesign the sidebar.

## Requirements
- Update scoped lesson-sidebar typography so module lesson titles use the existing sans UI font, normal weight, approximately 12px/1.45, with sufficient contrast.
- Make duration text visually secondary but readable, approximately 11px/1.4, and avoid an overly tiny or decorative treatment.
- Keep the active lesson title and “Now playing” state distinct.
- Keep the screenshot’s spacing, colors, borders, and responsive behavior unchanged except where a small line-height adjustment is required to prevent cramped rows.

## Acceptance criteria
- Lesson sidebar preview rows no longer look cramped or use an unattractive font.
- Title and duration remain readable at the screenshot’s scale.
- Active and inactive lesson states remain visually distinguishable.
- TypeScript and lint checks pass; no unrelated files change.

## Checks
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

## Manual test steps
1. Start the app with `npm run dev`.
2. Open a seeded lesson route.
3. Inspect inactive lesson titles and durations in the sidebar at desktop width.
4. Inspect the active lesson title, duration, and “Now playing” label.
5. Resize to a narrow viewport and confirm the typography does not overflow.
