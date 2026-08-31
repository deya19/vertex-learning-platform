# Implement Intelligent Search

## Goal
Implement Vertex intelligent search across Sanity courses and lessons. A learner submits a natural-language query to a full `/search` results page. The browser talks only to a same-origin Next.js route; the route keeps all Sanity and LLM credentials server-side, connects to Sanity Context MCP, returns grounded structured video-moment and lesson results, and links results to existing lesson pages with optional `start` seconds.

## Skills read
- `sanity-best-practices` (`C:\Users\deyas\.agents\skills\sanity-best-practices\SKILL.md`): server-only Sanity access, GROQ, private tokens, Context integration constraints.
- `create-agent-with-sanity-context` (`C:\Users\deyas\Desktop\vertex\.agents\skills\create-agent-with-sanity-context\SKILL.md`): Context MCP HTTP transport, initial-context caching, tool discovery, server-side agent pattern.
- `dial-your-context` (`C:\Users\deyas\Desktop\vertex\.claude\skills\dial-your-context\SKILL.md`): concise Context instructions and content filtering.
- Repository Next.js rules in `AGENTS.md`, including Next 16 App Router boundaries and required checks.

## Inspected code
- `package.json`: Next 16.3.2, React 19, next-sanity, Sanity 5, Clerk, PostHog; no AI SDK/OpenAI/Zod search dependencies yet.
- `sanity/env.ts`: project ID/dataset/API version are environment-backed.
- `sanity/lib/client.ts`: server-only Sanity client and private-token `sanityFetch` helper.
- `sanity/lib/data.ts`: typed course/lesson models and read helpers.
- `sanity/queries.ts`: course modules contain referenced lessons; lesson reverse-references its course; lesson notes are Portable Text; no video/agent-context query currently exists.
- `app/page.tsx`, `app/courses/page.tsx`, `app/courses/[slug]/page.tsx`: existing header, card, typography, and navigation patterns.
- `app/lessons/[slug]/page.tsx` and `lesson-player.tsx`: existing `?start=` handling and YouTube embed support.
- `app/globals.css`: existing Vertex visual language and responsive patterns.

## Decisions and assumptions
- Use the Sanity Context MCP over server-side HTTP at `https://api.sanity.io/v2026-03-03/context/mcp/{projectId}/{dataset}/{slug?}`. The route will use a configured `SANITY_CONTEXT_SLUG` when present and otherwise the base endpoint.
- Fetch and cache `/initial-context` server-side; exclude the redundant `initial_context` MCP tool from the model tools when possible.
- Use the Vercel AI SDK with OpenAI tool calling and Zod structured output. Add only required dependencies through the package manager, using stable published versions.
- The LLM may query Context with GROQ but must return only JSON matching the result schema. It must search lesson topic fields and video chapters first, then transcript chunks only as fallback; video documents are internal and never rendered directly.
- Do not use semantic similarity unless the endpoint/data supports it. The prompt will require token-based wildcard/OR matching and `pt::text(notes)` for Portable Text.
- Keep result counts grounded in the returned data. Do not invent timestamps, course names, lesson names, prices, durations, or counts. A result URL is generated server-side from returned lesson slugs, not accepted from the model.
- Preserve current page styling; add search-specific styles that match the existing paper/orange/serif system and work on mobile. No chatbox or conversational answer UI.
- The existing lesson route accepts `start`; no lesson-page change is expected unless a provider-specific result link needs a small compatibility fix.
- Context document setup/deployment is configuration/content work. Add a documented seed/config path only if the existing Studio supports it; do not install `@sanity/context` blindly because Sanity is currently v5. The route must work with the base MCP URL as a fallback.

