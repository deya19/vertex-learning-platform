# Add PostHog product analytics for Vertex learning flows

## Goal
Add reliable, privacy-conscious PostHog custom events for the search and learning interactions that currently exist: successful search execution, result opening, result filtering, course-to-lesson navigation, video playback, watch-depth milestones, lesson completion inferred from video completion, lesson navigation, tab use, and resource opening.

Capture server-owned outcomes in server code and browser-owned interactions in client handlers. Correlate server and browser events to the existing Clerk/PostHog identity without sending personal profile fields in capture properties.

## Skills and guidance read
- `integration-nextjs-app-router` at `C:\Users\deyas\Desktop\vertex\.claude\skills\integration-nextjs-app-router\SKILL.md`.
- Its `references/1-begin.md`, `references/2-edit.md`, `references/3-revise.md`, `references/4-conclude.md`, `references/COMMANDMENTS.md`, and `references/EXAMPLE.md`.
- Repository rules in `AGENTS.md`.
- PostHog product analytics best-practice guidance: fixed lowercase event/property names, present-tense verbs, snake case, a consistent `category:object_action` event taxonomy, static property schemas, and custom events for durable business actions rather than duplicating every autocaptured click/pageview.
- Next.js 16.3.2 App Router `instrumentation-client.ts` convention was located under `node_modules/next/dist/docs`; direct tool reading is blocked by the repository ignore policy, so implementation will preserve the already-correct Next 15.3+ initialization pattern rather than guessing a replacement.

## Code inspected
- `package.json`: Next.js 16.3.2, React 19.2.8, `posthog-js` 1.422.5, and `posthog-node` 5.51.4 are installed; scripts include dev, lint, and build.
- `instrumentation-client.ts`: optional browser initialization through the `/ingest` proxy with current PostHog defaults, exception capture, and development debug behavior.
- `next.config.ts`: proxies `/ingest/static/*`, `/ingest/array/*`, and general `/ingest/*` requests.
- `components/PostHogIdentify.tsx`: identifies authenticated Clerk users and resets only on a signed-in to signed-out transition.
- `lib/posthog-server.ts`: optional singleton Node client with `flushAt: 1` and `flushInterval: 0`; it currently exposes no awaited capture helper.
- `app/layout.tsx`: mounts Clerk and the PostHog identity bridge.
- `app/search/search-results.tsx`: submits searches, currently captures `search_performed` in the browser, renders video and lesson cards, and filters results locally.
- `app/api/search/route.ts`: owns validated/rate-limited search execution, LLM/MCP work, canonical Sanity enrichment, and the successful result counts.
- `app/lessons/[slug]/lesson-player.tsx`: renders a YouTube privacy-enhanced iframe but does not enable or consume the YouTube Player API, so play, depth, and ended events are not currently observable.
- `app/lessons/[slug]/page.tsx`: resolves lesson/course/module context, accepts a generic `start` second, renders resources, tabs, and previous/next navigation.
- `app/lessons/[slug]/lesson-modules.tsx`: owns module expansion and lesson links.
- `app/courses/[slug]/course-actions.tsx` and `course-content.tsx`: contain older PostHog event names for course CTAs, bookmark clicks, module expansion, and lesson opening.
- `app/courses/[slug]/page.tsx`, `app/courses/page.tsx`, and `app/page.tsx`: course/detail/catalog entry surfaces; automatic PostHog pageview and autocapture already cover generic views and clicks.
- `sanity/lib/data.ts`: provides canonical, non-user-authored identifiers and lesson duration needed as event context.

## Current product limitations found
- There is no progress schema, progress API route, persisted resume position, My Learning implementation, or explicit complete-lesson action in the current tree.
- The current `start` query parameter is used by search video-moment links. Treating every nonzero `start` as “resume used” would produce false analytics.
- Therefore this change will not emit a `lesson:resume_use` event until a real persisted resume affordance exists. When that feature is added, capture it in its click handler with the lesson/course slugs and saved position; capture the successful progress write server-side separately.
- `lesson:complete` will mean the supported embedded video reached its ended state. It is an analytics event only and must not claim that learner progress was persisted.

