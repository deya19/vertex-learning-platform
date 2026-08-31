# Implementation Prompt: Make the lesson course summary dynamic

## Goal
Fix the lesson page course summary card so each course shows its own Sanity cover image and does not claim a hardcoded `35% complete` for every learner.

## Code inspected
- `app/lessons/[slug]/page.tsx`: the sidebar currently renders a hardcoded `N` mark, `35% complete`, and a fixed progress bar.
- `sanity/queries.ts`: the reverse course context projection currently returns course identity and modules but not `coverImage`.
- `sanity/lib/data.ts`: the `Lesson.course` type needs to represent the projected course cover image.
- `sanity/lib/image.ts`: existing `urlFor` helper can build the Sanity cover URL.

## Decisions and assumptions
- Use the reverse-referenced course’s actual `coverImage` from Sanity for the summary card. Keep a simple `N` fallback only when content has no cover image.
- There is no existing learner-progress read path in this app. Replace the fabricated `35% complete` and filled progress bar with truthful `0% complete` and an empty bar rather than inventing progress.
- Keep the change limited to the lesson summary card and the required query/type projection. Do not build a progress backend as part of this focused fix.

## Requirements
- Project `coverImage` in the lesson reverse course lookup with the existing image projection.
- Update the corresponding `Lesson.course` type.
- Build the image URL server-side with `urlFor`, and render it with `next/image` using the course title as the accessible alt fallback.
- Render `0% complete` and an empty progress track until a real progress source exists.
- Ensure every course route gets its own cover image and title.
- Preserve the existing card dimensions, layout, and responsive behavior.

## Acceptance criteria
- Opening different seeded courses no longer displays the same `N` image when a course cover exists.
- No course claims a fabricated 35% completion state.
- Cover images are sourced from Sanity and remain server-rendered.
- TypeScript, lint, and diff checks pass.

## Checks
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

## Manual test steps
1. Start the app with `npm run dev`.
2. Open lesson routes from at least two different seeded courses.
3. Confirm the sidebar card title and image change with the course.
4. Confirm the progress label is `0% complete` and the bar is empty.
5. Confirm a course without a cover still renders the fallback mark.
