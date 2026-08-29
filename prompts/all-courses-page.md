# Implement the All Courses page

## Goal
Add a simple `/courses` page that lists the seeded Sanity courses and links each card to the existing `/courses/[slug]` detail page.

## Skills and guidance read
- `sanity-best-practices`: use the existing server-only Sanity data layer and avoid exposing private tokens.

## Existing code inspected
- `app/page.tsx`: homepage header, Sanity-backed course card data shape, duration formatting, course card styling conventions, and `/courses` navigation links.
- `app/courses/[slug]/page.tsx`: existing course detail route and expected slug URLs.
- `app/globals.css`: existing warm Vertex shell, header, card grid, typography, and responsive styles.
- `sanity/lib/data.ts`: server-only `getCourses()` helper.
- `sanity/queries.ts`: `COURSES_QUERY` returns all seeded courses with slugs, summaries, cover images, levels, student counts, and nested modules/lessons.

## Decisions and assumptions
- Create `app/courses/page.tsx` as an async Server Component.
- Fetch all courses through `getCourses()` and render them using the existing course-card visual language.
- Keep the page intentionally simple: shared header, page title/intro, responsive card grid, and no filters, search, pagination, or new state management.
- Use Sanity fields for all course content, derive total duration from nested lesson durations, and link by the Sanity slug.
- Reuse or extract existing presentation patterns only as needed; do not alter the homepage behavior.
- Use `notFound()` or a concise empty state only if the Sanity result is empty; do not add fixture fallbacks.

## Expected files to touch
- `app/courses/page.tsx` — new All Courses page.
- `app/globals.css` — only minimal page-specific layout styles if existing styles are insufficient.

## Security and boundaries
- Keep Sanity access server-side via `getCourses()`.
- Never expose Sanity tokens or add client-side content fetching.
- Do not modify seeded fixtures, schema, or unrelated routes.

## Acceptance criteria
- `/courses` renders successfully using seeded Sanity courses.
- Course titles, summaries, levels, durations, module counts, and cover images come from Sanity.
- Each card links to the existing matching `/courses/<slug>` route.
- The page is simple, responsive, and consistent with Vertex styling.
- Existing homepage and course detail page remain functional.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Checks to run
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Run `npm run dev` and open `http://localhost:3000/courses`.
5. Confirm seeded course titles are displayed and clicking a card opens its detail route.