## Decisions and assumptions
- Use fixed event names in PostHog’s recommended lowercase `category:object_action` form and snake-case properties.
- Replace the existing browser `search_performed` capture with one successful server-side `search:query_submit` event so the event represents completed server work and carries authoritative counts.
- Per the user’s explicit answer in the approval flow, `search:query_submit` may include the raw, trimmed, bounded search `query` even though arbitrary search text can contain PII. This is the only user-authored text allowed in capture properties. Do not attach query text to errors, exceptions, result-open events, or other events.
- Do not send Clerk email, name, IP address, lesson notes, descriptions, key points, resource titles, video URLs, provider payloads, error messages, or stack-derived request content. The identity bridge must identify with only the Clerk user ID.
- For authenticated server requests, use Clerk `userId` as PostHog `distinctId`. For anonymous requests, forward the initialized browser PostHog distinct/session IDs in dedicated headers so the server event remains correlated without using IP as analytics identity.
- Keep missing PostHog configuration optional: production remains a no-op and development reports the existing warning.
- Await server delivery before a route returns. Use the current `flushAt: 1`/`flushInterval: 0` client and an awaited flush helper; do not import `posthog-js` into server modules.
- Keep autocapture and automatic pageviews enabled. Do not add duplicate custom pageview events.
- Rename the small set of existing custom course events to the same taxonomy rather than retaining inconsistent names or double-capturing aliases. This intentionally starts new event series for those actions.
- Support YouTube analytics only because YouTube is the only playback provider implemented in the current player. Do not claim Vimeo or Bunny tracking support.
- Load and use the YouTube IFrame Player API without adding a dependency. Capture events from player callbacks/external-system synchronization, not from state-change effects.
- Emit watch-depth milestones once per player instance at 25, 50, 75, 90, and 100 percent based on the maximum observed position. Poll only while the player is playing and clean up timers/player instances.
- Keep event properties bounded and analytics-oriented: stable slugs/indices, provider, source, counts, duration/position seconds, depth percent, result rank/type, and booleans.

## Event plan
1. `search:query_submit` — server-side after a successful search response is assembled. Properties: approved raw `query`, `result_count`, `course_count`, `video_result_count`, `lesson_result_count`, `search_duration_ms`, and `is_authenticated`.
2. `search:result_open` — client-side in the result-card link handler. Properties: `result_type`, `result_rank`, `lesson_slug`, `course_slug`, and `matched_second` only for video results.
3. `search:sort_change` — client-side in the select handler. Properties: `sort_type`, `visible_result_count`, and `total_result_count`.
4. `course:continue_click` — normalize the existing Continue Learning CTA event. Properties: `course_slug`, `lesson_slug`, and `source` (`hero` or `sidebar`).
5. `course:bookmark_click` — normalize the presentational bookmark click. Properties: `course_slug`; name it as a click, not a successful persisted bookmark.
6. `course:lesson_open` — normalize lesson opening from course content. Properties: `course_slug`, `lesson_slug`, `module_index`, `lesson_index`, and `is_free_preview`.
7. `course:module_expand` — normalize course module expansion. Properties: `course_slug`, `module_count`, and `source`.
8. `lesson:module_expand` — client-side lesson-sidebar module expansion. Properties: `course_slug`, `lesson_slug`, and `module_index`.
9. `lesson:navigation_click` — client-side module-list and previous/next lesson navigation. Properties: `course_slug`, `lesson_slug`, `target_lesson_slug`, and `navigation_source`.
10. `lesson:tab_select` — client-side when a learner explicitly selects content or notes. Properties: `course_slug`, `lesson_slug`, and `tab_name`.
11. `lesson:resource_open` — client-side before opening a resource. Properties: `course_slug`, `lesson_slug`, `resource_type`, and `resource_index`; do not capture title, description, or URL.
12. `video:play` — client-side on the first transition to playing for a player instance. Properties: `provider`, `course_slug`, `lesson_slug`, `duration_seconds`, `start_second`, and `start_source` (`beginning`, `search`, or `direct_timestamp`).
13. `video:watch_depth_reach` — client-side once per 25/50/75/90/100 milestone. Properties: `provider`, `course_slug`, `lesson_slug`, `duration_seconds`, `position_seconds`, `watch_depth_percent`, and `start_source`.
14. `lesson:complete` — client-side once when the YouTube player reports ended. Properties: `provider`, `course_slug`, `lesson_slug`, and `duration_seconds`; this denotes video completion, not a persisted progress write.
15. `video:embed_unavailable` — client-side when the app cannot construct a supported player. Properties: `provider` (`unsupported`) plus `course_slug` and `lesson_slug`; no video URL.
16. `search:request_fail` — server-side for expected search operation failures with coarse `failure_type`, `http_status`, `is_authenticated`, and elapsed duration only. Do not include query, IP, exception message, or provider response.