## Expected files
- `app/api/search/route.ts`: POST validation, MCP connection/tool discovery, initial context, model call, structured response, error boundary.
- `app/search/page.tsx`: App Router search results page and query parameter handling.
- `app/search/search-results.tsx` or equivalent client component: input submission, loading/error/empty states, sorting control, video and lesson cards, PostHog search event if existing analytics patterns support it.
- `sanity/lib/search-context.ts` or equivalent server-only helper: MCP URL, bearer auth, initial-context cache, MCP JSON-RPC/tool adapter.
- `sanity/env.ts` or a server env module: validate required server-only Context/OpenAI environment variables without exposing tokens.
- `app/globals.css`: search page/card/responsive styles.
- `package.json` and lockfile: required AI SDK/OpenAI/Zod dependencies.
- `.env.example` if repository permissions allow reading/writing ignored env templates: document `SANITY_API_READ_TOKEN`, `SANITY_CONTEXT_SLUG`, and `OPENAI_API_KEY` without values. If ignored by tooling, report that it could not be changed.
- Optional existing header/home search affordance files if needed to make the search entry point navigate to `/search`.

## Functional requirements
1. `POST /api/search` accepts `{ query: string }`, rejects missing/too-short/oversized input with a useful 400 response, and never accepts arbitrary GROQ or URLs from the browser.
2. The route uses the Sanity Context MCP with the server-only read token and project/dataset env values, discovers tools, injects initial context and the strict Vertex search system prompt, and asks the model to use `groq_query`.
3. The structured response includes `query`, `total`, `courseCount`, and `results`; each result is either:
   - video: lesson slug/title, course title/slug, module title/index, lesson index/label, poster URL or Sanity image source resolved server-side, description, matched seconds, matched label, and duration;
   - lesson: lesson slug/title, course title/slug, module title/index, lesson index/label, key points, and description.
4. Every result is tied to a real lesson and course. Video results match chapters before transcript chunks, and the model receives only filtered chunk matches rather than whole transcript arrays.
5. `/search?q=...` renders all returned results with a result count, default “Most relevant” sort, video/lesson visual distinction, clickable cards, a timestamp label for video results, and empty/error/loading states. Video cards link to `/lessons/{slug}?start={seconds}`; lesson cards link to `/lessons/{slug}`.
6. Search is usable from keyboard and mobile, and query state is reflected in the URL. Sorting is local and does not change the grounded result set.
7. No Sanity token, MCP URL, OpenAI key, raw GROQ, or unfiltered model payload reaches the browser.
8. Errors are safe and concise in responses; detailed secrets or provider payloads are not logged.

## Security considerations
- Use `server-only` for MCP/OpenAI helpers.
- Read `SANITY_API_READ_TOKEN` and `OPENAI_API_KEY` only on the server.
- Validate and bound user input with Zod.
- Treat model output as untrusted; validate it and generate links from validated slugs.
- Do not permit the model to return arbitrary external URLs or whole transcripts.
- Keep Context scope to course/lesson/instructor/category/video content, excluding progress and unrelated system documents.

## Acceptance criteria
- A natural-language query returns grounded video-moment and/or lesson cards when matching Sanity data exists.
- Video cards open the existing lesson page and preserve the matched start second.
- Lesson cards open the existing lesson page.
- No-match queries show a clear empty state with a link to `/courses`.
- Missing env/config or MCP/model errors produce a handled API error and user-facing error state.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass from the repository root.
- The live MCP endpoint is manually verified when credentials and a deployed Studio are available; if unavailable, report the exact blocker rather than claiming success.

## Manual test steps
1. Set `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_READ_TOKEN`, `OPENAI_API_KEY`, and optional `SANITY_CONTEXT_SLUG` in local env.
2. Ensure the Sanity Studio application is deployed and the Context document filter/instructions are published, or run against the base MCP URL.
3. Start the app with `npm run dev`.
4. Open `/search`, submit a query matching a known lesson topic, and confirm both result kinds render when available.
5. Click a video result and confirm the browser stays on `/lessons/...` and the YouTube player receives the `start` parameter.
6. Refresh `/search?q=<query>` and confirm the query/results load from the URL state.
7. Try a nonsense query and confirm the empty state links to `/courses`.
8. Test an empty/oversized query and a temporarily unavailable MCP/model configuration; confirm safe validation/error states.
9. Verify browser network payloads contain no Sanity or OpenAI credentials.
