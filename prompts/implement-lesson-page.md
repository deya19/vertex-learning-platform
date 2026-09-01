# Implementation Prompt: Implement the Sanity-backed lesson page

## Goal
Implement the `/lessons/[slug]` lesson detail page to match `design/vertex-lesson.png`, using the existing seeded Sanity lesson/course data and keeping the lesson video embedded and playable on the page.

## Skills read
- `sanity-best-practices`: server-only Sanity data access, GROQ projections, referenced content, and image handling.
- `portable-text-serialization`: render Sanity Portable Text in React with stable typed serializers.
- `integration-nextjs-app-router`: keep analytics in client event handlers and use the existing PostHog initialization.
- Next.js App Router guides in `node_modules/next/dist/docs/`: server/client boundaries, layouts/pages, and route data fetching.

## Code and design inspected
- `sanity/queries.ts`: existing `LESSON_BY_SLUG_QUERY` returns lesson fields and reverse-referenced course contexts with ordered modules.
- `sanity/lib/data.ts`: existing server-only `getLessonBySlug` and `Lesson`/`Course` types.
- `sanity/schemaTypes/documents/lesson.ts`: seeded lesson shape (`videoUrl`, `poster`, `duration`, `notes`, `keyPoints`, `proTip`, `resources`).
- `app/courses/[slug]/page.tsx` and `app/courses/[slug]/course-content.tsx`: existing Vertex header, navigation, Sanity image patterns, lesson URLs, and PostHog event naming.
- `app/globals.css`: existing design tokens, header/logo styles, course-shell conventions, and responsive CSS approach.
- `app/layout.tsx`, `instrumentation-client.ts`, and `next.config.ts`: Clerk/PostHog integration and browser/server boundaries.
- `scripts/seed.ndjson`: seeded Next.js App Router lessons and YouTube video URLs, including caching/revalidation content.
- `design/vertex-lesson.png`: source of truth for desktop layout and visual states.

## Decisions and assumptions
- Add a public server-rendered dynamic route at `app/lessons/[slug]/page.tsx`; missing lessons use `notFound()`.
- Keep Sanity reads in the existing server-only data layer. Do not expose Sanity tokens to the browser.
- Use the existing reverse course lookup and derive the lesson’s course/module/lesson number from returned ordered data. If multiple course contexts exist, use the first context consistently for the page breadcrumb/sidebar because the existing route accepts only a lesson slug.
- Use a small client component for the embedded YouTube player and tab state. Use the provider iframe/player rather than building a custom video player; the provider remains on the Vertex lesson route.
- Support YouTube URLs from seeded data and preserve a `start` query parameter for future timestamp links. For unsupported video URLs, render a safe fallback card rather than inventing a playable source.
- Render notes with `@portabletext/react` only if it is already available; otherwise use the existing installed `next-sanity` export or add the package through the package manager only if required. Do not convert content to markdown.
- The design’s displayed completion state is presentational for now unless an existing progress implementation is found; do not invent a progress API or write path as part of this page-only task.
- Use existing inline SVG/icon conventions and CSS rather than adding a UI dependency.

## Requirements
- Add `/lessons/[slug]` route with metadata derived from Sanity lesson content.
- Match the reference: Vertex header, back-to-course link, breadcrumbs, left course/module lesson navigation, active lesson state, lesson badge/title/description, metadata, bookmark affordance, large video area, Lesson Content/Notes tabs, overview, key points, pro tip, resources, and previous/next lesson footer navigation.
- Use seeded Sanity values for title, duration, student count, poster/image, notes, key points, pro tip, resources, course, module, and neighboring lesson links. Do not hardcode the reference lesson’s copy into the page.
- Embed the lesson video on the page. YouTube playback must remain inside the lesson page and accept the start seconds query parameter when present.
- Make the desktop layout closely match the provided image and add sensible responsive behavior: collapse the sidebar above the content on small screens, stack metadata/resources/footer controls, and keep the iframe aspect ratio.
- Keep client code limited to interaction and browser-only analytics. Capture a meaningful `lesson_viewed`/`video_played` event only in an appropriate client event handler or existing supported mechanism, without sending PII or Sanity tokens.
- Preserve existing pages and styles; add scoped lesson styles and avoid unrelated redesign.

## Security considerations
- Sanity data access remains server-only and parameterized by slug.
- No Sanity read/write token, Clerk secret, or private analytics key may enter client props or browser code.
- Validate/normalize the external video URL before constructing an iframe source; only allow the supported YouTube host forms and use a safe fallback for other providers.
- External resource links should open safely with `rel="noreferrer noopener"` where appropriate.

## Expected files
- `app/lessons/[slug]/page.tsx` (new route)
- `app/lessons/[slug]/lesson-player.tsx` (new client player/tabs interaction, if needed)
- `app/globals.css` (lesson page styles and responsive rules)
- `sanity/lib/data.ts` and/or `sanity/queries.ts` only if the existing projection/type is insufficient
- `package.json`/lockfile only if a required already-approved package is missing

## Acceptance criteria
- A seeded lesson slug renders at `/lessons/<slug>` with real Sanity content.
- The selected lesson appears in the correct course/module context with working neighboring lesson links.
- The video is visibly embedded and playable within the page, not redirected to YouTube.
- Notes, key points, pro tip, and resources render from Sanity when present.
- Missing slugs return the Next.js not-found page.
- Desktop appearance follows the supplied reference and the layout remains usable on mobile.
- TypeScript, lint, production build, and `git diff --check` pass.

## Checks to run
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`
- Start `npm run dev` and manually verify a seeded lesson route in a browser.

## Manual test steps
1. Ensure Sanity is seeded and the required environment variables are available.
2. Start the web app with `npm run dev`.
3. Open `/lessons/nextjs-app-router-in-depth-caching-and-revalidation` (or another seeded lesson slug).
4. Confirm the header, breadcrumbs, module sidebar, lesson title, metadata, content sections, and resource cards use the returned Sanity content.
5. Confirm the embedded YouTube player loads and remains on the lesson page; add `?start=120` and confirm the embed URL includes the requested start time.
6. Click a neighboring lesson and confirm it navigates to another `/lessons/[slug]` route with updated content.
7. Switch between Lesson Content and Notes and confirm both states work without a full page navigation.
8. Resize to a narrow viewport and confirm the sidebar/content/footer adapt without horizontal overflow.
9. Open an unknown slug and confirm the route returns not found.
