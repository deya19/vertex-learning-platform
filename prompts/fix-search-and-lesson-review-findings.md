# Fix verified search and lesson review findings

## Goal
Address only the review findings that remain valid in the current working tree:
- return a client error for malformed search JSON before Zod validation;
- prevent model-generated lesson/course display fields from becoming trusted links or cards;
- protect the expensive public search POST route with a route-local rate limit;
- correct the lesson stylesheet keyword casing;
- replace hardcoded lesson copy with optional Sanity-backed fields;
- prevent stale search requests from overwriting newer UI state.

## Skills consulted
- `sanity-best-practices` from `.agents/skills/sanity-best-practices/SKILL.md`: keep Sanity access server-only, use typed GROQ projections, and preserve document relationships.
- `portable-text-serialization` from `.agents/skills/portable-text-serialization/SKILL.md`: preserve the existing `@portabletext/react`/`next-sanity` notes rendering boundary.
- `clerk-nextjs-patterns` from `.agents/skills/clerk-nextjs-patterns/SKILL.md`: no auth behavior needs to change; keep route and page server/client boundaries intact.
- `devin-cli` documentation was consulted as required by the repository environment; it does not affect the implementation.
- Next.js 16 route-handler and App Router guidance is available under `node_modules/next/dist/docs/`; the existing route already uses the current `Request`/`Response` handler shape.

## Code inspected
- `app/api/search/route.ts`: parses JSON and validates it in one expression; passes model-provided card fields directly into links and responses; has no throttling.
- `app/search/search-results.tsx`: each `runSearch` call updates shared state without aborting or identifying an older request.
- `app/lessons/[slug]/page.tsx`: heading description and Overview are hardcoded Next.js copy; notes already use Portable Text.
- `app/lessons/[slug]/lesson.css`: `.lesson-shell svg` currently uses `currentColor` for both fill and stroke.
- `sanity/queries.ts`, `sanity/lib/data.ts`, and `sanity/schemaTypes/documents/lesson.ts`: the lesson query/type/schema currently have no description or overview fields, so those optional projected fields must be added consistently rather than guessed only in the page.
- `package.json`: no rate-limit, Upstash, Arcjet, or other throttling dependency/configuration exists; the only available implementation path without adding a dependency is a small route-local fixed-window limiter.
- Working tree is clean before this change.

## Decisions and assumptions
1. Parse `request.json()` separately from `searchRequestSchema.parse()`. Catch `SyntaxError` as a 400 malformed JSON response, preserve the existing Zod 400 response for valid-but-invalid input, and preserve the existing 502 behavior for other failures.
2. The model may supply only stable lookup identifiers and match metadata. Treat lesson/course titles, slugs, module labels, descriptions, duration, poster, and key points as untrusted. Resolve lesson documents server-side in one Sanity query by the returned lesson slug identifiers, expand only courses whose modules actually reference each lesson, derive canonical display fields and links from that result, and drop any result whose lesson or lesson-course relationship is missing. Preserve only valid video match metadata (kind, matched seconds, matched label) from the model after validating it; use canonical Sanity duration/poster and lesson data for the card.
3. Use an in-process fixed-window limiter keyed by the request IP, applied only at the beginning of `POST`, before configuration checks, `createSearchContext()`, or `generateText()`. Read optional numeric limits from environment variables with safe defaults, return 429 with `Retry-After`, and bound stale entries so the map cannot grow without limit. This is the repository's minimal dependency-free option because no existing throttling mechanism is present. Do not add middleware or affect other routes.
4. Add optional `description` and `overview` text fields to the lesson schema, project them in lesson queries and types, and render each corresponding page section only when its field is non-empty. Keep the current layout, title, key points, pro tip, resources, and Portable Text notes behavior unchanged.
5. Change only the stylesheet SVG `fill` and `stroke` keyword values from `currentColor` to `currentcolor`.
6. Use an AbortController plus an active request sequence in `SearchResults`. Abort/invalidate the previous request before starting a new one; ignore AbortError and guard response, error, and loading updates, including the finalizer, by the active request id. Clear state for an empty query only for the current request and retain existing URL/history and analytics behavior for the winning request.

## Files expected to touch
- `app/api/search/route.ts`
- `app/search/search-results.tsx`
- `app/lessons/[slug]/lesson.css`
- `app/lessons/[slug]/page.tsx`
- `sanity/queries.ts`
- `sanity/lib/data.ts`
- `sanity/schemaTypes/documents/lesson.ts`

## Requirements
- Do not trust model-provided presentation fields for links, result cards, course counts, or displayed content.
- Query Sanity only from server code using the existing server client/token boundary.
- Preserve the lesson-course reverse-reference relationship and verify module membership before constructing `/lessons/<slug>` links.
- Do not return video documents directly or expose transcript data.
- Keep malformed JSON, Zod validation, configuration errors, and unexpected errors distinguishable as currently intended.
- Rate-limit only POST `/api/search`; public browsing and all non-search routes remain unchanged.
- Do not expose secrets, log request bodies, or add dependencies.
- Preserve existing formatting and UI structure; make no unrelated visual changes.

## Security considerations
- Sanity remains server-only; model output is untrusted input and is not used as a trusted URL or display source.
- Sanity asset URLs must continue to pass the existing CDN-origin check.
- The limiter must run before expensive external calls and must not use user-controlled query text as its key.
- Do not log malformed request bodies or credentials.
- Abort stale client requests and ignore their results so an older response cannot replace newer search data.

## Acceptance criteria
1. Malformed JSON POSTs return HTTP 400 without reaching schema validation or the search context/LLM.
2. Valid JSON that fails the existing query schema still returns the existing query-validation 400 message; unexpected failures still return 502.
3. Search results contain only lessons found by the server-side Sanity lookup and only course/module relationships that reference those lessons; canonical Sanity fields are used for cards and links.
4. Repeated POST search requests from one IP receive 429 after the configured/default threshold, with `Retry-After`; other routes are not rate-limited.
5. The lesson SVG rule passes the configured lowercase value-keyword check.
6. Lesson description and Overview are sourced from optional Sanity fields and omitted when absent; no hardcoded Next.js copy remains.
7. Starting a new search aborts or invalidates the prior request, and stale success/error/loading/finally handlers cannot alter current state.
8. Type checking, lint, and production build pass.

## Checks to run
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Review `git diff` and confirm no unrelated files changed.

## Manual test steps
1. Start the app with `npm run dev`.
2. POST invalid JSON to `/api/search` and confirm HTTP 400; POST valid JSON with a one-character query and confirm the existing validation response.
3. Submit several searches quickly in the search page and confirm only the final query's results, error, and loading state are visible; inspect the network panel for an aborted earlier request where supported.
4. Search for a known lesson and confirm its card links to the canonical lesson page and displays Sanity content; verify fabricated/mismatched model fields cannot create a card (use a mocked response or focused test if available).
5. Repeatedly POST `/api/search` from one client address until HTTP 429 and confirm `Retry-After`; browse `/courses` during the same period and confirm it still loads.
6. Open a lesson with populated description/overview and confirm both sections display; open one without either field and confirm the sections are omitted while the title remains.
7. Run the three automated checks above and inspect the final diff.
