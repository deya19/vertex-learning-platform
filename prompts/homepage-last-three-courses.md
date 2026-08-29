# Show the last three courses on the homepage

## Goal
Make the homepage show only the last three courses returned by Sanity while keeping `/courses` as the full All Courses page.

## Skills and guidance read
- `sanity-best-practices`: continue using the existing server-only `getCourses()` data layer and do not duplicate or expose Sanity content.

## Existing code inspected
- `app/page.tsx`: homepage already awaits `getCourses()` and maps every returned course into the homepage grid; the “View all courses” link already points to `/courses`.
- `app/courses/page.tsx`: All Courses page already awaits `getCourses()` and maps the full result without slicing.
- `sanity/queries.ts`: `COURSES_QUERY` returns the complete course collection ordered by `isPopular desc, title asc`.

## Decision
- Keep the Sanity fetch unchanged and derive `featuredCourses = courses.slice(-3)` on the homepage. “Last three” means the final three items in the existing Sanity query order.
- Keep `/courses` unchanged so users can click “View all courses” and see every fetched course.
- Do not change card content, styling, schema, seed fixtures, or ordering.

## Expected files to touch
- `app/page.tsx` — slice the fetched course array for homepage rendering and map `featuredCourses`.

## Acceptance criteria
- Homepage renders exactly three course cards from Sanity.
- Those cards are the last three entries in the existing `getCourses()` result.
- The homepage “View all courses” link still opens `/courses`.
- `/courses` still renders every course from Sanity.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Manual checks
1. Open `/` and confirm exactly three course cards are visible.
2. Open `/courses` from “View all courses” and confirm the full seeded course list is visible.
3. Confirm the homepage cards still link to their corresponding `/courses/<slug>` detail pages.
