# Fetch homepage courses from Sanity

## Goal
Replace the homepage's hardcoded course array with the existing seeded Sanity course data while preserving the current homepage layout and visual treatment shown in the supplied reference.

## Skills and guidance read
- `sanity-best-practices`: use the existing server-only Sanity data layer and typed GROQ projection; do not expose tokens or duplicate content in the page.
- `content-modeling-best-practices`: treat Sanity course documents as the source of truth and derive presentation values from structured fields.

## Existing code inspected
- `app/page.tsx`: currently defines a hardcoded three-item `courses` array and renders `CourseCard` with title, description, level, duration, module count, and a manually assigned visual mark.
- `app/globals.css`: contains the existing homepage card grid, course mark styles, and responsive behavior.
- `sanity/lib/data.ts`: exports server-only `getCourses()` returning typed `Course[]` records.
- `sanity/queries.ts`: `COURSES_QUERY` returns all published courses ordered by popularity and title, including title, slug, summary, level, student count, cover image, outcomes, instructor/category, and nested modules/lessons.
- `sanity/lib/image.ts`: provides the Sanity image URL builder.
- `scripts/seed.ndjson`: contains 10 seeded course documents with real titles, summaries, levels, cover images, and module/lesson references.

## Decisions and assumptions
- Make `app/page.tsx` an async Server Component and call `getCourses()` on the server.
- Render the returned Sanity courses instead of maintaining a duplicate hardcoded course list.
- Show the full fetched course list in the existing “All Courses” grid; do not cap it to the previous three static examples.
- Calculate each card’s total duration by summing the durations of its nested lessons, and calculate the module count from `course.modules.length`.
- Use the Sanity course slug to link each card to `/courses/[slug]`.
- Use each course’s Sanity cover image as the card artwork when available, with a small visual fallback for missing images. Keep the card’s existing typography, metadata, spacing, border, and responsive layout.
- Do not modify seed fixtures, Sanity schema, or the existing `COURSES_QUERY` unless type/runtime verification proves a missing field is required.
- Preserve the existing Clerk header and hero sections.

## Expected files to touch
- `app/page.tsx` — replace hardcoded course data with `getCourses()`, add duration calculation, Sanity image rendering, and course links.
- `app/globals.css` — add only the minimal card artwork/link styles required to preserve the current card appearance with fetched images.

## Security and boundaries
- Keep Sanity access server-side through `getCourses()`.
- Never import the Sanity client or read token-bearing environment variables into client code.
- Do not add a second data-fetching mechanism or fixture fallback.
- Do not modify `scripts/seed.ndjson` or other seeded content.

## Acceptance criteria
- The homepage course cards are populated by the result of `getCourses()`.
- Seeded Sanity course titles and summaries appear in the cards; no static replacement course array remains.
- Card module counts and total durations are calculated from nested Sanity lesson data.
- Each card navigates to its corresponding `/courses/<slug>` detail page.
- The page remains visually consistent with the provided homepage card reference and responsive at narrow widths.
- Existing Clerk controls and homepage hero continue to work.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Checks to run
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Run `npm run dev` and inspect the homepage against the reference.
5. Confirm the rendered course titles match seeded Sanity data and that a card click reaches the existing course detail route.