## Expected files
- `components/PostHogIdentify.tsx`: keep Clerk/PostHog identity correlation while removing email and name person properties.
- `lib/posthog-server.ts`: add a guarded, awaited server capture helper and safe server analytics types/context handling.
- `app/api/search/route.ts`: obtain Clerk identity/correlation headers, capture authoritative success/failure events, and flush before returning.
- `app/search/search-results.tsx`: forward PostHog correlation headers, remove duplicate browser search capture, and add result-open/sort handlers.
- `app/lessons/[slug]/lesson-player.tsx`: integrate YouTube Player API lifecycle and playback/depth/completion events; add contextual props.
- `app/lessons/[slug]/page.tsx`: pass canonical context into the player and client-owned interaction components; classify search timestamp starts without calling them resume.
- `app/lessons/[slug]/lesson-modules.tsx`: add module and lesson navigation captures.
- A small lesson interaction client component only if needed to instrument tabs, resources, bookmark, and previous/next links without turning the whole server page into a client component.
- `app/courses/[slug]/course-actions.tsx` and `app/courses/[slug]/course-content.tsx`: normalize existing event names/properties and pass missing stable course context.
- `app/courses/[slug]/page.tsx`: pass course context required by course content.
- `.posthog-events.json`: create the skill-required temporary event plan during implementation, keep it synchronized with implemented events, then remove it at conclusion.
- Do not modify `instrumentation-client.ts`, `next.config.ts`, identity behavior, Sanity schemas, or environment variables unless verification proves a narrow change is required.

## Functional requirements
1. Every custom event name is a static lowercase `category:object_action` string; every custom property name is snake case.
2. A completed `/api/search` operation emits exactly one server `search:query_submit` event with authoritative counts and elapsed time, not a duplicate client event.
3. Search server captures correlate to Clerk user ID when signed in and to the browser PostHog identity/session when anonymous.
4. A result click emits `search:result_open` before navigation with accurate result type and zero-based or one-based rank documented consistently in code; use one-based rank for analyst readability.
5. YouTube play, depth, and ended states are obtained from the provider API rather than inferred from iframe clicks or wall-clock time.
6. Watch-depth milestones emit at most once each per player mount and do not continue polling while paused or after unmount.
7. Video-moment links identify their start source as search; generic timestamp links are not mislabeled as resume.
8. `lesson:complete` emits at most once per player mount when playback ends.
9. Existing course events use the new taxonomy and only stable, non-PII properties.
10. Tabs, resources, and lesson navigation are captured in their direct event handlers.
11. Missing PostHog configuration does not break production, search responses, video playback, or navigation.
12. Analytics failures never change the user-visible result of a search or interaction.
13. No event property contains Clerk email/name, IP, content bodies, resource URLs, video URLs, or error messages. The raw search query is the single user-approved exception.
14. No `lesson:resume_use` event is emitted until a real resume affordance backed by saved progress exists.
15. Preserve all unrelated local work already present in the modified worktree.

