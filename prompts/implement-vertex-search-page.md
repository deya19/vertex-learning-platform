# Implement Vertex Search Results Page

## Goal
Reproduce the provided `design/vertex-search.png` as the `/search` page and keep it wired to the existing Sanity-backed intelligent search route. The page must present grounded video-moment and lesson results from Sanity, link video moments to the existing lesson route with `?start=`, and preserve the private server-side MCP/LLM boundary.

## Skills and guidance read
- `sanity-best-practices` (`C:\Users\deyas\.agents\skills\sanity-best-practices\SKILL.md`): server-only Sanity access, focused GROQ projections, private tokens, and Context integration.
- `create-agent-with-sanity-context` (`C:\Users\deyas\Desktop\vertex\.claude\skills\create-agent-with-sanity-context\SKILL.md`): server-side Context MCP HTTP transport, bearer authentication, initial-context caching, and tool discovery.
- `portable-text-serialization` (`C:\Users\deyas\.agents\skills\portable-text-serialization\SKILL.md`): Portable Text is queried as plain text for search and is not returned wholesale to the browser.
- Clerk router (`C:\Users\deyas\Desktop\vertex\.agents\skills\clerk\SKILL.md`): use the existing current `@clerk/nextjs` patterns for the authenticated header state.
- Repository `AGENTS.md`: prompt approval is required before code changes; the supplied image is the visual source of truth; keep the web and Studio boundaries separate; run typecheck, lint, build, and dev verification.
- Next.js 16 App Router guidance under `node_modules/next/dist/docs/`, specifically server/client boundaries, route handlers, CSS, image handling, and linking/navigation.

## Inspected code
- `package.json`: Next 16.3.2, React 19, `next-sanity`, Sanity 5, Clerk 7, PostHog, AI SDK/OpenAI, and Zod are already installed.
- `app/search/page.tsx`: App Router page reads `q` from the async `searchParams` prop and renders the client search surface.
- `app/search/search-results.tsx`: existing client search flow posts `{query}` to `/api/search`, tracks `search_performed`, supports local filtering, renders video/lesson result variants, and creates lesson links.
- `app/search/search.css`: existing search-only styles are a functional but substantially different editorial search design and should be replaced/refined to match the supplied reference.
- `app/api/search/route.ts`: existing server route validates input, rate-limits requests, uses Sanity Context MCP plus OpenAI structured output, enriches model identifiers with canonical Sanity lesson/course data, and returns only safe card data.
- `sanity/lib/client.ts`, `sanity/lib/search-context.ts`, `sanity/lib/data.ts`: private server client, Context MCP helper, and typed content data layer.
- `sanity/schemaTypes/documents/{course,lesson,video}.ts` and `sanity/schemaTypes/index.ts`: current course/lesson/video content model; the search page consumes the existing model and does not add unrelated schema work.
- `app/page.tsx`, `app/courses/page.tsx`, `app/globals.css`: existing Vertex header, logo, Clerk user state, paper/orange palette, typography, decorative side pattern, and responsive conventions.
- `app/lessons/[slug]/page.tsx` and lesson player: existing lesson destination and `start` query behavior.
- `design/vertex-search.png`: desktop visual source of truth.

## Decisions and assumptions
- Keep `/api/search` as the only browser entry point to search. Do not expose Sanity credentials, Context MCP URLs, OpenAI keys, raw GROQ, or model/tool payloads to the client.
- Keep the current grounded result enrichment and validation behavior. Only adjust the API or Sanity projections if the visual card data requires a missing, canonical field; do not replace the Context MCP search architecture with client-side GROQ or a separate backend.
- Match the image at its apparent 1440px desktop canvas: centered Vertex shell, 96px header, Courses active in orange, My Learning, bell, and authenticated avatar/user fallback; pale paper background and diagonal orange side rails.
- Search content layout: centered `SEARCH RESULTS` eyebrow, serif `Results for “<query>”` heading with orange quoted query, muted count line, wide search input with a `⌘ K` affordance, result count, right-aligned Most Relevant select, stacked rounded result cards, and a bottom browse-catalog callout.
- Video cards use Sanity poster images when available, a play affordance and duration/matched timestamp overlay, course identity/context, title, description, lesson/module metadata, orange “Watch from …” action, and VIDEO badge.
- Lesson cards use a presentational content/notes tile derived from grounded key points, course identity/context, title, description/key points, LESSON badge, and “View lesson” action. They must not invent fields or timestamps.
- Course branding marks shown inside result cards should be derived from real course data where available; if the existing API does not carry a course icon, use a deterministic presentational fallback without claiming it is Sanity content.
- The screenshot shows a populated query state, but `/search` must retain accessible loading, error, no-query, and no-results states. The no-results state links to `/courses`.
- Sort defaults to Most Relevant and remains local to the returned grounded set. “Lessons” and “Video moments” may remain available as additional options while the default matches the reference.
- Preserve responsive behavior: stack card media/copy and make controls fit narrow screens without changing the desktop composition.
- Use inline SVG icons or existing CSS patterns; do not add a new icon dependency. Use Next `Image` only for trusted Sanity CDN URLs already allowed by `next.config.ts`.
- Keep analytics behavior for searches and do not add speculative events beyond the existing search event.

