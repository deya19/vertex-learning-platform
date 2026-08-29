# Implement the Sanity-backed course detail page

## Goal
Implement a course detail route that reproduces `design/vertex-course.png` as closely as possible while rendering the selected course from the existing Sanity dataset. The page must work at `/courses/[slug]`, with the seeded `nextjs-app-router-in-depth` course as the primary manual test case.

## Skills and guidance read
- `sanity-best-practices`: keep Sanity access server-only, use the existing typed fetch layer and GROQ projections, and preserve references for related content.
- `content-modeling-best-practices`: use the existing course/module/lesson model rather than duplicating presentation content in the page.
- `portable-text-serialization`: relevant to the existing lesson notes model; this course page does not need to render Portable Text.
- `clerk-nextjs-patterns`: keep the existing Clerk provider/header auth boundary intact.
- Next.js 16 dynamic route guidance: route params are promises and must be awaited in an async App Router page.

## Existing code inspected
- `app/page.tsx`: existing Vertex header, Clerk auth controls, SVG icon conventions, and home-page visual language.
- `app/globals.css`: existing design-system and home-page CSS variables/patterns.
- `sanity/queries.ts`: existing course query and nested module/lesson projection.
- `sanity/lib/data.ts`: server-only `getCourseBySlug` helper and current TypeScript data shapes.
- `sanity/lib/image.ts`: existing Sanity image URL builder.
- `sanity/schemaTypes/documents/course.ts`, `objects/module.ts`, and `documents/lesson.ts`: source content model.
- `scripts/seed.ndjson`: seeded course is titled `Next.js App Router in Depth`, is popular, has four learning outcomes, and contains ordered modules with lesson references.
- `prompts/seed-sanity-fixtures.md`: confirms the seed fixtures are intended to remain unchanged.
- `package.json`: Next 16, React 19, Clerk, Sanity, and lint/build scripts; no icon library is installed.

## Decisions and assumptions
- Add a dynamic App Router page at `app/courses/[slug]/page.tsx` and use `await params` per Next.js 16 conventions.
- Keep the page public and read-only. Use `getCourseBySlug` on the server; do not expose Sanity tokens or add client-side Sanity calls.
- Use the actual seeded course fields for title, summary, cover image, level, student count, outcomes, modules, lesson titles, summaries, and durations. Do not hardcode screenshot copy that conflicts with Sanity data.
- The seed fixture uses a `coverImage` for courses, but lesson seed data may contain legacy `thumbnail` data while the current schema/query expects `poster`; the course page should only rely on the course cover and the existing course projection, without changing fixtures.
- The screenshot shows a learner progress bar, but there is no progress data model or route in the current repository. Render a neutral `0% complete` presentation rather than inventing user state, and keep progress writes out of this task.
- Implement the visible “Show all modules” and bookmark controls as small client-side interactions only if needed for the screenshot behavior. Bookmark state must remain local/presentational because no bookmark persistence exists.
- Derive module and lesson numbers from array order. Use a compact duration formatter for seconds/minutes/hours and sum lesson durations for the course total.
- Use inline SVG icons matching the existing stroke/currentColor convention; do not add a dependency.
- Keep the existing home page intact except for shared CSS variables or reusable styles that are necessary. Link course cards to the new route only if the current home page already has a natural course link target; avoid broad catalog work.

## Expected files to touch
- `app/courses/[slug]/page.tsx` — new server-rendered dynamic course detail page.
- `app/courses/[slug]/course-actions.tsx` or an equivalent colocated client component — only if interactive bookmark/module expansion cannot remain server-rendered.
- `app/globals.css` — course-specific responsive styling, using existing variables and avoiding changes to unrelated design-system examples.
- `sanity/queries.ts` and/or `sanity/lib/data.ts` — only if verification reveals the existing projection is insufficient for the page; preserve the server-only boundary and types.

## UI requirements
- Reproduce the supplied desktop composition: Vertex header with Courses/My Learning, notification icon, Clerk user controls, breadcrumb, two-column course hero, popular badge, course cover, title/summary, metadata, primary continue button, bookmark button, learning outcomes panel, course content list, module count/total duration, and bottom progress action bar.
- Use the supplied visual language: warm off-white background, fine peach borders, serif headings, restrained gray body text, orange accent, rounded cards/buttons, and the diagonal side pattern already used by the home shell.
- Make the layout responsive for narrow screens by stacking hero columns, wrapping metadata/actions, and making course content readable without changing the desktop hierarchy.
- Use accessible headings, landmarks, button labels, image alt text, semantic links, keyboard-focusable controls, and `aria-expanded` for module visibility if applicable.

## Security and boundaries
- Keep all Sanity reads in the existing server-only data layer.
- Never put `SANITY_API_READ_TOKEN`, Clerk secret values, or any other private environment value in client code.
- Do not add a progress or bookmark write route in this task.
- Do not modify `scripts/seed.ndjson` or other fixture files.
- Use `notFound()` for a missing course slug rather than exposing an error or inventing fallback course content.

## Acceptance criteria
- `/courses/nextjs-app-router-in-depth` renders successfully from seeded Sanity content.
- The page displays the real seeded course title, summary, cover image, instructor/category context, outcomes, ordered modules, ordered lessons, and calculated durations.
- No course content is hardcoded as a replacement for Sanity data.
- The desktop layout closely matches `design/vertex-course.png` and remains usable on mobile.
- Missing course slugs return the framework’s not-found response.
- Existing Clerk header behavior and home page remain functional.
- TypeScript and ESLint pass; production build passes because a route and server data code are involved.

## Checks to run
From `C:\Users\deyas\Desktop\vertex`:
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Start `npm run dev` and manually inspect the route.

If Sanity credentials or dataset access are unavailable, report that explicitly and still verify the route with the project’s actual configured behavior; do not add fixture fallbacks or expose environment values.

## Manual test steps
1. Ensure the seeded Sanity dataset is available using the existing environment configuration.
2. Run `npm run dev`.
3. Open `http://localhost:3000/courses/nextjs-app-router-in-depth`.
4. Confirm the title, summary, cover, Popular badge, level, calculated total duration, module count, outcomes, and lesson rows match the seeded course.
5. Confirm module/lesson order comes from Sanity array order and the expand/show-all control is keyboard usable.
6. Confirm Bookmark and Continue Learning are presentational and do not expose errors or write to Sanity.
7. Resize to a narrow viewport and confirm the hero stacks and the content remains readable.
8. Open an unknown slug such as `/courses/does-not-exist` and confirm a not-found response.
9. Confirm the home page still loads and Clerk signed-in/signed-out controls still render as before.