## Security and privacy considerations
- Keep `posthog-node` server-only and `posthog-js` browser-only.
- Do not expose private PostHog keys; continue using the public project token already configured for ingestion.
- Do not use request IP as a PostHog distinct ID or event property.
- Validate correlation headers as bounded strings before use; fall back to Clerk ID or an anonymous server-safe identifier without accepting unbounded input.
- Never let analytics capture or flush failures fail the search request.
- Never include secrets, model prompts, MCP payloads, GROQ, provider errors, or Sanity tokens in events/exceptions.
- The user explicitly chose raw query capture after being warned that free-form search can contain PII; document this exception in the final report.

## Acceptance criteria
- Search success is captured server-side once with raw query, result breakdown, course count, duration, and correlated identity.
- Search result opening and sorting emit accurate client events.
- Playing a YouTube lesson emits one play event, milestone events at reached thresholds, and one completion event on ended.
- Timestamp starts from search are classified as search, not resume.
- Course, lesson navigation, tabs, and resource actions use the documented event taxonomy and safe properties.
- No fake resume or persisted-completion claims are introduced while progress storage is absent.
- `npx tsc --noEmit` passes.
- ESLint passes for all touched files; run the repository lint script if file-scoped invocation is not reliable.
- `npm run build` passes because a server route and client integration are changed.
- The dev server renders search/course/lesson pages and video playback remains functional.
- If PostHog credentials, network access, or a non-bot browser session are unavailable, report that exact limitation instead of claiming live event ingestion.

## Checks
1. Create and maintain the temporary `.posthog-events.json` plan required by the PostHog skill.
2. Run `npx tsc --noEmit`.
3. Run ESLint on touched files, followed by `npm run lint` if needed for repository policy.
4. Run `npm run build`.
5. Start `npm run dev` and check `/search`, a course detail page, and a YouTube lesson page.
6. Inspect browser console/network with `?__posthog_debug=true`; account for PostHog’s automated-browser bot filtering before judging ingestion.
7. Confirm `/ingest` requests remain functional and analytics failures do not affect app responses.
8. Review the final diff specifically for raw/user-authored content, profile PII, IPs, URLs, error text, secrets, duplicate events, timer cleanup, and modifications to pre-existing user work.
9. No PostHog MCP server is configured in this environment, so dashboard/notebook creation from the skill cannot be performed unless that integration becomes available; report this rather than fabricating links.

## Exact manual test steps
1. Configure the existing `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and host values locally, then run `npm run dev`.
2. Open the app in a normal non-automated browser with `?__posthog_debug=true`, sign in with Clerk, and confirm PostHog’s distinct ID is the Clerk user ID.
3. Open `/search`, submit a known query, and confirm one `search:query_submit` arrives from the server with the approved raw query, counts, duration, and no other user-authored fields.
4. Repeat signed out and confirm the server event correlates to the browser anonymous identity rather than an IP address.
5. Click one lesson result and one video result; confirm `search:result_open` reports `lesson` and `video`, accurate one-based ranks, stable slugs, and matched second only for video.
6. Change the result select between Most Relevant, Lessons, and Video moments; confirm `search:sort_change` reports the selected value and counts.
7. Open a course, use both Continue Learning locations, open a lesson, expand course modules, and click the bookmark; confirm the normalized `course:*` events and sources.
8. On a lesson, expand a sidebar module, open another lesson, select both tabs, open a resource, and use previous/next navigation; confirm the relevant `lesson:*` events contain no content text or URLs.
9. Play a YouTube lesson from the beginning, pause/resume, and cross 25%, 50%, 75%, 90%, and the ended state. Confirm one `video:play`, one event per depth milestone, and one `lesson:complete`, with no duplicate milestones after seeking backward.
10. Open a search video-moment result and confirm `start_source` is `search`; open a manual `?start=<seconds>` URL without the search source and confirm it is `direct_timestamp`, never resume.
11. Navigate away during playback and confirm no watch polling/events continue from the unmounted player.
12. Remove or invalidate PostHog configuration in a production-mode check and confirm the app remains usable while analytics becomes a no-op.
13. Inspect all emitted custom properties and verify that the raw query is the only user-authored text and that no email, name, IP, resource/video URL, content body, or error message is present.