## Expected files
- `app/search/search-results.tsx`: reshape markup and data presentation for the reference UI, preserve request cancellation/state safety, URL synchronization, grounded links, sorting, and accessible controls.
- `app/search/search.css`: replace/refine search-only styles to reproduce the supplied desktop layout, colors, spacing, typography, cards, badges, controls, callout, hover/focus states, and responsive adaptation.
- `app/api/search/route.ts` and/or `sanity/lib/data.ts` only if a narrowly scoped canonical Sanity field is required by the card UI; preserve security and result validation.
- `app/search/page.tsx` only if page metadata or query handling needs a small compatibility adjustment.
- Do not modify Sanity schemas, video ingestion, auth, progress, or unrelated page styles unless verification proves a search dependency requires it.

## Functional requirements
1. `/search?q=<query>` renders the reference populated-results composition once `/api/search` returns data.
2. The heading, count, search input, result count, and cards are grounded in the API response; no static demo results are introduced.
3. Video result cards link to `/lessons/<slug>?start=<seconds>` and lesson result cards link to `/lessons/<slug>`.
4. Poster images are rendered safely from trusted Sanity CDN data, with a usable fallback when no poster exists.
5. Search submit updates the URL, cancels/stales prior requests safely, renders loading/error/empty/no-results states, and keeps keyboard accessibility.
6. The result count and course count reflect the API response; visible local filtering does not fabricate or mutate the source counts.
7. Header navigation and Clerk state remain consistent with the existing Vertex pages: public browsing, sign-in/sign-up fallback, or authenticated user button.
8. No server-only token or search provider credential is included in client code or browser responses.
9. Desktop layout closely matches the supplied screenshot at 1440px and adapts sensibly below 700px.

## Security considerations
- Keep all Sanity Context MCP/OpenAI access in the existing server route and server-only helpers.
- Treat model output as untrusted; retain Zod validation and canonical Sanity enrichment.
- Generate internal lesson links from validated lesson slugs; never accept arbitrary URLs from the model.
- Render only safe, bounded text and trusted image URLs.
- Do not log search content, secrets, or provider payloads unnecessarily.

## Acceptance criteria
- The page visually matches the provided search screenshot in header, hero/search controls, cards, typography, spacing, colors, badges, and bottom callout.
- A real Sanity-backed search query displays grounded video and lesson cards when data exists.
- Clicking a video result stays on the Vertex lesson page and preserves the matched start second.
- Search works from `/search`, `/search?q=...`, submit, keyboard navigation, and mobile widths.
- Loading, error, empty query, and no-match states remain clear and usable.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass from `C:\Users\deyas\Desktop\vertex`.
- The dev server renders `/search` without runtime errors. If live Sanity/OpenAI credentials or a deployed Studio are unavailable, report that exact limitation rather than claiming live search verification.

## Manual test steps
1. Set the existing Sanity and OpenAI environment variables, and ensure the Sanity Studio application/Context configuration is deployed if live MCP search is being checked.
2. Run `npm run dev` from the repository root.
3. Open `/search?q=data%20fetching` and compare the desktop page against `design/vertex-search.png` at approximately 1440px wide.
4. Confirm the header logo/nav/actions, search heading, quoted query, count line, input, sort control, result cards, badges, timestamps, and browse-courses callout are present.
5. Submit another known query and confirm the URL updates, loading state does not flash stale results, and the new grounded results replace the old set.
6. Click a video card/action and confirm it stays on `/lessons/...` with the expected `start` query parameter; click a lesson card and confirm it opens the lesson page without a timestamp.
7. Test Most Relevant, Lessons, and Video moments sorting locally.
8. Test empty input, nonsense input, API/config failure, keyboard focus/submit, and a narrow mobile viewport.
9. Inspect browser network responses and confirm no Sanity read token, OpenAI key, or raw MCP/GROQ payload is exposed.
